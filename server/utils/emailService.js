const { Resend } = require('resend');
const { rewriteLocalLinks } = require('./publicUrl');

const INBOX_EMAIL = 'info@ves.sg';
const INBOX_ADDRESS = `VES Studio <${INBOX_EMAIL}>`;

// Sends as the studio's real inbox. Until 2026-09-10 this was
// info@mail.ves.sg — the Resend SENDING subdomain, which nothing accepts mail
// at. That made every bulk send (course details, membership, reschedules —
// anything routed through sendAndLogEmail, which puts recipients in BCC)
// report as bounced even though the BCC recipients received it, inflating the
// bounce rate and burying the bounces that actually mean something. The root
// domain is now verified in Resend (DKIM at resend._domainkey.ves.sg, SPF and
// return-path at send.ves.sg), so From, the studio copy and Reply-To are all
// the one mailbox that really exists.
const FROM_ADDRESS = INBOX_ADDRESS;

// Explicit rather than dropped: callers may pass their own From, and a reply
// must still land in the studio inbox when they do.
const REPLY_TO_ADDRESS = INBOX_EMAIL;

/** Bare address out of either `a@b.com` or `Name <a@b.com>`. */
function bareAddress(address) {
  const match = String(address || '').match(/<([^>]+)>/);
  return (match ? match[1] : String(address || '')).trim().toLowerCase();
}

// A multi-spot order gives each extra student a placeholder account whose
// address is the purchaser's with "+dup" (or "+dup2", "+dup3"…) spliced in,
// until the purchaser fills in the student-details form. That address is not
// the student's: mail to it lands with the purchaser, or bounces at providers
// without plus-addressing (and a bounce suppresses it for good). So nothing is
// ever sent to one. The student gets their own onboarding email once their
// real address is known (utils/studentOnboarding.js).
function isPlaceholderAddress(address) {
  return /\+dup\d*@/i.test(bareAddress(address));
}

// Temporarily paused automated email categories. Override via the
// PAUSED_EMAIL_CATEGORIES env var (comma-separated) or set it to an empty
// string to resume all. Only gates AUTOMATED sends — admin-initiated
// (manual) emails always go through.
const PAUSED_EMAIL_CATEGORIES = new Set(
  (process.env.PAUSED_EMAIL_CATEGORIES ?? 'credits,waitlist,vouchers,continuation')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
);

/**
 * Whether an automated email category is currently paused.
 * @param {string} category e.g. 'credits' | 'waitlist' | 'vouchers'
 */
function isEmailCategoryPaused(category) {
  return PAUSED_EMAIL_CATEGORIES.has(String(category || '').toLowerCase());
}

let _resend;
function getResend() {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[Email] RESEND_API_KEY not set — emails will not be sent');
      return null;
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

/**
 * The Resend payload for one message, minus the body. Pure, so the addressing
 * rules can be asserted without sending anything.
 */
function buildEnvelope({ to, cc, bcc, subject, replyTo }) {
  const envelope = {
    from: FROM_ADDRESS,
    to: to || INBOX_ADDRESS,
    subject,
    // The Resend SDK reads `replyTo` and maps it to the wire field itself; a
    // `reply_to` key here is silently dropped.
    replyTo: replyTo || REPLY_TO_ADDRESS,
  };
  if (cc && cc.length > 0) envelope.cc = cc;
  if (bcc && bcc.length > 0) envelope.bcc = bcc;
  return envelope;
}

/**
 * Who a logged send is addressed to, and who is merely copied.
 *
 * BCC exists to stop a cohort blast leaking seven students' addresses to each
 * other. It costs something, though: the message then reads as addressed to the
 * studio, which is wrong for a "Dear Doreen" reschedule notice and looks, in the
 * studio's own inbox, like the student was never written to at all. So hide
 * recipients only when there is more than one of them.
 */
function resolveAddressing(recipientEmails) {
  const recipients = (Array.isArray(recipientEmails) ? recipientEmails : [recipientEmails]).filter(Boolean);
  const only = recipients.length === 1 ? recipients[0] : null;

  // A studio-facing notice BCC'd to itself would arrive twice.
  if (only && bareAddress(only) === INBOX_EMAIL) {
    return { recipients, to: INBOX_ADDRESS, bcc: undefined };
  }
  if (only) {
    return { recipients, to: only, bcc: [INBOX_ADDRESS] }; // the studio still keeps its copy
  }
  return { recipients, to: INBOX_ADDRESS, bcc: recipients };
}

/**
 * Send an email via Resend
 */
// A hard bounce puts an address on Resend's suppression list permanently.
// Every later message to it is discarded inside Resend, which still answers
// success — so the app wrote a sent_emails row claiming a customer had been
// mailed when nothing left the building. The daily anomaly probe reports the
// dead address once a day, but until this guard nothing stopped the next send:
// Sheena Lim (#3299) lost her class-reschedule email three hours after the
// probe had already flagged her.
//
// Pure, so the decision is testable without touching Resend. `suppressed` is a
// Set of lowercased addresses, or null when the list could not be fetched —
// null means send anyway. Blocking all studio mail because an auxiliary
// endpoint is down would be far worse than the problem this guards against.
//
// Returns the envelope minus any dead addresses, plus `blocked`: true when
// every customer-facing recipient is suppressed and the send would reach
// nobody. The studio's own inbox never counts as customer-facing, so a
// studio-only notice is never blocked and a suppressed studio address cannot
// block real student mail.
//
// Multi-spot placeholders ("buyer+dup@…") are dropped the same way, whether or
// not the suppression list could be fetched: they are not the student's
// address, and they are reported separately in `placeholders`.
function partitionSuppressed({ to, cc, bcc, suppressed }) {
  const everyoneIn = [to, ...(cc || []), ...(bcc || [])].filter(Boolean);
  if (!suppressed && !everyoneIn.some(isPlaceholderAddress)) {
    return { to, cc, bcc, dropped: [], placeholders: [], blocked: false };
  }

  const isSuppressed = (addr) =>
    isPlaceholderAddress(addr) || Boolean(suppressed && suppressed.has(bareAddress(addr)));
  const isStudio = (addr) => bareAddress(addr) === INBOX_EMAIL;

  const dropped = [];
  const keep = (list) => {
    if (!list) return list;
    const kept = [];
    for (const addr of list) {
      if (isSuppressed(addr)) dropped.push(bareAddress(addr));
      else kept.push(addr);
    }
    return kept;
  };

  const toIsSuppressed = Boolean(to) && isSuppressed(to);
  if (toIsSuppressed) dropped.push(bareAddress(to));

  const nextCc = keep(cc);
  const nextBcc = keep(bcc);

  const everyone = [to, ...(cc || []), ...(bcc || [])].filter(Boolean);
  const customers = everyone.filter(addr => !isStudio(addr));
  const reachable = customers.filter(addr => !isSuppressed(addr));

  return {
    // Dropping a dead To leaves buildEnvelope to fall back to the studio inbox,
    // which is right when other recipients survive on cc/bcc.
    to: toIsSuppressed ? undefined : to,
    cc: nextCc,
    bcc: nextBcc,
    dropped,
    placeholders: dropped.filter(isPlaceholderAddress),
    blocked: customers.length > 0 && reachable.length === 0,
  };
}

// Resend's suppression list, cached briefly so the guard costs one call per
// few minutes rather than one per message. Returns null on any failure, which
// partitionSuppressed reads as "send anyway".
const SUPPRESSION_TTL_MS = 5 * 60 * 1000;
const SUPPRESSION_PAGE = 100;
let _suppressionCache = { addresses: null, fetchedAt: 0 };

async function getSuppressedAddresses() {
  if (_suppressionCache.addresses && Date.now() - _suppressionCache.fetchedAt < SUPPRESSION_TTL_MS) {
    return _suppressionCache.addresses;
  }
  if (!process.env.RESEND_API_KEY) return null;

  try {
    const res = await fetch(`https://api.resend.com/suppressions?limit=${SUPPRESSION_PAGE}`, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(5000), // never let this stall a send
    });
    if (!res.ok) {
      console.warn(`[Email] Suppression list unavailable (HTTP ${res.status}) — sending without the check`);
      return null;
    }
    const rows = (await res.json()).data || [];
    if (rows.length >= SUPPRESSION_PAGE) {
      console.warn(`[Email] Suppression list hit the ${SUPPRESSION_PAGE}-row page limit — paginate this before it under-reports`);
    }
    const addresses = new Set(rows.map(r => String(r.email).toLowerCase()));
    _suppressionCache = { addresses, fetchedAt: Date.now() };
    return addresses;
  } catch (err) {
    console.warn(`[Email] Suppression list fetch failed (${err.message}) — sending without the check`);
    return null;
  }
}

async function sendEmail({ to, cc, bcc, subject, html, replyTo }) {
  try {
    const resend = getResend();
    if (!resend) {
      console.warn(`[Email] Skipping "${subject}" — no API key configured`);
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    // Backstop: a dev server run against production data sends REAL mail, so a
    // laptop-only link must never reach a customer's inbox. Catches hardcoded
    // links and any call site that bypassed publicBaseUrl().
    const { html: safeHtml, rewritten } = rewriteLocalLinks(html);
    if (rewritten.length > 0) {
      console.warn(
        `[Email] Rewrote ${rewritten.length} local link(s) in "${subject}" before sending:\n  ` +
        rewritten.join('\n  ')
      );
    }

    // Never spend a send on an address Resend will discard, and never let that
    // discard be recorded as a delivery: returning success:false here keeps
    // sendAndLogEmail from writing a sent_emails row that claims otherwise.
    const guard = partitionSuppressed({ to, cc, bcc, suppressed: await getSuppressedAddresses() });
    const deadDropped = guard.dropped.filter(a => !guard.placeholders.includes(a));
    if (guard.placeholders.length > 0) {
      console.log(`[Email] Skipped multi-spot placeholder recipient(s) on "${subject}": ${guard.placeholders.join(', ')}`);
    }
    if (deadDropped.length > 0) {
      console.warn(`[Email] Dropped suppressed recipient(s) from "${subject}": ${deadDropped.join(', ')}`);
    }
    if (guard.blocked && deadDropped.length === 0) {
      return { success: false, error: 'placeholder', placeholder: true };
    }
    if (guard.blocked) {
      console.warn(
        `[Email] NOT SENDING "${subject}" — every recipient is suppressed: ${guard.dropped.join(', ')}. ` +
        'Correct the address with scripts/fix-undeliverable-email.js. Lifting the suppression just bounces again.'
      );
      return { success: false, error: 'suppressed', suppressed: true, suppressedRecipients: guard.dropped };
    }

    const payload = {
      ...buildEnvelope({ to: guard.to, cc: guard.cc, bcc: guard.bcc, subject, replyTo }),
      html: safeHtml,
    };

    const { data, error } = await resend.emails.send(payload);

    if (error) {
      console.error('[Email] Send failed:', error);
      return { success: false, error: error.message };
    }

    const audience = payload.bcc
      ? `${payload.to} + ${payload.bcc.length} bcc`
      : payload.to;
    console.log(`[Email] Sent "${subject}" to ${audience} (ID: ${data.id})`);
    return { success: true, messageId: data.id };
  } catch (err) {
    console.error('[Email] Send error:', err);
    return { success: false, error: err.message };
  }
}

/** Resend accepts up to 100 distinct messages in one batch request. */
const BATCH_LIMIT = 100;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * One message per student — no shared BCC, no studio copy.
 *
 * resolveAddressing hides a cohort's addresses from each other by putting the
 * students in BCC, which means the message reads as addressed to VES: wrong for
 * a "Dear Doreen" confirmation, and it lands a duplicate in the studio inbox for
 * every send. Writing to each student individually is the only way to have the
 * To line say what the greeting says. Resend's batch endpoint sends the whole
 * cohort in a single request, so this costs one API call rather than N and stays
 * clear of the 2 req/s rate limit; only the billed recipient count goes up.
 *
 * @returns {Promise<Array<{email: string, success: boolean, messageId?: string, error?: string}>>}
 */
async function sendPerRecipient({ subject, html, recipients, replyTo }) {
  const resend = getResend();
  if (!resend) {
    console.warn(`[Email] Skipping "${subject}" — no API key configured`);
    return recipients.map(email => ({ email, success: false, error: 'RESEND_API_KEY not configured' }));
  }

  const { html: safeHtml, rewritten } = rewriteLocalLinks(html);
  if (rewritten.length > 0) {
    console.warn(
      `[Email] Rewrote ${rewritten.length} local link(s) in "${subject}" before sending:\n  ` +
      rewritten.join('\n  ')
    );
  }

  // The same guard sendEmail applies, repeated here because the batch endpoint
  // is called directly and never passes through it. Every customer class email
  // (course_details, course_unconfirmed) takes this path, so leaving it out left
  // the exact bug this was written for wide open. Each recipient is its own
  // message, so a dead address is simply dropped from the batch and reported as
  // failed; sendAndLogPerRecipient only writes a sent_emails row for a success,
  // which is what stops a discarded send being recorded as a delivery.
  const suppressed = await getSuppressedAddresses();
  const results = [];
  let deliverable = recipients;

  const placeholders = deliverable.filter(isPlaceholderAddress);
  if (placeholders.length > 0) {
    for (const email of placeholders) results.push({ email, success: false, error: 'placeholder', placeholder: true });
    deliverable = deliverable.filter(email => !isPlaceholderAddress(email));
    console.log(`[Email] Skipped multi-spot placeholder recipient(s) on "${subject}": ${placeholders.join(', ')}`);
  }

  if (suppressed) {
    const before = results.length;
    const remaining = deliverable;
    deliverable = [];
    for (const email of remaining) {
      if (suppressed.has(bareAddress(email))) {
        results.push({ email, success: false, error: 'suppressed', suppressed: true });
      } else {
        deliverable.push(email);
      }
    }
    if (results.length > before) {
      console.warn(
        `[Email] Dropped suppressed recipient(s) from "${subject}": ${results.slice(before).map(r => r.email).join(', ')}. ` +
        'Correct the address with scripts/fix-undeliverable-email.js. Lifting the suppression just bounces again.'
      );
    }
  }

  for (let i = 0; i < deliverable.length; i += BATCH_LIMIT) {
    const chunk = deliverable.slice(i, i + BATCH_LIMIT);
    let sent = null;

    try {
      const payloads = chunk.map(email => ({
        ...buildEnvelope({ to: email, subject, replyTo }),
        html: safeHtml,
      }));
      const { data, error } = await resend.batch.send(payloads);
      if (error) throw new Error(error.message);
      sent = data?.data || [];
    } catch (err) {
      // A batch is all-or-nothing, so one bad address would drop the whole
      // cohort. Fall back to sending them one at a time instead.
      console.warn(`[Email] Batch send failed (${err.message}) — retrying one request per recipient`);
      sent = null;
    }

    if (sent && sent.length === chunk.length) {
      chunk.forEach((email, idx) => results.push({ email, success: true, messageId: sent[idx].id }));
      console.log(`[Email] Sent "${subject}" individually to ${chunk.length} recipient(s)`);
      continue;
    }

    for (const [idx, email] of chunk.entries()) {
      const result = await sendEmail({ to: email, subject, html: safeHtml, replyTo });
      results.push({ email, success: result.success, messageId: result.messageId, error: result.error });
      if (idx < chunk.length - 1) await sleep(600); // Resend allows 2 requests/second
    }
  }

  return results;
}

/**
 * Send and log a course-related email.
 *
 * @param {boolean} [perRecipient] Send each student their own copy, with no
 *   studio BCC, and log one history row per student.
 */
async function sendAndLogEmail({ emailType, courseIdentifier, subject, html, recipientEmails, sentBy, perRecipient = false }) {
  if (perRecipient) {
    return sendAndLogPerRecipient({ emailType, courseIdentifier, subject, html, recipientEmails, sentBy });
  }

  const { recipients, to, bcc } = resolveAddressing(recipientEmails);

  const result = await sendEmail({ to, bcc, subject, html });

  if (result.success) {
    const { supabase } = require('./supabaseDb');
    await supabase.from('sent_emails').insert({
      email_type: emailType,
      course_identifier: courseIdentifier,
      subject,
      recipient_count: recipients.length,
      recipient_emails: recipients,
      sent_by: sentBy || 'system',
      resend_message_id: result.messageId,
    });
  }

  return result;
}

/**
 * Send one copy per student and record each send separately, so the history
 * carries a real per-student Resend message id to chase a bounce with.
 */
async function sendAndLogPerRecipient({ emailType, courseIdentifier, subject, html, recipientEmails, sentBy }) {
  const recipients = (Array.isArray(recipientEmails) ? recipientEmails : [recipientEmails]).filter(Boolean);
  const results = await sendPerRecipient({ subject, html, recipients });

  const delivered = results.filter(r => r.success);
  const failedRecipients = results
    .filter(r => !r.success)
    .map(r => ({ email: r.email, error: r.error }));

  if (delivered.length > 0) {
    const { supabase } = require('./supabaseDb');
    await supabase.from('sent_emails').insert(delivered.map(r => ({
      email_type: emailType,
      course_identifier: courseIdentifier,
      subject,
      recipient_count: 1,
      recipient_emails: [r.email],
      sent_by: sentBy || 'system',
      resend_message_id: r.messageId,
    })));
  }

  return {
    success: delivered.length > 0,
    messageId: delivered[0]?.messageId,
    sentCount: delivered.length,
    failedRecipients,
    error: failedRecipients.length > 0
      ? failedRecipients.map(f => `${f.email}: ${f.error}`).join('; ')
      : undefined,
  };
}

/**
 * Detect which email template to use for a course enrollment
 */
function detectCourseTemplate(enrollment) {
  const { course_type, number_of_weeks, course_identifier } = enrollment;
  const title = (enrollment.product_title || '').toLowerCase();

  if (title.includes('kids') || title.includes('play with clay')) return 'kids-clay';
  if (course_type && course_type.toLowerCase().includes('handbuilding')) {
    return number_of_weeks <= 4 ? 'hb-4credit' : 'hb-8credit';
  }
  // A "10 Classes NO EXPIRY" package is a 6-week WT cohort + 4 flex credits, so its
  // course_details email describes the 6-week schedule — use wt-6week, never wt-10class.
  if (number_of_weeks === 10) return 'wt-6week';
  if (number_of_weeks >= 18) return 'wt-3x6week';
  if (number_of_weeks === 7) return 'wt-7week-inter';
  return 'wt-6week';
}

/**
 * Detect which course-details template a SPECIFIC student should receive,
 * based on their own enrollment. Unlike detectCourseTemplate (which describes
 * the cohort's schedule), this is package-aware: 10-Class and 3x6-week package
 * students get the template that explains their package on top of the shared
 * 6-week cohort schedule. Package identity lives in package_* columns — a 3x
 * package enrollment has number_of_weeks=6, so weeks alone cannot detect it.
 */
function detectStudentTemplate(enrollment) {
  const title = (enrollment.course_title || enrollment.product_title || '').toLowerCase();

  if (enrollment.package_total_classes === 10 || title.includes('10 class')) return 'wt-10class';
  if (enrollment.package_total_courses === 3 || enrollment.package_total_classes === 18 || title.includes('3 course')) return 'wt-3x6week';
  return detectCourseTemplate(enrollment);
}

module.exports = { sendEmail, sendAndLogEmail, sendPerRecipient, detectCourseTemplate, detectStudentTemplate, isEmailCategoryPaused, buildEnvelope, resolveAddressing, partitionSuppressed, getSuppressedAddresses, isPlaceholderAddress, FROM_ADDRESS, INBOX_ADDRESS, INBOX_EMAIL, REPLY_TO_ADDRESS };
