const { publicBaseUrl } = require('./publicUrl');

/**
 * Onboard the "+1" student on a multi-spot order once the purchaser has filled
 * in their details (routes/studentDetails.js).
 *
 * Until then the student was a placeholder with a "+dup" address that the
 * email service refuses to send to, so they have heard nothing from VES:
 *   1. A welcome email: who booked them, what, and how to sign in.
 *   2. For each handbuilding enrollment, the HB course-details email. HB sends
 *      this at order time, which for a placeholder was skipped.
 *   3. For wheelthrowing, course details are sent per cohort by the admin. If
 *      the cohort's email already went out, the studio inbox is told to resend
 *      it to this student; otherwise they will be included when it is sent.
 *
 * Idempotent via sent_emails (safe to re-run). Never throws.
 *
 * @param {Object} params
 * @param {number} params.customerId - the (former placeholder) customer id
 * @param {string} [params.purchaserEmail]
 * @returns {Promise<{welcome: boolean, courseDetails: string[], adminAlerts: string[], errors: string[]}>}
 */
async function sendPlusOneOnboarding({ customerId, purchaserEmail }) {
  const summary = { welcome: false, courseDetails: [], adminAlerts: [], errors: [] };
  try {
    const supabaseDb = require('./supabaseDb');
    const { supabase } = supabaseDb;
    const { sendAndLogEmail, sendEmail, INBOX_ADDRESS, isPlaceholderAddress } = require('./emailService');
    const courseConfig = require('./courseConfig');

    const { data: student, error: studentError } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email')
      .eq('id', customerId)
      .single();
    if (studentError) throw studentError;
    if (!student?.email || isPlaceholderAddress(student.email)) {
      summary.errors.push('student has no real email yet');
      return summary;
    }

    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('id, course_type, course_title, course_identifier, number_of_weeks, class_credits_allocated, status')
      .eq('student_id', customerId)
      .in('status', ['active', 'pending', 'upcoming']);

    let purchaserName = '';
    if (purchaserEmail) {
      const purchaser = await supabaseDb.findCustomerByEmail(purchaserEmail).catch(() => null);
      purchaserName = purchaser ? `${purchaser.first_name || ''} ${purchaser.last_name || ''}`.trim() : '';
    }

    const alreadySent = async (emailType, courseIdentifier) => {
      const { data } = await supabase
        .from('sent_emails')
        .select('id')
        .eq('email_type', emailType)
        .eq('course_identifier', courseIdentifier)
        .contains('recipient_emails', [student.email])
        .limit(1)
        .maybeSingle();
      return Boolean(data);
    };

    // 1. Welcome
    const welcomeKey = `customer_${customerId}`;
    if (!(await alreadySent('student_welcome', welcomeKey))) {
      const template = require('../email-templates/student-welcome');
      const { subject, html } = template.generate({
        firstName: student.first_name,
        purchaserName,
        courseTitle: enrollments?.[0]?.course_title || '',
        signInUrl: `${publicBaseUrl()}/dashboard`,
      });
      const result = await sendAndLogEmail({
        emailType: 'student_welcome',
        courseIdentifier: welcomeKey,
        subject,
        html,
        recipientEmails: [student.email],
        sentBy: 'system',
      });
      summary.welcome = result.success;
      if (!result.success) summary.errors.push(`welcome: ${result.error}`);
    }

    for (const enrollment of enrollments || []) {
      const isHB = String(enrollment.course_type || '').toLowerCase().includes('handbuilding');

      if (isHB) {
        // 2. Same template choice as the order-time HB send (routes/shopify.js)
        const courseId = enrollment.course_identifier || `HB_${enrollment.id}`;
        if (await alreadySent('course_details', courseId)) continue;

        const credits = enrollment.number_of_weeks || enrollment.class_credits_allocated || 4;
        const templateType = credits <= 4 ? 'hb-4credit' : 'hb-8credit';
        try {
          const cfg = courseConfig.getConfig(templateType);
          if (cfg && cfg.email_auto_send === false) continue;
        } catch (e) { /* config not loaded, default to sending */ }

        const template = require(`../email-templates/courses/${templateType}`);
        const { subject, html } = template.generate({ specialNotes: '' });
        const result = await sendAndLogEmail({
          emailType: 'course_details',
          courseIdentifier: courseId,
          subject,
          html,
          recipientEmails: [student.email],
          sentBy: 'system',
        });
        if (result.success) summary.courseDetails.push(courseId);
        else summary.errors.push(`${courseId}: ${result.error}`);
        continue;
      }

      // 3. WT: the cohort key is the course_identifier prefix before the week suffix
      const cohortId = String(enrollment.course_identifier || '').split('.')[0];
      if (!cohortId) continue;
      const { data: cohortSent } = await supabase
        .from('sent_emails')
        .select('id')
        .eq('email_type', 'course_details')
        .like('course_identifier', `${cohortId}%`)
        .limit(1)
        .maybeSingle();
      if (!cohortSent) continue; // not sent yet — the student will be on the cohort send

      const { esc } = require('../email-templates/base');
      const name = `${student.first_name || ''} ${student.last_name || ''}`.replace(/[\r\n]+/g, ' ').trim();
      await sendEmail({
        to: INBOX_ADDRESS,
        subject: `VES Admin: resend course details to ${name} (${cohortId})`,
        html: `<p>${esc(name)} (${esc(student.email)}) was a second-spot placeholder on ${esc(cohortId)} and has just been given their real details.</p>
          <p>The course-details email for this cohort went out before that, so they never received it. Please resend it to them from Admin → Course Emails.</p>`,
      });
      summary.adminAlerts.push(cohortId);
    }

    console.log(`[Onboarding] Customer ${customerId} <${student.email}>: welcome=${summary.welcome}, courseDetails=[${summary.courseDetails}], adminAlerts=[${summary.adminAlerts}]${summary.errors.length ? `, errors=[${summary.errors.join('; ')}]` : ''}`);
    return summary;
  } catch (err) {
    console.error('[Onboarding] Failed:', err.message);
    summary.errors.push(err.message);
    return summary;
  }
}

module.exports = { sendPlusOneOnboarding };
