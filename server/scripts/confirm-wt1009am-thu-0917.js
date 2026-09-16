/**
 * One-off: confirm WT1009AM_JL6 (Thursday 9:30am) and run it from 17/09/26
 * with 2 students, below the usual 4-student minimum.
 *
 * Studio decision (Justin, 16/09/26): run this cohort under threshold as a test.
 *
 * What it does:
 *   1. Restores Vernicia Neo's seat in class .1 (17/09) — her row there is cancelled.
 *   2. Flips the 6 draft classes to active (activateDraftClasses).
 *   3. Rebuilds current_enrollment from real booked rows.
 *   4. Re-syncs the stored credit cache for both enrollments.
 *   5. Re-syncs Google Calendar for the 6 classes.
 *
 * It sends NO email. Telling the students is a separate, deliberate step.
 *
 * Run from server/:
 *   node scripts/confirm-wt1009am-thu-0917.js              # dry run
 *   node scripts/confirm-wt1009am-thu-0917.js --execute
 */

require('dotenv').config({ path: __dirname + '/../.env' });

const { supabase } = require('../utils/supabaseDb');
const { activateDraftClasses } = require('../utils/courseEnrollmentManager');
const { createBooking, checkSeatAvailability, syncStoredCredits, getEnrollmentCredits } = require('../utils/bookingDb');
const { awardCoursePurchaseCredit } = require('../utils/creditManager');
const { toYmd, weekdayName } = require('../utils/sgtDate');

const COURSE = 'WT1009AM_JL6';
const FIRST_CLASS_DATE = '2026-09-17';
const EXECUTE = process.argv.includes('--execute');

const EXPECTED = {
  5495: { student: 2978, name: 'Vernicia Neo' },
  5497: { student: 1132, name: 'Cynthia Ong' },
};

async function loadState() {
  const { data: classes, error: ce } = await supabase
    .from('class_instances')
    .select('id, class_type, class_date, start_time, end_time, status, room, current_enrollment, max_capacity, instructor')
    .like('class_type', `${COURSE}.%`)
    .order('class_date');
  if (ce) throw ce;

  const { data: enrollments, error: ee } = await supabase
    .from('course_enrollments')
    .select('id, student_id, status, course_start_date, course_end_date, class_credits_used, class_credits_remaining, credits_closed_at, customers:student_id(first_name, last_name, email)')
    .eq('course_identifier', COURSE)
    .order('id');
  if (ee) throw ee;

  const { data: bookings, error: be } = await supabase
    .from('bookings')
    .select('id, student_id, class_instance_id, status, booking_type, course_enrollment_id')
    .in('class_instance_id', classes.map(c => c.id))
    .order('class_instance_id');
  if (be) throw be;

  return { classes, enrollments, bookings };
}

function printState(label, { classes, enrollments, bookings }) {
  console.log(`\n=== ${label} ===`);
  for (const c of classes) {
    const booked = bookings.filter(b => b.class_instance_id === c.id && b.status === 'booked');
    const other = bookings.filter(b => b.class_instance_id === c.id && b.status !== 'booked');
    console.log(`  #${c.id} ${c.class_type} ${toYmd(c.class_date)} ${weekdayName(c.class_date).slice(0,3)} ${c.start_time}  status=${c.status.padEnd(6)} cached=${c.current_enrollment}/${c.max_capacity} booked=${booked.length}${other.length ? `  (+${other.map(b => `${b.id}:${b.status}`).join(',')})` : ''}`);
  }
  for (const e of enrollments) {
    console.log(`  enr #${e.id} ${e.customers?.first_name} ${e.customers?.last_name} <${e.customers?.email}> status=${e.status} cache used=${e.class_credits_used} remaining=${e.class_credits_remaining} closed=${e.credits_closed_at || 'no'}`);
  }
}

(async () => {
  const before = await loadState();
  printState('BEFORE', before);

  // ── Guards ────────────────────────────────────────────────────────────────
  if (before.classes.length !== 6) throw new Error(`Expected 6 classes, found ${before.classes.length}`);
  const badDay = before.classes.filter(c => weekdayName(c.class_date) !== 'THURSDAY');
  if (badDay.length) throw new Error(`${badDay.length} class(es) not on a Thursday`);
  if (toYmd(before.classes[0].class_date) !== FIRST_CLASS_DATE) {
    throw new Error(`First class is ${toYmd(before.classes[0].class_date)}, expected ${FIRST_CLASS_DATE}`);
  }
  if (before.enrollments.length !== 2) throw new Error(`Expected 2 enrollments, found ${before.enrollments.length}`);
  for (const e of before.enrollments) {
    const exp = EXPECTED[e.id];
    if (!exp) throw new Error(`Unexpected enrollment ${e.id} in cohort`);
    if (e.student_id !== exp.student) throw new Error(`Enrollment ${e.id} is student ${e.student_id}, expected ${exp.student} (${exp.name})`);
    if (e.credits_closed_at) throw new Error(`Enrollment ${e.id} credit block is closed — refusing`);
  }

  const firstClass = before.classes[0];

  // ── Plan ──────────────────────────────────────────────────────────────────
  const plan = [];

  for (const e of before.enrollments) {
    const seat = before.bookings.find(b =>
      b.class_instance_id === firstClass.id && b.student_id === e.student_id && b.status === 'booked');
    if (!seat) {
      plan.push({ kind: 'book', enrollmentId: e.id, studentId: e.student_id, name: EXPECTED[e.id].name });
    }
  }

  const drafts = before.classes.filter(c => c.status === 'draft');
  if (drafts.length) plan.push({ kind: 'activate', ids: drafts.map(c => c.id) });

  console.log('\n=== PLAN ===');
  if (!plan.length) console.log('  (nothing to do)');
  for (const p of plan) {
    if (p.kind === 'book') console.log(`  book  ${p.name} (student ${p.studentId}, enr ${p.enrollmentId}) into class #${firstClass.id} ${FIRST_CLASS_DATE}`);
    if (p.kind === 'activate') console.log(`  activate ${p.ids.length} draft classes -> active: ${p.ids.join(', ')}`);
  }
  console.log('  then: rebuild current_enrollment, sync credit cache, resync Google Calendar');

  // Credit sweep preview — activateDraftClasses runs this; show what it would do.
  console.log('\n=== CREDIT SWEEP PREVIEW (dry) ===');
  for (const e of before.enrollments) {
    const { data: enr } = await supabase.from('course_enrollments').select('course_title, course_type').eq('id', e.id).single();
    const r = await awardCoursePurchaseCredit({
      customerId: e.student_id, enrollmentId: e.id,
      courseTitle: enr?.course_title || enr?.course_type, dryRun: true,
    });
    console.log(`  enr #${e.id} ${EXPECTED[e.id].name}: ${JSON.stringify(r)}`);
  }

  console.log('\n=== LEDGER (before) ===');
  for (const e of before.enrollments) {
    console.log(`  enr #${e.id} ${EXPECTED[e.id].name}: ${JSON.stringify(await getEnrollmentCredits(e.id))}`);
  }

  if (!EXECUTE) {
    console.log('\nDRY RUN — nothing written. Re-run with --execute.');
    return;
  }

  // ── 1. Restore missing seats in class .1 ──────────────────────────────────
  // bookings has a unique key on (student_id, class_instance_id), so a student
  // who was cancelled off a class is re-seated by reviving that row, not by
  // inserting a second one — same as routes/classes.js:1239. createBooking's
  // seat gate is skipped by that path, so run it here explicitly.
  for (const p of plan.filter(x => x.kind === 'book')) {
    const seat = await checkSeatAvailability(firstClass, p.studentId, { checkWheels: true });
    if (!seat.allowed) throw new Error(`Seat refused for ${p.name}: ${seat.reason} ${JSON.stringify(seat.counts)}`);

    const { data: cancelled } = await supabase
      .from('bookings')
      .select('id')
      .eq('student_id', p.studentId)
      .eq('class_instance_id', firstClass.id)
      .eq('status', 'cancelled')
      .maybeSingle();

    let booking;
    if (cancelled) {
      const { data, error } = await supabase
        .from('bookings')
        .update({ status: 'booked', booking_type: 'regular', course_enrollment_id: p.enrollmentId, updated_at: new Date().toISOString() })
        .eq('id', cancelled.id)
        .select()
        .single();
      if (error) throw error;
      booking = data;
      console.log(`\n✅ Re-seated ${p.name} in class #${firstClass.id} — booking #${booking.id} cancelled -> booked`);
    } else {
      booking = await createBooking({
        studentId: p.studentId,
        classInstanceId: firstClass.id,
        courseEnrollmentId: p.enrollmentId,
        bookingType: 'regular',
        status: 'booked',
      });
      console.log(`\n✅ Booked ${p.name} into class #${firstClass.id} (booking #${booking.id})`);
    }
  }

  // ── 2. Activate the draft classes ─────────────────────────────────────────
  const cynthia = before.enrollments.find(e => e.id === 5497);
  const activated = await activateDraftClasses(cynthia);
  console.log(`\n✅ activateDraftClasses: ${activated} class(es) moved to active`);

  // ── 3. Rebuild current_enrollment from real booked rows ───────────────────
  console.log('\n=== current_enrollment rebuild ===');
  for (const c of before.classes) {
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('class_instance_id', c.id)
      .eq('status', 'booked');
    const real = count || 0;
    if (real !== c.current_enrollment) {
      const { error } = await supabase.from('class_instances').update({ current_enrollment: real }).eq('id', c.id);
      if (error) throw error;
      console.log(`  #${c.id} ${c.class_type}: ${c.current_enrollment} -> ${real}`);
    } else {
      console.log(`  #${c.id} ${c.class_type}: ${real} (already correct)`);
    }
  }

  // ── 4. Credit cache ───────────────────────────────────────────────────────
  console.log('\n=== credit cache sync ===');
  for (const e of before.enrollments) {
    const credits = await syncStoredCredits(e.id);
    console.log(`  enr #${e.id} ${EXPECTED[e.id].name}: ${JSON.stringify(credits)}`);
  }

  // ── 5. Google Calendar ────────────────────────────────────────────────────
  try {
    const calendarSync = require('../utils/calendarSync');
    if (calendarSync.isEnabled && calendarSync.isEnabled()) {
      const results = await Promise.all(before.classes.map(c =>
        calendarSync.syncClassInstance(c.id).then(() => 'ok').catch(err => err.message)));
      console.log(`\n=== Google Calendar ===\n  ${results.join('\n  ')}`);
    } else {
      console.log('\n=== Google Calendar ===\n  sync disabled — skipped');
    }
  } catch (e) {
    console.log(`\n=== Google Calendar ===\n  FAILED (cosmetic): ${e.message}`);
  }

  // ── 6. Verify ─────────────────────────────────────────────────────────────
  const after = await loadState();
  printState('AFTER', after);

  const problems = [];
  for (const c of after.classes) {
    if (c.status !== 'active') problems.push(`class #${c.id} ${c.class_type} status=${c.status}, expected active`);
    const booked = after.bookings.filter(b => b.class_instance_id === c.id && b.status === 'booked').length;
    if (booked !== 2) problems.push(`class #${c.id} ${c.class_type} has ${booked} booked rows, expected 2`);
    if (c.current_enrollment !== booked) problems.push(`class #${c.id} current_enrollment=${c.current_enrollment} but ${booked} booked`);
    if (weekdayName(c.class_date) !== 'THURSDAY') problems.push(`class #${c.id} is not on a Thursday`);
  }
  for (const e of after.enrollments) {
    const led = await getEnrollmentCredits(e.id);
    if (e.class_credits_used !== led.committed) problems.push(`enr #${e.id} cache used=${e.class_credits_used} vs ledger committed=${led.committed}`);
    if (e.class_credits_remaining !== led.remaining) problems.push(`enr #${e.id} cache remaining=${e.class_credits_remaining} vs ledger remaining=${led.remaining}`);
  }

  console.log('\n=== VERIFY ===');
  if (problems.length) {
    problems.forEach(p => console.log(`  ✗ ${p}`));
    process.exitCode = 1;
  } else {
    console.log('  ✓ 6/6 classes active on Thursdays, 2 booked students each, caches match the ledger');
  }
  console.log('\nNo email sent. The students were last told (09/09) the course was POSTPONED to 17 Sep — they have not been told it is confirmed.');
})().catch(err => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
