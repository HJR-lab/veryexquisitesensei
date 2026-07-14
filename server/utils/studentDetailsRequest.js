const crypto = require('crypto');

/**
 * Create student-details requests for the "+dup" placeholder customers of a
 * multi-spot order and email the purchaser ONE tokenized form link covering
 * all of them (qty 4 → 3 extra students → one email, one form with 3 sections).
 *
 * Idempotent per placeholder: placeholders that already have a request are
 * skipped, and the email is only sent when at least one NEW request was
 * created (re-syncs are common and must not re-email the purchaser).
 * Never throws — a failure here must not break order processing.
 *
 * @param {Object} params
 * @param {Array<{id: number}>} params.placeholders - extra-pax placeholder customer rows
 * @param {string} params.purchaserEmail
 * @param {string} [params.purchaserFirstName]
 * @param {string} [params.courseTitle]
 * @param {string} [params.orderId] - Shopify order id, groups the form's sections
 */
async function createStudentDetailsRequests({ placeholders, purchaserEmail, purchaserFirstName, courseTitle, orderId }) {
  try {
    if (!placeholders || placeholders.length === 0 || !purchaserEmail) return { skipped: true };

    const { supabase } = require('./supabaseDb');
    const { sendEmail } = require('./emailService');

    const ids = placeholders.map(p => p.id);
    const { data: existing } = await supabase
      .from('student_detail_requests')
      .select('placeholder_customer_id')
      .in('placeholder_customer_id', ids);
    const existingSet = new Set((existing || []).map(r => r.placeholder_customer_id));

    const fresh = ids.filter(id => !existingSet.has(id));
    if (fresh.length === 0) return { skipped: true, reason: 'all placeholders already have requests' };

    const rows = fresh.map(id => ({
      token: crypto.randomBytes(24).toString('hex'),
      placeholder_customer_id: id,
      purchaser_email: purchaserEmail,
      course_title: courseTitle || null,
      shopify_order_id: orderId ? String(orderId) : null,
    }));
    const { error: insertError } = await supabase.from('student_detail_requests').insert(rows);
    if (insertError) throw insertError;

    // One link covers the whole order: the form loads every pending sibling
    // request (same order + purchaser) alongside the token's own.
    const baseUrl = process.env.FRONTEND_URL || 'https://club.ves.sg';
    const formUrl = `${baseUrl}/student-details/${rows[0].token}`;

    // Count ALL open spots for the email copy (fresh + still-pending existing)
    const studentCount = fresh.length + existingSet.size;

    const template = require('../email-templates/student-details-request');
    const { subject, html } = template.generate({ purchaserFirstName, courseTitle, formUrl, studentCount });

    const result = await sendEmail({ to: purchaserEmail, subject, html });
    if (!result.success) {
      console.error(`[StudentDetails] Email to ${purchaserEmail} failed: ${result.error} (form link: ${formUrl})`);
    } else {
      console.log(`[StudentDetails] Details request (${fresh.length} student${fresh.length > 1 ? 's' : ''}) sent to ${purchaserEmail}`);
    }
    return { success: result.success, formUrl, requestCount: fresh.length };
  } catch (err) {
    console.error('[StudentDetails] Failed to create details requests:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { createStudentDetailsRequests };
