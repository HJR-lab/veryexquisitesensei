const { Resend } = require('resend');

const FROM_ADDRESS = 'VES Studio <info@mail.ves.sg>';

// Temporarily paused automated email categories. Override via the
// PAUSED_EMAIL_CATEGORIES env var (comma-separated) or set it to an empty
// string to resume all. Only gates AUTOMATED sends — admin-initiated
// (manual) emails always go through.
const PAUSED_EMAIL_CATEGORIES = new Set(
  (process.env.PAUSED_EMAIL_CATEGORIES ?? 'credits,waitlist,vouchers')
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
 * Send an email via Resend
 */
async function sendEmail({ to, bcc, subject, html, replyTo }) {
  try {
    const resend = getResend();
    if (!resend) {
      console.warn(`[Email] Skipping "${subject}" — no API key configured`);
      return { success: false, error: 'RESEND_API_KEY not configured' };
    }

    const payload = {
      from: FROM_ADDRESS,
      to: to || FROM_ADDRESS,
      subject,
      html,
    };
    if (bcc && bcc.length > 0) payload.bcc = bcc;
    if (replyTo) payload.reply_to = replyTo;

    const { data, error } = await resend.emails.send(payload);

    if (error) {
      console.error('[Email] Send failed:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Sent "${subject}" to ${bcc ? bcc.length + ' recipients' : to} (ID: ${data.id})`);
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
  const result = await sendEmail({
    to: FROM_ADDRESS,
    bcc: recipientEmails,
    subject,
    html,
  });

  if (result.success) {
    const { supabase } = require('./supabaseDb');
    await supabase.from('sent_emails').insert({
      email_type: emailType,
      course_identifier: courseIdentifier,
      subject,
      recipient_count: recipientEmails.length,
      recipient_emails: recipientEmails,
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
  if (number_of_weeks === 10) return 'wt-10class';
  if (number_of_weeks >= 18) return 'wt-3x6week';
  if (number_of_weeks === 7) return 'wt-7week-inter';
  return 'wt-6week';
}

module.exports = { sendEmail, sendAndLogEmail, detectCourseTemplate, isEmailCategoryPaused, FROM_ADDRESS };
