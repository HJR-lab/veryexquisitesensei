// Verify the wider room on a 6-week WT's weeks 4 and 5, and the per-instructor
// room sizes that sit alongside it.
//
// Read-only. Checks the pure rules in config/capacity.js, then puts real
// upcoming class_instances through the live booking gate to confirm a 6.4 / 6.5
// reports 11 places while its neighbouring weeks still report 10.
//
// The general rules are exercised with JL codes. DL has its own numbers
// (INSTRUCTOR_WEEK_CAPS) and is checked separately below — including that they
// bite only at creation and leave a running cohort's stored value alone.
//
// The eleventh place is not reserved for a make-up — the gate never asks what
// kind of booking it is looking at, only whether the room is under cap.
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');
const { checkSeatAvailability } = require('../utils/bookingDb');
const cap = require('../config/capacity');

let fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};

function rules() {
  console.log('— general rules (JL) —');
  t('6wk WT week 4 is wide',     cap.hasWideRoom('WT0809NT_JL6.4'), true);
  t('6wk WT week 5 is wide',     cap.hasWideRoom('WT0809NT_JL6.5'), true);
  t('6wk WT week 3 does not',    cap.hasWideRoom('WT0809NT_JL6.3'), false);
  t('6wk WT glazing does not',   cap.hasWideRoom('WT0809NT_JL6.6'), false);
  t('7wk WT week 4 does not',    cap.hasWideRoom('WT1104AM_JL7.4'), false);
  t('HB does not',               cap.hasWideRoom('HB-DROPIN'), false);
  t('unnumbered code does not',  cap.hasWideRoom('N/A'), false);

  t('room cap 6.4 from 10',      cap.roomCapacity({ class_type: 'WT0809NT_JL6.4', max_capacity: 10 }), 11);
  t('room cap 6.4 idempotent',   cap.roomCapacity({ class_type: 'WT0809NT_JL6.4', max_capacity: 11 }), 11);
  t('hand-raised 14 preserved',  cap.roomCapacity({ class_type: 'WT0809NT_JL6.4', max_capacity: 14 }), 14);
  t('room cap 6.3 unchanged',    cap.roomCapacity({ class_type: 'WT0809NT_JL6.3', max_capacity: 10 }), 10);
  t('glazing 14 unchanged',      cap.roomCapacity({ class_type: 'WT0809NT_JL6.6', max_capacity: 14 }), 14);
  t('HB 8 unchanged',            cap.roomCapacity({ class_type: 'HB-DROPIN', max_capacity: 8 }), 8);

  // The split is not a rule: any mix of signups and make-ups is fine under cap.
  t('signup cap still 8',        cap.WT_SIGNUP_CAP, 8);
  t('6.4 room holds 11',         cap.WT_WIDE_ROOM_CAP, 11);
  t('ordinary room holds 10',    cap.WT_ROOM_CAP, 10);
  t('no make-up allowance exported', typeof cap.makeupSeats, 'undefined');

  t('ceiling read off 6.4',      cap.wheelCapFor({ class_type: 'WT0809NT_JL6.4' }), 11);
  t('ceiling read off 6.3',      cap.wheelCapFor({ class_type: 'WT0809NT_JL6.3' }), 10);
  t('ceiling for HB in slot',    cap.wheelCapFor({ class_type: 'HB-DROPIN' }), 10);
}

function instructorRules() {
  console.log('\n— per-instructor room sizes (DL) —');
  t('instructor code parsed',    cap.parseInstructorCode('WT0110AM_DL6.4'), 'DL');
  t('no code on HB',             cap.parseInstructorCode('HB-DROPIN'), null);

  t('DL 6.4 has its own number', cap.instructorRoomCap('WT0110AM_DL6.4'), 10);
  t('DL 6.5 has its own number', cap.instructorRoomCap('WT0110AM_DL6.5'), 10);
  t('DL 6.6 has its own number', cap.instructorRoomCap('WT0110AM_DL6.6'), 12);
  t('DL 6.3 does not',           cap.instructorRoomCap('WT0110AM_DL6.3'), null);
  t('DL 7wk excluded',           cap.instructorRoomCap('WT1104AM_DL7.4'), null);
  t('JL has none',               cap.instructorRoomCap('WT0809NT_JL6.4'), null);

  // DL is off the wide-room rule, so nothing widens a 10 back to 11.
  t('DL 6.4 not wide',           cap.hasWideRoom('WT0110AM_DL6.4'), false);
  t('DL 6.5 not wide',           cap.hasWideRoom('WT0110AM_DL6.5'), false);

  // What a NEW DL class is created at.
  t('new DL 6.4 created at 10',  cap.initialRoomCapacity('WT0110AM_DL6.4', 10), 10);
  t('new DL 6.5 created at 10',  cap.initialRoomCapacity('WT0110AM_DL6.5', 10), 10);
  t('new DL 6.6 created at 12',  cap.initialRoomCapacity('WT0110AM_DL6.6', 14), 12);
  t('new JL 6.4 created at 11',  cap.initialRoomCapacity('WT0809NT_JL6.4', 10), 11);
  t('new JL 6.6 created at 14',  cap.initialRoomCapacity('WT0809NT_JL6.6', 14), 14);

  // A cohort already running keeps the room it was sold — the numbers bite at
  // creation only, so nothing here may shrink a stored value.
  t('mid-run DL 6.5 keeps 11',   cap.roomCapacity({ class_type: 'WT3008AM_DL6.5', max_capacity: 11 }), 11);
  t('mid-run DL 6.6 keeps 14',   cap.roomCapacity({ class_type: 'WT2908PM_DL6.6', max_capacity: 14 }), 14);
  t('mid-run DL 6.5 ceiling 11', cap.wheelCapFor({ class_type: 'WT3008AM_DL6.5', max_capacity: 11 }), 11);
  t('mid-run DL 6.6 ceiling 14', cap.wheelCapFor({ class_type: 'WT2908PM_DL6.6', max_capacity: 14 }), 14);

  // A new DL cohort, once stored, reads back at its own numbers.
  t('new DL 6.4 room 10',        cap.roomCapacity({ class_type: 'WT0110AM_DL6.4', max_capacity: 10 }), 10);
  t('new DL 6.4 ceiling 10',     cap.wheelCapFor({ class_type: 'WT0110AM_DL6.4', max_capacity: 10 }), 10);
  t('new DL 6.6 room 12',        cap.roomCapacity({ class_type: 'WT0110AM_DL6.6', max_capacity: 12 }), 12);
  t('new DL 6.6 ceiling 12',     cap.wheelCapFor({ class_type: 'WT0110AM_DL6.6', max_capacity: 12 }), 12);
}

async function storedColumns() {
  console.log('\n— stored max_capacity —');
  const { data } = await supabase
    .from('class_instances')
    .select('id, class_type, max_capacity')
    .like('class_type', 'WT%');

  const wide = (data || []).filter(r => cap.hasWideRoom(r.class_type));
  const narrow = wide.filter(r => (r.max_capacity || 0) < cap.WT_WIDE_ROOM_CAP);
  t(`all ${wide.length} of 6.4/6.5 stored at >= ${cap.WT_WIDE_ROOM_CAP}`, narrow.length, 0);
  if (narrow.length) narrow.slice(0, 10).forEach(r => console.log(`      #${r.id} ${r.class_type} = ${r.max_capacity}`));

  // Nothing outside 6.4/6.5 should have been widened by this change. An
  // instructor-capped class is exempt: its stored value is whatever it was
  // created at, and mid-run DL cohorts legitimately still sit at 11.
  const others = (data || []).filter(r =>
    !cap.hasWideRoom(r.class_type) && cap.instructorRoomCap(r.class_type) === null);
  const stray = others.filter(r => r.max_capacity === 11);
  t('no non-6.4/6.5 WT class sitting at exactly 11', stray.length, 0);
  if (stray.length) stray.slice(0, 10).forEach(r => console.log(`      #${r.id} ${r.class_type} = ${r.max_capacity}`));
}

async function liveGate() {
  console.log('\n— live booking gate —');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
  const { data: upcoming } = await supabase
    .from('class_instances')
    .select('id, class_type, class_date, start_time, max_capacity, is_glazing, glazing_capacity')
    .like('class_type', 'WT%')
    .gte('class_date', today)
    .order('class_date')
    .limit(400);

  const wide = (upcoming || []).find(c => cap.hasWideRoom(c.class_type));
  const plain = (upcoming || []).find(c => !cap.hasWideRoom(c.class_type) && /6\.[123]$/.test(c.class_type));

  // Student id 0 matches nobody, so no capacity_overrides grant can be found —
  // this reads the caps only and cannot be skewed by an existing grant.
  if (wide) {
    const seat = await checkSeatAvailability(wide, 0, { checkWheels: true });
    console.log(`      ${wide.class_type} on ${String(wide.class_date).slice(0, 10)} — booked ${seat.counts.booked}`);
    t(`${wide.class_type} instance cap`, seat.counts.cap, 11);
    t(`${wide.class_type} timeslot ceiling`, seat.counts.studioWheels, 11);
  } else { fail++; console.log('FAIL  no upcoming 6.4/6.5 class found to check'); }

  if (plain) {
    const seat = await checkSeatAvailability(plain, 0, { checkWheels: true });
    console.log(`      ${plain.class_type} on ${String(plain.class_date).slice(0, 10)} — booked ${seat.counts.booked}`);
    t(`${plain.class_type} instance cap`, seat.counts.cap, 10);
    t(`${plain.class_type} timeslot ceiling`, seat.counts.studioWheels, 10);
  } else { fail++; console.log('FAIL  no upcoming ordinary WT week found to check'); }
}

(async () => {
  rules();
  instructorRules();
  await storedColumns();
  await liveGate();
  console.log(fail ? `\n❌ ${fail} FAILURE(S)` : '\n✅ All checks passed.');
  process.exit(fail ? 1 : 0);
})();
