/**
 * Seat Ignacius Tay (2625) as the 11th student in WT1009NT_JL6.3 (class 14455,
 * Thu 24/09/26 7pm). Approved by Justin 24/09/26.
 *
 * The class holds 10 booked against the 10-wheel teaching ceiling, so this goes
 * through a capacity_overrides grant, exactly as the admin UI does.
 *
 * He already owns a row on this class (30289, status 'rescheduled' — he moved
 * out on 14/09 and then cancelled the Friday class he moved to). The admin
 * booking route 409s on any non-cancelled row, so we reopen that origin row
 * rather than insert a duplicate. It is linked to enrollment 5487, whose last
 * credit it spends (remaining 1 → 0).
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../utils/supabaseDb');
const { supabase } = db;

const STUDENT_ID = 2625;
const CLASS_ID = 14455;
const BOOKING_ID = 30289;
const ENROLLMENT_ID = 5487;
const APPLY = process.argv.includes('--apply');

(async () => {
  const { data: cls } = await supabase.from('class_instances')
    .select('id, class_type, class_date, start_time, max_capacity, status, is_glazing, glazing_capacity')
    .eq('id', CLASS_ID).single();
  const { data: bk } = await supabase.from('bookings')
    .select('id, student_id, class_instance_id, status, course_enrollment_id')
    .eq('id', BOOKING_ID).single();

  if (cls?.class_type !== 'WT1009NT_JL6.3' || cls.status !== 'active') throw new Error(`Unexpected class: ${JSON.stringify(cls)}`);
  if (bk?.student_id !== STUDENT_ID || bk.class_instance_id !== CLASS_ID || bk.course_enrollment_id !== ENROLLMENT_ID) {
    throw new Error(`Unexpected booking: ${JSON.stringify(bk)}`);
  }
  if (bk.status === 'booked') { console.log('Already booked — nothing to do.'); return; }
  if (bk.status !== 'rescheduled') throw new Error(`Booking status is ${bk.status}, expected rescheduled`);

  const before = await db.getEnrollmentCredits(ENROLLMENT_ID);
  const seatBefore = await db.checkSeatAvailability(cls, STUDENT_ID, { checkWheels: true });
  console.log('Class:', cls.class_type, cls.class_date, cls.start_time, 'max_capacity', cls.max_capacity);
  console.log('Seat gate now:', seatBefore.allowed ? 'ALLOWED' : seatBefore.reason, seatBefore.counts);
  console.log('Enrollment 5487 credits now:', before);
  if (before.remaining < 1) throw new Error('No credit left on 5487');

  if (!APPLY) {
    console.log('\nDRY RUN — would: grant capacity override, reopen booking 30289 (rescheduled → booked), consume override, sync credits (remaining 1 → 0).');
    return;
  }

  const { data: ov, error: ovErr } = await supabase.from('capacity_overrides').insert({
    class_instance_id: CLASS_ID,
    student_id: STUDENT_ID,
    reason: '11th student in WT1009NT_JL6.3 — approved by Justin 24/09/26; rejoining his own cohort class after a cancelled reschedule',
    created_by: 'info@ves.sg',
    created_at: new Date().toISOString(),
  }).select().single();
  if (ovErr) throw ovErr;

  const seat = await db.checkSeatAvailability(cls, STUDENT_ID, { checkWheels: true });
  if (!seat.allowed) throw new Error(`Seat still refused after override: ${seat.reason}`);

  const { error: upErr } = await supabase.from('bookings')
    .update({ status: 'booked', updated_at: new Date().toISOString() })
    .eq('id', BOOKING_ID).eq('status', 'rescheduled');
  if (upErr) throw upErr;

  await db.consumeCapacityOverride(ov.id, BOOKING_ID);
  await db.updateClassEnrollment(CLASS_ID, 1);
  await db.syncStoredCredits(ENROLLMENT_ID);

  const after = await db.getEnrollmentCredits(ENROLLMENT_ID);
  const { count } = await supabase.from('bookings').select('id', { count: 'exact', head: true })
    .eq('class_instance_id', CLASS_ID).in('status', ['booked', 'attended']);
  console.log(`\nDONE — booking ${BOOKING_ID} booked, override ${ov.id} consumed. Class now ${count} booked. Credits:`, after);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
