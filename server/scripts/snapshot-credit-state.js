/**
 * Snapshot every enrollment's credit state — stored columns, computed ledger
 * value, and the student-facing status auth.js would derive from it.
 *
 * Written so the stored-column reconciliation can be proved rather than
 * asserted: run it before the change, run it after, diff the two.
 *
 * Run from server/:  node scripts/snapshot-credit-state.js <out.json>
 */
require('dotenv').config();

const fs = require('fs');
const { supabase, getEnrollmentCredits } = require('../utils/supabaseDb');

// Mirrors the student-facing derivation at server/routes/auth.js:671-672 —
// an enrollment whose classes are all in the past reads as 'completed' unless
// credits remain. Reproduced here so a status flip is visible in the diff.
function derivedStudentStatus(enrollment, allDatesPast) {
  if (!allDatesPast) return enrollment.status;
  return (enrollment.class_credits_remaining > 0) ? 'active' : 'completed';
}

(async () => {
  const outPath = process.argv[2] || 'credit-snapshot.json';

  let all = [], page = 0, more = true;
  while (more) {
    const { data } = await supabase
      .from('course_enrollments')
      .select('id, student_id, status, course_title, course_type, course_identifier, number_of_weeks, class_credits_allocated, class_credits_used, class_credits_remaining')
      .range(page * 1000, (page + 1) * 1000 - 1);
    all = all.concat(data || []);
    more = (data || []).length === 1000;
    page++;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const rows = [];

  for (const e of all) {
    const credits = await getEnrollmentCredits(e.id);

    const { data: bookings } = await supabase
      .from('bookings')
      .select('status, class_instances!bookings_class_instance_id_fkey(class_date)')
      .eq('course_enrollment_id', e.id);

    const dates = (bookings || [])
      .map(b => b.class_instances?.class_date?.split(/[T ]/)[0])
      .filter(Boolean);
    const allDatesPast = dates.length > 0 && dates.every(d => d < todayStr);

    rows.push({
      id: e.id,
      student_id: e.student_id,
      status: e.status,
      course_identifier: e.course_identifier,
      stored_allocated: e.class_credits_allocated,
      stored_used: e.class_credits_used,
      stored_remaining: e.class_credits_remaining,
      computed_allocated: credits.allocated,
      computed_attended: credits.attended,
      computed_booked: credits.booked,
      computed_forfeited: credits.forfeited,
      computed_committed: credits.committed,
      computed_remaining: credits.remaining,
      all_dates_past: allDatesPast,
      derived_student_status: derivedStudentStatus(e, allDatesPast),
    });
  }

  rows.sort((a, b) => a.id - b.id);
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 1));

  const agree = rows.filter(r => r.stored_remaining === r.computed_remaining).length;
  const overrides = rows.filter(r => r.stored_remaining === 0 && r.computed_remaining > 0).length;
  const ahead = rows.filter(r => r.stored_remaining != null && r.stored_remaining > r.computed_remaining).length;

  console.log(`wrote ${rows.length} enrollments to ${outPath}`);
  console.log(`  stored === computed : ${agree}`);
  console.log(`  stored 0, computed>0: ${overrides}`);
  console.log(`  stored > computed   : ${ahead}`);
})();
