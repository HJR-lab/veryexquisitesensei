/**
 * Verify: converting a booking to a credit never shrinks an enrollment's total allocation.
 *
 * Regression guard for the bug where "Convert to Credit" wrote
 * class_credits_allocated = 1 onto a 6-week WT enrollment (whose real total lives in
 * number_of_weeks), making the student's whole course read as 1 class.
 *
 * Run from server/:  node scripts/verify-convert-to-credit-allocation.js
 */
require('dotenv').config();

const supabaseDb = require('../utils/supabaseDb');
const { supabase, resolveCreditAllocation, getEnrollmentCredits } = supabaseDb;

let failures = 0;

function assert(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'} ${label} — got ${actual}, expected ${expected}`);
}

async function unitChecks() {
  console.log('\n— resolveCreditAllocation —');

  // WT 6-week, credit column never set, all 6 weeks still committed.
  assert('WT 6wk first conversion keeps 6',
    resolveCreditAllocation({ allocated: 0, numberOfWeeks: 6, committedBefore: 6 }), 6);

  // Second conversion on the same enrollment must not shrink it.
  assert('WT 6wk second conversion keeps 6',
    resolveCreditAllocation({ allocated: 6, numberOfWeeks: 6, committedBefore: 5 }), 6);

  // Never returns 0 — the endpoint relies on allocated > 0 to mean "credits are live".
  assert('empty enrollment still gets a credit',
    resolveCreditAllocation({ allocated: 0, numberOfWeeks: 0, committedBefore: 1 }), 1);

  // Makeups can push commitments past number_of_weeks; the floor follows the bookings.
  assert('committed above weeks wins',
    resolveCreditAllocation({ allocated: 0, numberOfWeeks: 6, committedBefore: 8 }), 8);

  // An explicitly larger allocation (HB block, 10-class flex) is never reduced.
  assert('explicit allocation preserved',
    resolveCreditAllocation({ allocated: 8, numberOfWeeks: 4, committedBefore: 3 }), 8);
}

async function dataChecks() {
  console.log('\n— live data —');

  const { data: enrs } = await supabase
    .from('course_enrollments')
    .select('id, course_type, course_identifier, number_of_weeks, class_credits_allocated')
    .gt('class_credits_allocated', 0);

  let overAllocated = 0;
  for (const enr of enrs || []) {
    const isHB = (enr.course_type || '').toLowerCase().includes('handbuilding');
    const is10Class = (enr.number_of_weeks || 0) >= 10;
    if (isHB || is10Class) continue; // separate allocation semantics, see getEnrollmentCredits

    const credits = await getEnrollmentCredits(enr.id);
    if (credits.committed > credits.allocated) {
      overAllocated++;
      console.log(`   enrollment ${enr.id} (${enr.course_identifier}): ` +
        `${credits.committed} bookings against ${credits.allocated} credits`);
    }
  }
  assert('over-allocated WT enrollments', overAllocated, 0);
}

(async () => {
  await unitChecks();
  await dataChecks();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
