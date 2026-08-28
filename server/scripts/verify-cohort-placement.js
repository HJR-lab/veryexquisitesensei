// Verify that every student sits in the cohort they bought, and that the guard
// which keeps them there still holds.
//
//   node scripts/verify-cohort-placement.js
//
// CHECK 1 (data): for every upcoming enrollment, its regular bookings fall on
// the weekday its schedule_pattern names, and belong to its course_identifier.
// Make-up and rescheduled bookings are excluded — landing in another cohort is
// the whole point of those.
//
// CHECK 2 (guard): findCopyablePeer must refuse a peer that is booked into a
// different cohort. Replays the real Thursday 10 Sep case, where Doreen was
// moved to the Tuesday 8 Sep cohort and every later Thursday buyer was then
// booked into her Tuesday classes.

require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');
const { toYmd, isWeekday, weekdayName, todaySGT } = require('../utils/sgtDate');
const { findCopyablePeer } = require('../utils/courseEnrollmentManager');

let failures = 0;
const fail = msg => { failures++; console.log(`  FAIL  ${msg}`); };
const pass = msg => console.log(`  ok    ${msg}`);

async function checkPlacement() {
  console.log('\nCHECK 1 — every upcoming enrollment sits in its own cohort\n');

  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_identifier, course_start_date, schedule_pattern, status')
    .gte('course_start_date', todaySGT())
    .not('schedule_pattern', 'is', null)
    .neq('status', 'cancelled');

  let checked = 0;
  for (const e of enrollments || []) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, booking_type, original_class_instance_id, class_instances!bookings_class_instance_id_fkey(class_type, class_date)')
      .eq('course_enrollment_id', e.id)
      .eq('status', 'booked');

    // Only bookings still sitting where the cohort put them.
    const regular = (bookings || []).filter(b =>
      b.booking_type !== 'makeup' && !b.original_class_instance_id && b.class_instances);
    if (regular.length === 0) continue;
    checked++;

    const wrongDay = regular.filter(b => !isWeekday(toYmd(b.class_instances.class_date), e.schedule_pattern));
    if (wrongDay.length > 0) {
      const sample = wrongDay[0].class_instances;
      fail(`enrollment ${e.id} (${e.schedule_pattern} ${toYmd(e.course_start_date)}): ${wrongDay.length} booking(s) on a ${weekdayName(toYmd(sample.class_date))} — ${sample.class_type} ${toYmd(sample.class_date)}`);
      continue;
    }

    const foreign = regular.filter(b =>
      e.course_identifier && !String(b.class_instances.class_type).startsWith(`${e.course_identifier}.`));
    if (foreign.length > 0) {
      fail(`enrollment ${e.id}: ${foreign.length} booking(s) outside ${e.course_identifier} — ${foreign[0].class_instances.class_type}`);
    }
  }
  if (failures === 0) pass(`${checked} enrollment(s) with regular bookings, all in their own cohort`);
}

async function checkGuard() {
  console.log('\nCHECK 2 — a peer booked into another cohort is never copied\n');

  const { data: peers } = await supabase
    .from('course_enrollments')
    .select('*')
    .in('id', [5458, 5478]); // Doreen (moved to Tuesday), Evangeline (Thursday)

  if (!peers || peers.length < 2) {
    fail('could not load the Thursday 10 Sep fixture enrollments (5458, 5478)');
    return;
  }
  const doreen = peers.find(p => p.id === 5458);
  const evangeline = peers.find(p => p.id === 5478);

  // A brand-new Thursday 10 Sep buyer, offered both peers, oldest first —
  // which is the order that produced the bug.
  const newcomer = {
    id: 999999,
    student_id: 0,
    course_start_date: '2026-09-10',
    schedule_pattern: 'THURSDAY',
    class_time: '7:00 PM - 9:30 PM',
  };

  const chosen = await findCopyablePeer(newcomer, [doreen, evangeline]);
  if (!chosen) fail('no peer chosen — the Thursday cohort would be rebuilt instead of joined');
  else if (chosen.id === doreen.id) fail('chose the peer sitting in the Tuesday 8 Sep cohort');
  else pass(`chose enrollment ${chosen.id}, the peer actually booked into Thursday 10 Sep`);

  // And with only the mis-placed peer on offer, nothing is copyable.
  const doreenOnly = await findCopyablePeer(newcomer, [doreen]);
  if (doreenOnly) fail('a lone mis-placed peer was still treated as copyable');
  else pass('a lone mis-placed peer is refused');

  // A peer stamped as booked but holding no bookings is not copyable either.
  const ghost = { ...evangeline, id: -1, bookings_created_at: new Date().toISOString() };
  const ghostPick = await findCopyablePeer(newcomer, [ghost]);
  if (ghostPick) fail('a peer with no bookings was treated as copyable');
  else pass('a peer stamped booked but holding no bookings is refused');
}

(async () => {
  await checkPlacement();
  await checkGuard();
  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
