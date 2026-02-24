require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createBookingsForCohort(startDate, schedule, time, className) {
  // Get enrollments for this cohort
  let query = supabase
    .from('course_enrollments')
    .select('*')
    .eq('status', 'active')
    .ilike('course_type', '%wheelthrowing%')
    .eq('course_start_date', startDate)
    .eq('schedule_pattern', schedule);

  if (time) {
    query = query.eq('class_time', time);
  } else {
    query = query.is('class_time', null);
  }

  const { data: enrollments } = await query;

  console.log(`\n${schedule} ${time || 'NO TIME'} starting ${startDate}: ${enrollments.length} students`);

  if (enrollments.length === 0) {
    console.log('  No enrollments');
    return 0;
  }

  // Find classes
  const dayOfWeek = new Date(startDate).getDay();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 42);

  const { data: allClasses } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', startDate)
    .lte('class_date', endDate.toISOString().split('T')[0])
    .ilike('class_type', `%${className}%`);

  const classes = allClasses.filter(c => new Date(c.class_date).getDay() === dayOfWeek);

  console.log(`  Found ${classes.length} matching classes`);

  if (classes.length === 0) {
    console.log('  ❌ No classes found');
    return 0;
  }

  // Create bookings
  const bookings = [];
  const now = new Date().toISOString();

  for (const e of enrollments) {
    for (const c of classes) {
      bookings.push({
        student_id: e.student_id,
        class_instance_id: c.id,
        status: 'booked',
        booking_type: 'regular',
        course_enrollment_id: e.id,
        booking_date: now,
        created_at: now,
        updated_at: now
      });
    }
  }

  const { data: created, error } = await supabase
    .from('bookings')
    .insert(bookings)
    .select();

  if (error) {
    console.log('  ❌ Error:', error.message);
    return 0;
  }

  console.log(`  ✅ Created ${created.length} bookings`);

  // Mark enrollments
  for (const e of enrollments) {
    await supabase
      .from('course_enrollments')
      .update({ bookings_created_at: now })
      .eq('id', e.id);
  }

  return created.length;
}

(async () => {
  console.log('Creating bookings for January 2026 cohorts...');

  let total = 0;

  // Saturday Jan 17, 1:00pm
  total += await createBookingsForCohort('2026-01-17', 'SATURDAY', '1:00pm - 3:30pm', 'WT1701PM');

  // Saturday Jan 17, 9:30am (both cohorts - with and without time)
  total += await createBookingsForCohort('2026-01-17', 'SATURDAY', '9:30am - 12:00pm', 'WT1701AM');
  total += await createBookingsForCohort('2026-01-17', 'SATURDAY', null, 'WT1701AM');

  // Sunday Jan 18, 9:30am (both cohorts)
  total += await createBookingsForCohort('2026-01-18', 'SUNDAY', '9:30am - 12:00pm', 'WT1801AM');
  total += await createBookingsForCohort('2026-01-18', 'SUNDAY', null, 'WT1801AM');

  // Tuesday Jan 20, 7:00pm
  total += await createBookingsForCohort('2026-01-20', 'TUESDAY', '7:00pm - 9:30pm', 'WT2001NT');

  // Thursday Jan 22, 7:00pm
  total += await createBookingsForCohort('2026-01-22', 'THURSDAY', '7:00pm - 9:30pm', 'WT2201NT');

  // Friday Jan 23, 9:30am
  total += await createBookingsForCohort('2026-01-23', 'FRIDAY', '9:30am - 12:00pm', 'WT2301AM');

  console.log(`\n✅ Total bookings created: ${total}`);
  process.exit(0);
})();
