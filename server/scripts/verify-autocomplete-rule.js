/**
 * Dry-run check for autoCompleteFinishedEnrollments().
 *
 * Guards the Aug 2026 fix for zero-booking enrollments: superseded duplicates
 * must retire, but a student who paid and was never placed in a cohort must stay
 * active and visible. Run before deploying changes to the completion rule.
 *
 *   node scripts/verify-autocomplete-rule.js
 */
require('dotenv').config();
const { autoCompleteFinishedEnrollments } = require('../utils/enrollmentCompletion');
const { supabase } = require('../utils/supabaseDb');

// Orphaned Shopify enrollments whose twin record holds the real bookings.
const MUST_COMPLETE = [4763, 4845, 4846, 4848];

// Must NOT be touched, each for a different reason:
//   4530 Alma  — paid, never placed in any cohort, no sibling. The gap itself.
//   5090 Fusun — HB, 8 of 8 credits unspent, no course_end_date.
//   5467 Asyiqin — HB bought today, 4 credits unspent.
//   5367 Kevin — 10-class package, 9 credits unspent, every booking reschd/cancelled.
const MUST_NOT_TOUCH = [4530, 5090, 5467, 5367];

(async () => {
  const failuresEarly = [];
  const plan = await autoCompleteFinishedEnrollments({ dryRun: true });
  const ids = plan.completed.map(c => c.id);

  console.log(`Would retire ${ids.length}: ${plan.completed.map(c => `#${c.id}->${c.status}`).join(', ') || '(none)'}`);

  // Superseded duplicates must be cancelled, never completed — a completed ghost
  // row would show up a second time in Past Students for a single purchase.
  for (const c of plan.completed) {
    if (c.bookings === 0 && c.status !== 'cancelled') {
      failuresEarly.push(`#${c.id} zero-booking duplicate would be '${c.status}', expected 'cancelled'`);
    }
  }
  if (plan.allocated.length) {
    console.log(`Would allocate flex credits: ${plan.allocated.map(a => `#${a.id}(+${a.flexCredits})`).join(', ')}`);
  }

  const failures = failuresEarly;
  for (const id of MUST_COMPLETE) {
    if (!ids.includes(id)) failures.push(`#${id} should be completed but was not`);
  }
  for (const id of MUST_NOT_TOUCH) {
    if (ids.includes(id)) failures.push(`#${id} MUST NOT be completed but would be`);
  }

  // Nothing with unspent credits may ever be retired by this rule.
  const supabaseDb = require('../utils/supabaseDb');
  for (const c of plan.completed) {
    const credits = await supabaseDb.getEnrollmentCredits(c.id);
    if (credits.remaining > 0) {
      failures.push(`#${c.id} would be completed while holding ${credits.remaining} unspent credits`);
    }
  }

  // Anything completed with zero bookings must have a sibling that served it.
  for (const c of plan.completed.filter(x => x.bookings === 0)) {
    const { data: e } = await supabase.from('course_enrollments')
      .select('student_id, course_start_date').eq('id', c.id).single();
    const { data: sibs } = await supabase.from('course_enrollments')
      .select('id').eq('student_id', e.student_id).neq('id', c.id).neq('status', 'cancelled');
    if (!sibs?.length) failures.push(`#${c.id} has no bookings AND no sibling enrollment`);
  }

  console.log('');
  if (failures.length) {
    failures.forEach(f => console.log('  FAIL ' + f));
    process.exit(1);
  }
  console.log(`PASS — ${MUST_COMPLETE.length} superseded duplicates retire, ${MUST_NOT_TOUCH.length} protected rows untouched, no credits swallowed.`);
})();
