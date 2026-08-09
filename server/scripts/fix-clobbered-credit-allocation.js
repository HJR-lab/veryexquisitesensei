/**
 * One-off repair: restore total allocation on enrollments where "Convert to Credit"
 * overwrote class_credits_allocated with a bare 1 (or another value below the real
 * course length), collapsing the student's course to that number of classes.
 *
 * Only touches class_credits_allocated. class_credits_remaining is left alone — the
 * conversion already incremented it correctly, and an admin may have deliberately zeroed it.
 *
 * Run from server/:
 *   node scripts/fix-clobbered-credit-allocation.js          # report only
 *   node scripts/fix-clobbered-credit-allocation.js --apply  # write
 */
require('dotenv').config();

const supabaseDb = require('../utils/supabaseDb');
const { supabase, getEnrollmentCredits, resolveCreditAllocation } = supabaseDb;

const APPLY = process.argv.includes('--apply');

(async () => {
  const { data: enrs, error } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_type, course_identifier, status, number_of_weeks, class_credits_allocated, class_credits_remaining')
    .gt('class_credits_allocated', 0);
  if (error) throw error;

  const damaged = [];
  for (const enr of enrs || []) {
    const isHB = (enr.course_type || '').toLowerCase().includes('handbuilding');
    const is10Class = (enr.number_of_weeks || 0) >= 10;
    if (isHB || is10Class) continue; // their allocation columns mean something else

    const credits = await getEnrollmentCredits(enr.id);
    if (credits.committed <= credits.allocated) continue;

    damaged.push({
      enr,
      committed: credits.committed,
      newAllocated: resolveCreditAllocation({
        allocated: enr.class_credits_allocated,
        numberOfWeeks: enr.number_of_weeks,
        committedBefore: credits.committed
      })
    });
  }

  if (damaged.length === 0) {
    console.log('No clobbered enrollments found.');
    return;
  }

  for (const { enr, committed, newAllocated } of damaged) {
    console.log(`Enrollment ${enr.id} (student ${enr.student_id}, ${enr.course_identifier}, ` +
      `${enr.number_of_weeks} weeks): ${committed} bookings, ` +
      `allocated ${enr.class_credits_allocated} -> ${newAllocated}, ` +
      `remaining column ${enr.class_credits_remaining}`);

    if (!APPLY) continue;

    const { error: upErr } = await supabase
      .from('course_enrollments')
      .update({ class_credits_allocated: newAllocated, updated_at: new Date().toISOString() })
      .eq('id', enr.id);
    if (upErr) {
      console.log(`   ❌ update failed: ${upErr.message}`);
      continue;
    }

    const after = await getEnrollmentCredits(enr.id);
    console.log(`   ✅ now allocated ${after.allocated}, attended ${after.attended}, ` +
      `booked ${after.booked}, remaining ${after.remaining}`);
  }

  if (!APPLY) console.log('\nDry run — re-run with --apply to write.');
})();
