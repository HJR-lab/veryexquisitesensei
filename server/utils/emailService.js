const { Resend } = require('resend');
const { rewriteLocalLinks } = require('./publicUrl');

const FROM_ADDRESS = 'VES Studio <info@mail.ves.sg>';

// mail.ves.sg is the Resend SENDING subdomain — correct in From, but nothing
// accepts mail there. Addressing the studio copy to it made every bulk send
// (course details, membership, reschedules — anything routed through
// sendAndLogEmail, which puts recipients in BCC) report as bounced even though
// the BCC recipients received it. That inflates the bounce rate, erodes domain
// reputation, and buries the bounces that actually mean something. The studio
// copy goes to the real inbox instead.
const INBOX_EMAIL = 'info@ves.sg';
const INBOX_ADDRESS = `VES Studio <${INBOX_EMAIL}>`;

// Nothing accepts mail at FROM_ADDRESS, so without this every student who hit
// Reply was writing to a mailbox that does not exist.
const REPLY_TO_ADDRESS = INBOX_EMAIL;

/** Bare address out of either `a@b.com` or `Name <a@b.com>`. */
function bareAddress(address) {
  const match = String(address || '').match(/<([^>]+)>/);
  return (match ? match[1] : String(address || '')).trim().toLowerCase();
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

    const payload = { ...buildEnvelope({ to, cc, bcc, subject, replyTo }), html: safeHtml };

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

/**
 * Send and log a course-related email
 */
async function sendAndLogEmail({ emailType, courseIdentifier, subject, html, recipientEmails, sentBy }) {
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

module.exports = { sendEmail, sendAndLogEmail, detectCourseTemplate, detectStudentTemplate, isEmailCategoryPaused, buildEnvelope, resolveAddressing, FROM_ADDRESS, INBOX_ADDRESS, INBOX_EMAIL, REPLY_TO_ADDRESS };
