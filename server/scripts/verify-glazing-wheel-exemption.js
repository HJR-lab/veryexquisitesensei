// Verify that a glazing class is gated by its own capacity, not the timeslot
// throwing ceiling.
//
// Read-only. Nobody throws at a glazing class, so STUDIO_WHEELS — a limit on how
// many throwers one instructor can teach at once — does not apply to it. Every
// 6.6 instance is created at max_capacity 14 to say exactly that, but the ceiling
// used to override it silently: the booking page offered the seats (it reads
// max_capacity) and the server refused them with STUDIO_FULL.
//
// Concretely: Shaun Goh could not move his glazing to WT2507AM_DL6.6 on 5 Sep,
// a class showing 10 of 14 booked.
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');
const { checkSeatAvailability } = require('../utils/bookingDb');
const { isGlazingClass } = require('../utils/glazing');
const cap = require('../config/capacity');

let fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};

function rules() {
  console.log('— rules —');
  // A WT cohort's final week is glazing structurally; a marked class is glazing
  // explicitly. Both read their own capacity as the ceiling.
  t('6.6 ceiling is its own 14',   cap.wheelCapFor({ class_type: 'WT2507AM_DL6.6', max_capacity: 14 }), 14);
  t('7.7 ceiling is its own 14',   cap.wheelCapFor({ class_type: 'WT1104AM_DL7.7', max_capacity: 14 }), 14);
  t('marked HB ceiling is its 8',  cap.wheelCapFor({ class_type: 'HBFRINT_LT', max_capacity: 8, is_glazing: true }), 8);

  // Everything that is not glazing is untouched.
  t('6.3 still held to 10',        cap.wheelCapFor({ class_type: 'WT2507AM_DL6.3', max_capacity: 10 }), 10);
  t('6.4 still holds 11',          cap.wheelCapFor({ class_type: 'WT2507AM_DL6.4', max_capacity: 10 }), 11);
  t('6.5 still holds 11',          cap.wheelCapFor({ class_type: 'WT2507AM_DL6.5', max_capacity: 10 }), 11);
  t('plain HB still held to 10',   cap.wheelCapFor({ class_type: 'HBFRINT_LT', max_capacity: 8 }), 10);
  t('unnumbered code held to 10',  cap.wheelCapFor({ class_type: 'N/A' }), 10);

  // A glazing row with no stored capacity falls back to the ordinary room cap
  // rather than to nothing — the exemption widens nothing on its own.
  t('glazing with no stored cap',  cap.wheelCapFor({ class_type: 'WT2507AM_DL6.6' }), cap.WT_ROOM_CAP);

  t('ceiling constant unchanged',  cap.STUDIO_WHEELS, 10);
}

async function liveGate() {
  console.log('\n— live booking gate —');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
  const { data: upcoming } = await supabase
    .from('class_instances')
    .select('id, class_type, class_date, start_time, max_capacity, is_glazing, glazing_capacity')
    .gte('class_date', today)
    .eq('status', 'active')
    .order('class_date')
    .limit(400);

  const glazing = (upcoming || []).filter(isGlazingClass);
  if (!glazing.length) { fail++; console.log('FAIL  no upcoming glazing class found to check'); return; }

  // Student id 0 matches nobody, so no capacity_overrides grant can be found —
  // this reads the caps only and cannot be skewed by an existing grant.
  let blocked = 0;
  for (const c of glazing) {
    const seat = await checkSeatAvailability(c, 0, { checkWheels: true });
    const date = String(c.class_date).slice(0, 10);
    const own = cap.roomCapacity(c);
    console.log(`      ${c.class_type} ${date} ${c.start_time} — booked ${seat.counts.booked}/${own}, slot ${seat.counts.wheels}, ceiling ${seat.counts.studioWheels}`);
    t(`${c.class_type} ${date} ceiling is its own cap`, seat.counts.studioWheels, own);
    // The only thing that may now turn a glazing class away is its own capacity.
    if (!seat.allowed) {
      blocked++;
      t(`${c.class_type} ${date} refused only when genuinely full`, seat.reason, 'CLASS_FULL');
    }
  }
  console.log(`      ${glazing.length} upcoming glazing class(es), ${blocked} at capacity`);

  // The class that started this: a glazing student must be able to move into it.
  const shaunTarget = glazing.find(c => c.class_type === 'WT2507AM_DL6.6' && String(c.class_date).startsWith('2026-09-05'));
  if (shaunTarget) {
    const seat = await checkSeatAvailability(shaunTarget, 3029, { checkWheels: true });
    t('5 Sep glazing accepts a reschedule', seat.allowed, true);
  }
}

async function nonGlazingUntouched() {
  console.log('\n— non-glazing classes unchanged —');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
  const { data: upcoming } = await supabase
    .from('class_instances')
    .select('id, class_type, class_date, start_time, max_capacity, is_glazing, glazing_capacity')
    .like('class_type', 'WT%')
    .gte('class_date', today)
    .eq('status', 'active')
    .order('class_date')
    .limit(400);

  const plain = (upcoming || []).filter(c => !isGlazingClass(c) && !cap.hasWideRoom(c));
  const wrong = [];
  for (const c of plain) {
    const seat = await checkSeatAvailability(c, 0, { checkWheels: true });
    if (seat.counts.studioWheels !== cap.STUDIO_WHEELS) wrong.push(`${c.class_type} → ${seat.counts.studioWheels}`);
  }
  t(`all ${plain.length} ordinary WT weeks still held to ${cap.STUDIO_WHEELS}`, wrong.length, 0);
  if (wrong.length) wrong.slice(0, 10).forEach(w => console.log(`      ${w}`));
}

(async () => {
  rules();
  await liveGate();
  await nonGlazingUntouched();
  console.log(fail ? `\n❌ ${fail} FAILURE(S)` : '\n✅ All checks passed.');
  process.exit(fail ? 1 : 0);
})();
