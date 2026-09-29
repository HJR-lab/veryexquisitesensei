/**
 * Order #2765 (Siya Yang, qty 2): "Handbuilding 4 Weeks / THURSDAYS" bought
 * 26/09/26, while the variant still read 10:30pm. It was later corrected in
 * Shopify to 10:30am. The Thursday HB slot didn't exist until 29/09/26
 * (HBTHUAM_LT), so the two enrollments had no class to go into.
 *
 * This corrects the stored time on enrollments 5522/5523 (PM → AM) and seats
 * both students in the first class, Thu 01/10/26 10:30am. They book the
 * remaining 3 credits themselves.
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../utils/supabaseDb');
const calendarSync = require('../utils/calendarSync');
const { supabase } = db;

const ENROLLMENTS = [5522, 5523];
const CLASS_TYPE = 'HBTHUAM_LT';
const FIRST_DATE = '2026-10-01';
const APPLY = process.argv.includes('--apply');

(async () => {
  const { data: cls } = await supabase.from('class_instances')
    .select('id, class_type, class_date, start_time, end_time, max_capacity, status')
    .eq('class_type', CLASS_TYPE).gte('class_date', FIRST_DATE).lte('class_date', `${FIRST_DATE}T23:59:59`)
    .single();
  if (!cls || cls.status !== 'active') throw new Error(`No active ${CLASS_TYPE} on ${FIRST_DATE}: ${JSON.stringify(cls)}`);
  console.log('Class:', cls.id, cls.class_type, cls.class_date, cls.start_time, '-', cls.end_time);

  const { data: enrs } = await supabase.from('course_enrollments')
    .select('id, student_id, shopify_order_id, course_variant_title, class_time, course_identifier, status')
    .in('id', ENROLLMENTS);
  for (const e of enrs) {
    if (e.shopify_order_id !== '18908509634718' || e.status !== 'active') throw new Error(`Unexpected enrollment ${JSON.stringify(e)}`);
    const { data: existing } = await supabase.from('bookings').select('id, status')
      .eq('student_id', e.student_id).eq('class_instance_id', cls.id).neq('status', 'cancelled');
    const credits = await db.getEnrollmentCredits(e.id);
    console.log(`Enrollment ${e.id} student ${e.student_id}: ${e.class_time}, credits`, credits, existing?.length ? `ALREADY BOOKED ${existing[0].id}` : '');
    e._already = existing?.length > 0;
  }

  if (!APPLY) {
    console.log('\nDRY RUN — would: set class_time "10:30 AM - 12:30 PM", course_identifier HBTHUAM_LT, variant title 10:30am–12:30pm; book both into class', cls.id);
    return;
  }

  for (const e of enrs) {
    const { error } = await supabase.from('course_enrollments').update({
      class_time: '10:30 AM - 12:30 PM',
      course_variant_title: '4 Weeks / THURSDAYS: 10:30am–12:30pm',
      course_identifier: CLASS_TYPE,
      updated_at: new Date().toISOString(),
    }).eq('id', e.id);
    if (error) throw error;

    if (!e._already) {
      const booking = await db.createBooking({
        studentId: e.student_id,
        classInstanceId: cls.id,
        courseEnrollmentId: e.id,
        bookingType: 'regular',
      });
      await db.updateClassEnrollment(cls.id, 1);
      console.log(`Booked ${e.student_id} → booking ${booking.id}`);
    }
    await db.syncStoredCredits(e.id);
    console.log(`Enrollment ${e.id} credits now`, await db.getEnrollmentCredits(e.id));
  }
  await calendarSync.syncClassInstance(cls.id);
  console.log('\nDONE — calendar event synced.');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
