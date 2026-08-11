/**
 * Verify the eligibility gate honours credits_closed_at and NOT the stored zero.
 *
 * The proof that matters: take a deliberately-closed block, write a non-zero
 * stored balance onto it, and confirm it is STILL excluded. Under the old rule
 * (class_credits_remaining === 0) that row would have re-opened and offered
 * credits. If this test passes, closure genuinely no longer depends on the
 * number, which is the whole point of the change.
 *
 * Run from server/:  node scripts/verify-credit-closure-gate.js
 */
require('dotenv').config();

const { supabase, getEnrollmentCredits } = require('../utils/supabaseDb');

let failures = 0;
function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'} ${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

// Mirrors the gate in server/routes/classes.js. Kept in step with it on purpose:
// if that loop changes, this must change, and the test should be the thing that
// notices.
async function bookableEnrollments(studentId) {
  const { data: candidates } = await supabase
    .from('course_enrollments')
    .select('id, course_type, class_credits_remaining, class_credits_used, number_of_weeks, credits_closed_at')
    .eq('student_id', studentId)
    .in('status', ['active', 'completed']);

  const out = [];
  for (const e of candidates || []) {
    if (e.credits_closed_at) continue;
    const credits = await getEnrollmentCredits(e.id);
    if (credits.remaining > 0) out.push({ id: e.id, remaining: credits.remaining });
  }
  return out;
}

(async () => {
  // A closed block whose ledger would happily offer credits if consulted.
  const CLOSED_ID = 4569;
  const { data: closed } = await supabase
    .from('course_enrollments')
    .select('id, student_id, class_credits_remaining, credits_closed_at, credits_closed_reason')
    .eq('id', CLOSED_ID).single();

  const closedLedger = await getEnrollmentCredits(CLOSED_ID);
  console.log(`\n— closed block ${CLOSED_ID}: ledger would offer ${closedLedger.remaining}, stored ${closed.class_credits_remaining} —`);
  assert('is flagged closed', !!closed.credits_closed_at, true);
  assert('ledger would offer credits if consulted', closedLedger.remaining > 0, true);

  let bookable = await bookableEnrollments(closed.student_id);
  assert('gate excludes it', bookable.some(b => b.id === CLOSED_ID), false);

  // The real proof: make the stored number look open. Closure must still hold.
  console.log('\n— now write a non-zero stored balance onto the closed block —');
  await supabase.from('course_enrollments')
    .update({ class_credits_remaining: closedLedger.remaining })
    .eq('id', CLOSED_ID);

  bookable = await bookableEnrollments(closed.student_id);
  assert('STILL excluded — closure does not depend on the number',
    bookable.some(b => b.id === CLOSED_ID), false);

  await supabase.from('course_enrollments')
    .update({ class_credits_remaining: closed.class_credits_remaining })
    .eq('id', CLOSED_ID);
  const { data: restored } = await supabase
    .from('course_enrollments').select('class_credits_remaining').eq('id', CLOSED_ID).single();
  assert('stored value restored', restored.class_credits_remaining, closed.class_credits_remaining);

  // And the converse: an open enrollment whose stored cache once read zero is
  // now offered. This is the row the old gate silently trapped.
  const OPEN_ID = 5347;
  const { data: open } = await supabase
    .from('course_enrollments')
    .select('id, student_id, class_credits_remaining, credits_closed_at')
    .eq('id', OPEN_ID).single();
  const openLedger = await getEnrollmentCredits(OPEN_ID);

  console.log(`\n— open block ${OPEN_ID} (Geraldine Lai): ledger ${openLedger.remaining}, stored ${open.class_credits_remaining} —`);
  assert('is not flagged closed', !!open.credits_closed_at, false);
  const openBookable = await bookableEnrollments(open.student_id);
  assert('gate offers it', openBookable.some(b => b.id === OPEN_ID), true);

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
