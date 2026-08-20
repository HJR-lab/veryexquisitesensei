/**
 * One way to tell the studio something needs doing.
 *
 * Before this, studio-facing alerts were six hand-rolled sendEmail() calls
 * scattered across cohort processing, the continuation sweep and the pieces
 * routes — each with its own markup, its own recipient literal, and no way to
 * mute or de-duplicate any of them. The failure that motivated it was quieter
 * than a bug: a student booked a collection and NOTHING told anyone, because
 * writing that alert had never been anybody's job.
 *
 * Three properties matter more than the formatting:
 *
 *  1. It cannot throw. A studio notice rides along with a student's action —
 *     scheduling a pickup, uploading a receipt. If the notice fails, the thing
 *     the student did must still succeed. Every failure here is logged and
 *     swallowed.
 *
 *  2. It de-duplicates. Anything that can retry can spam, and an inbox that
 *     cries wolf gets filtered, which is worse than no alert at all. A notice
 *     with the same kind and reference inside the dedupe window is dropped.
 *
 *  3. It can be muted per kind, via STUDIO_NOTICES_MUTED, without touching the
 *     call sites — the same lever PAUSED_EMAIL_CATEGORIES gives customer mail.
 */

const { sendAndLogEmail } = require('./emailService');
const { publicBaseUrl } = require('./publicUrl');
const studioNotice = require('../email-templates/studio-notice');

const RECIPIENT = process.env.STUDIO_NOTICE_EMAIL || 'info@ves.sg';

const MUTED = new Set(
  (process.env.STUDIO_NOTICES_MUTED || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
);

// Long enough that a retry loop cannot spam, short enough that a genuine
// repeat the next day still lands.
const DEFAULT_DEDUPE_HOURS = 12;

function emailTypeFor(kind) {
  return `studio-${kind}`;
}

/**
 * Has this exact notice already gone out recently?
 *
 * Uses sent_emails rather than a new table: every send is logged there anyway,
 * with course_identifier free to carry our reference. A dedupe check that
 * fails open — on a query error we send — because a duplicate alert is a far
 * smaller problem than a missing one.
 */
async function recentlySent(kind, reference, hours) {
  if (!reference) return false;
  try {
    const { supabase } = require('./supabaseDb');
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from('sent_emails')
      .select('id')
      .eq('email_type', emailTypeFor(kind))
      .eq('course_identifier', reference)
      .gte('sent_at', since)
      .limit(1);
    if (error) return false;
    return (data || []).length > 0;
  } catch {
    return false;
  }
}

/**
 * Tell the studio something happened.
 *
 * @param {object} notice
 * @param {string} notice.kind        stable slug, e.g. 'pickup-booked'
 * @param {string} notice.subject     email subject, already human-readable
 * @param {string} notice.headline    heading inside the email
 * @param {Array<{label:string,value:*}>} [notice.facts]  the who/what/when table
 * @param {string} [notice.body]      one paragraph saying what to do
 * @param {string} [notice.actionLabel]
 * @param {string} [notice.actionPath] app-relative, e.g. '/admin/pieces'
 * @param {string} [notice.reference] dedupe key, e.g. 'batch-25'
 * @param {'normal'|'high'} [notice.urgency]
 * @param {number} [notice.dedupeHours]
 * @returns {Promise<{sent:boolean, reason?:string}>} never rejects
 */
async function notifyStudio(notice) {
  const {
    kind, subject, headline, facts, body,
    actionLabel, actionPath, reference,
    urgency = 'normal', dedupeHours = DEFAULT_DEDUPE_HOURS, footnote,
  } = notice || {};

  try {
    if (!kind || !subject || !headline) {
      console.error('[StudioNotifier] ignoring malformed notice:', JSON.stringify(notice));
      return { sent: false, reason: 'malformed' };
    }

    if (MUTED.has(String(kind).toLowerCase())) {
      return { sent: false, reason: 'muted' };
    }

    if (await recentlySent(kind, reference, dedupeHours)) {
      console.log(`[StudioNotifier] ${kind}/${reference} already sent within ${dedupeHours}h — skipping`);
      return { sent: false, reason: 'duplicate' };
    }

    const html = studioNotice.generate({
      headline,
      facts,
      body,
      actionLabel,
      actionUrl: actionPath ? `${publicBaseUrl()}${actionPath}` : null,
      urgency,
      footnote,
    });

    const result = await sendAndLogEmail({
      emailType: emailTypeFor(kind),
      courseIdentifier: reference || null,
      subject,
      html,
      recipientEmails: [RECIPIENT],
      sentBy: 'studio-notifier',
    });

    return { sent: Boolean(result.success), reason: result.success ? undefined : 'send-failed' };
  } catch (err) {
    // Deliberately terminal. The caller is mid-way through something a student
    // asked for; it must not fail because we could not send an internal email.
    console.error(`[StudioNotifier] ${kind || 'unknown'} failed:`, err.message);
    return { sent: false, reason: 'error' };
  }
}

module.exports = { notifyStudio, RECIPIENT, emailTypeFor };
