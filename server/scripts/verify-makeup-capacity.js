// Verify the third make-up seat on a 6-week WT's weeks 4 and 5.
//
// Read-only. Checks the pure rules in config/capacity.js, then puts real
// upcoming class_instances through the live booking gate to confirm a 6.4 / 6.5
// reports 11 places while its neighbouring weeks still report 10.
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
  console.log('— rules —');
  t('6wk WT week 4 carries it',  cap.hasExtraMakeupSeat('WT0507AM_DL6.4'), true);
  t('6wk WT week 5 carries it',  cap.hasExtraMakeupSeat('WT0507AM_DL6.5'), true);
  t('6wk WT week 3 does not',    cap.hasExtraMakeupSeat('WT0507AM_DL6.3'), false);
  t('6wk WT glazing does not',   cap.hasExtraMakeupSeat('WT0507AM_DL6.6'), false);
  t('7wk WT week 4 does not',    cap.hasExtraMakeupSeat('WT1104AM_DL7.4'), false);
  t('HB does not',               cap.hasExtraMakeupSeat('HB-DROPIN'), false);
  t('unnumbered code does not',  cap.hasExtraMakeupSeat('N/A'), false);

  t('room cap 6.4 from 10',      cap.roomCapacity({ class_type: 'WT0507AM_DL6.4', max_capacity: 10 }), 11);
  t('room cap 6.4 idempotent',   cap.roomCapacity({ class_type: 'WT0507AM_DL6.4', max_capacity: 11 }), 11);
  t('hand-raised 14 preserved',  cap.roomCapacity({ class_type: 'WT0507AM_DL6.4', max_capacity: 14 }), 14);
  t('room cap 6.3 unchanged',    cap.roomCapacity({ class_type: 'WT0507AM_DL6.3', max_capacity: 10 }), 10);
  t('glazing 14 unchanged',      cap.roomCapacity({ class_type: 'WT0507AM_DL6.6', max_capacity: 14 }), 14);
  t('HB 8 unchanged',            cap.roomCapacity({ class_type: 'HB-DROPIN', max_capacity: 8 }), 8);

  t('make-ups on 6.4',           cap.makeupSeats('WT0507AM_DL6.4'), 3);
  t('make-ups on 6.2',           cap.makeupSeats('WT0507AM_DL6.2'), 2);
  t('signups + make-ups on 6.4', cap.WT_SIGNUP_CAP + cap.makeupSeats('WT0507AM_DL6.4'), 11);
  t('signups + make-ups on 6.2', cap.WT_SIGNUP_CAP + cap.makeupSeats('WT0507AM_DL6.2'), 10);

  t('ceiling read off 6.4',      cap.wheelCapFor({ class_type: 'WT0507AM_DL6.4' }), 11);
  t('ceiling read off 6.3',      cap.wheelCapFor({ class_type: 'WT0507AM_DL6.3' }), 10);
  t('ceiling for HB in slot',    cap.wheelCapFor({ class_type: 'HB-DROPIN' }), 10);
}

async function storedColumns() {
  console.log('\n— stored max_capacity —');
  const { data } = await supabase
    .from('class_instances')
    .select('id, class_type, max_capacity')
    .like('class_type', 'WT%');

  const wide = (data || []).filter(r => cap.hasExtraMakeupSeat(r.class_type));
  const narrow = wide.filter(r => (r.max_capacity || 0) < cap.WT_EXTRA_ROOM_CAP);
  t(`all ${wide.length} of 6.4/6.5 stored at >= ${cap.WT_EXTRA_ROOM_CAP}`, narrow.length, 0);
  if (narrow.length) narrow.slice(0, 10).forEach(r => console.log(`      #${r.id} ${r.class_type} = ${r.max_capacity}`));

  // Nothing outside 6.4/6.5 should have been widened by this change.
  const others = (data || []).filter(r => !cap.hasExtraMakeupSeat(r.class_type));
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

  const wide = (upcoming || []).find(c => cap.hasExtraMakeupSeat(c.class_type));
  const plain = (upcoming || []).find(c => !cap.hasExtraMakeupSeat(c.class_type) && /6\.[123]$/.test(c.class_type));

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
  await storedColumns();
  await liveGate();
  console.log(fail ? `\n❌ ${fail} FAILURE(S)` : '\n✅ All checks passed.');
  process.exit(fail ? 1 : 0);
})();
