/**
 * Verify a booking is always charged to an enrollment, so it actually spends a
 * credit.
 *
 * Reproduces Sanjana Vijay's case (booking 29649, 09/08/26): a 6-week WT
 * student, legacy classes_allocated still positive, books a class. The old
 * fallback resolved only 10-class packages, so the booking was written with
 * course_enrollment_id = null. getEnrollmentCredits counts by that column, so
 * the class was booked, the seat taken, and the credit never spent — she kept 2
 * credits after using one.
 *
 * Run from server/:  node scripts/verify-booking-enrollment-link.js
 */
require('dotenv').config();

const { supabase, resolveBookingEnrollment, getEnrollmentCredits } = require('../utils/supabaseDb');

let failures = 0;
function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'} ${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

(async () => {
  // ── The regression itself ────────────────────────────────────────────────
  // Sanjana: 6-week WT, enrollment 5409, cohort WT1107PM_DL6.
  console.log('\n— a 6-week WT student booking their own cohort class —');
  const { data: ownClass } = await supabase
    .from('class_instances').select('id, class_type')
    .eq('class_type', 'WT1107PM_DL6.6').limit(1).single();

  const resolved = await resolveBookingEnrollment(2979, ownClass);
  assert('resolves to her own enrollment, not null', resolved, 5409);

  // ── The property that actually matters ───────────────────────────────────
  console.log('\n— own cohort always wins over any other candidate —');
  const { data: enr } = await supabase
    .from('course_enrollments').select('course_identifier').eq('id', 5409).single();
  assert('class base matches the enrollment identifier',
    (ownClass.class_type || '').split('.')[0], enr.course_identifier);

  // ── Guard the shape of the fallback ──────────────────────────────────────
  console.log('\n— a student with no enrollment at all —');
  const { data: orphanStudent } = await supabase
    .from('customers').select('id').eq('classes_allocated', 0).limit(1).single();
  const none = await resolveBookingEnrollment(orphanStudent.id, ownClass);
  assert('returns null rather than inventing a link', none, null);

  console.log('\n— a closed block is never charged —');
  const { data: closed } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_identifier')
    .not('credits_closed_at', 'is', null)
    .not('course_identifier', 'is', null)
    .limit(1).single();
  if (closed) {
    const { data: closedClass } = await supabase
      .from('class_instances').select('id, class_type')
      .like('class_type', `${closed.course_identifier}%`).limit(1).maybeSingle();
    if (closedClass) {
      const got = await resolveBookingEnrollment(closed.student_id, closedClass);
      assert(`closed enrollment ${closed.id} is not selected`, got === closed.id, false);
    } else {
      console.log('   (no class instance for that identifier — skipped)');
    }
  }

  // ── System-wide: no upcoming booking is unlinked ─────────────────────────
  console.log('\n— system-wide —');
  const todayStr = new Date().toISOString().split('T')[0];
  let bookings = [], page = 0, more = true;
  while (more) {
    const { data } = await supabase
      .from('bookings')
      .select('id, status, course_enrollment_id, class_instances!bookings_class_instance_id_fkey(class_date)')
      .range(page * 1000, (page + 1) * 1000 - 1);
    bookings = bookings.concat(data || []);
    more = (data || []).length === 1000;
    page++;
  }
  const CONSUMING = ['booked', 'attended', 'completed', 'forfeited', 'absent'];
  const unlinkedUpcoming = bookings.filter(b =>
    !b.course_enrollment_id && CONSUMING.includes(b.status) &&
    (b.class_instances?.class_date || '').split(/[T ]/)[0] >= todayStr);
  assert('no upcoming booking consumes zero credit', unlinkedUpcoming.length, 0);

  // ── Sanjana's record specifically ────────────────────────────────────────
  console.log('\n— Sanjana\'s balance —');
  const credits = await getEnrollmentCredits(5409);
  assert('4 attended', credits.attended, 4);
  assert('1 booked', credits.booked, 1);
  assert('1 credit left, not 2', credits.remaining, 1);

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
