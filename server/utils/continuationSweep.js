/**
 * The daily continuation sweep — what makes the offers automatic.
 *
 * Two jobs, in this order:
 *   1. Lapse offers whose deadline has passed, so the seat goes back.
 *   2. Offer the next course to every package student who is due one.
 *
 * Lapsing MUST run first. A live offer blocks a new one for the same cohort
 * (unique partial index on status='pending'), so an expired-but-still-pending
 * row would silently prevent that student ever being re-offered.
 *
 * Offers created here are AUTOMATED sends, so they respect the paused
 * 'continuation' email category. While paused, the sweep does all the matching
 * and creates every offer, but emails nobody — and reports what it would have
 * sent to info@ves.sg instead. That is the dry run: the picks are visible for
 * a few cohorts before a single student hears from it.
 */

const { supabase } = require('./supabaseDb');
const { resolveNextCourse } = require('./packageContinuation');
const { createContinuationOffer } = require('./continuationOffer');

/**
 * Close offers past their deadline. Idempotent — an already-lapsed row is not
 * matched again.
 * @returns {Promise<Array>} the offers that were lapsed
 */
async function lapseExpiredOffers() {
  const { data, error } = await supabase
    .from('continuation_offers')
    .update({ status: 'lapsed' })
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .select();

  if (error) {
    console.error('[ContinuationSweep] lapse failed:', error.message);
    return [];
  }
  if (data?.length) {
    console.log(`[ContinuationSweep] lapsed ${data.length} expired offer(s) — seats released`);
  }
  return data || [];
}

/**
 * Every active multi-course package enrollment that still owes the student a
 * course. One row per student per package; the student's CURRENT enrollment is
 * the one that knows their slot.
 */
async function findDuePackageStudents() {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('*, customers!course_enrollments_student_id_fkey(id, first_name, last_name, email)')
    .gte('package_total_courses', 2)
    .in('status', ['active', 'upcoming']);

  if (error) {
    console.error('[ContinuationSweep] enrollment query failed:', error.message);
    return [];
  }

  // A student mid-package holds several enrollments over time. Only the latest
  // one describes where they are now, so collapse to the newest per student.
  const latest = new Map();
  for (const e of data || []) {
    const prev = latest.get(e.student_id);
    if (!prev || (e.course_start_date || '') > (prev.course_start_date || '')) {
      latest.set(e.student_id, e);
    }
  }
  return [...latest.values()];
}

/**
 * Offer the next course to everyone due one.
 *
 * Reasons a student is skipped are counted rather than logged individually —
 * "no cohort scheduled yet" is the normal state for most of them, not news.
 */
async function createDueOffers() {
  const students = await findDuePackageStudents();
  const created = [];
  const skipped = {};

  for (const enrollment of students) {
    const studentId = enrollment.student_id;
    try {
      const resolved = await resolveNextCourse(enrollment, studentId);
      if (!resolved.ok) {
        skipped[resolved.reason] = (skipped[resolved.reason] || 0) + 1;
        continue;
      }

      const result = await createContinuationOffer({ enrollment, studentId, automated: true });
      if (!result.ok) {
        skipped[result.reason] = (skipped[result.reason] || 0) + 1;
        continue;
      }

      created.push({
        offer: result.offer,
        emailed: result.emailed,
        studentName: `${enrollment.customers?.first_name || ''} ${enrollment.customers?.last_name || ''}`.trim(),
        studentEmail: enrollment.customers?.email || null,
      });
    } catch (err) {
      // One bad enrollment must never stop the sweep.
      console.error(`[ContinuationSweep] student ${studentId} failed:`, err.message);
      skipped.error = (skipped.error || 0) + 1;
    }
  }

  return { created, skipped, examined: students.length };
}

/**
 * Tell info@ves.sg what the sweep did.
 *
 * While the category is paused this IS the product: the list of students the
 * system would have written to, for Justin to send by hand and to check the
 * picks against what he would have done.
 */
function buildSweepReport({ created, skipped, examined, lapsed, paused, base }) {
  const esc = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const fmt = d => d
    ? new Date(`${String(d).split(/[T ]/)[0]}T00:00:00+08:00`)
        .toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })
    : '';

  const rows = created.map(c => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(c.studentName)}<br/>
        <span style="color:#888;font-size:12px;">${esc(c.studentEmail)}</span></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(fmt(c.offer.first_class_date))}<br/>
        <span style="color:#888;font-size:12px;">${esc(c.offer.class_time)}</span></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">
        <a href="${base}/continue/${c.offer.token}">open link</a></td>
    </tr>`).join('');

  const header = paused
    ? `<p><strong>Continuation emails are paused</strong> — these ${created.length} student(s) were NOT emailed.
       Each link below is live, so you can send it by hand. Unpause by removing
       <code>continuation</code> from <code>PAUSED_EMAIL_CATEGORIES</code>.</p>`
    : `<p>${created.length} continuation offer(s) emailed.</p>`;

  const skipLine = Object.keys(skipped).length
    ? `<p style="color:#888;font-size:13px;">Examined ${examined} package student(s). Skipped: ${
        Object.entries(skipped).map(([k, v]) => `${k} ${v}`).join(', ')}.</p>`
    : `<p style="color:#888;font-size:13px;">Examined ${examined} package student(s).</p>`;

  const lapsedLine = lapsed.length
    ? `<p style="color:#888;font-size:13px;">${lapsed.length} offer(s) lapsed today — those seats are back.</p>`
    : '';

  const html = `${header}${
    created.length ? `<table style="border-collapse:collapse;font-size:14px;">${rows}</table>` : ''
  }${skipLine}${lapsedLine}`;

  return {
    subject: `VES: ${created.length} continuation offer(s)${paused ? ' ready to send' : ' sent'}`,
    html,
  };
}

async function reportSweep({ created, skipped, examined, lapsed }) {
  if (created.length === 0 && lapsed.length === 0) return;

  const { sendEmail, isEmailCategoryPaused } = require('./emailService');
  const { publicBaseUrl } = require('./publicUrl');

  const { subject, html } = buildSweepReport({
    created, skipped, examined, lapsed,
    paused: isEmailCategoryPaused('continuation'),
    base: publicBaseUrl(),
  });

  await sendEmail({ to: 'info@ves.sg', subject, html });
}

/**
 * Entry point for the daily cron. Never throws.
 */
async function runContinuationSweep() {
  try {
    const lapsed = await lapseExpiredOffers();
    const { created, skipped, examined } = await createDueOffers();
    console.log(`[ContinuationSweep] examined ${examined}, created ${created.length}, lapsed ${lapsed.length}`);
    await reportSweep({ created, skipped, examined, lapsed });
    return { created, skipped, examined, lapsed };
  } catch (err) {
    console.error('[ContinuationSweep] failed:', err);
    return null;
  }
}

module.exports = {
  buildSweepReport,
  lapseExpiredOffers,
  findDuePackageStudents,
  createDueOffers,
  runContinuationSweep,
};
