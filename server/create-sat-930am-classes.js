require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  // Get Saturday 9:30am enrollments (those with 9:30am time OR no time)
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('status', 'active')
    .ilike('course_type', '%wheelthrowing%')
    .eq('schedule_pattern', 'SATURDAY')
    .eq('course_start_date', '2026-01-17')
    .or('class_time.is.null,class_time.ilike.%9:30am%');

  console.log('Found', enrollments.length, 'Saturday 9:30am enrollments\n');

  if (enrollments.length < 4) {
    console.log('Below threshold');
    process.exit(0);
  }

  // Create 6 classes (Saturdays from Jan 17 to Feb 21)
  const dates = [
    '2026-01-17',
    '2026-01-24',
    '2026-01-31',
    '2026-02-07',
    '2026-02-14',
    '2026-02-21'
  ];

  const now = new Date().toISOString();
  const classesToCreate = dates.map((date, idx) => ({
    class_date: date,
    start_time: '9:30am',
    end_time: '12:00pm',
    class_type: `WT1701AM_DL6.${idx + 1}`,
    instructor: 'Dillon Lin',
    room: 'Studio A',
    max_capacity: 10,
    current_enrollment: enrollments.length,
    status: 'scheduled',
    created_at: now,
    updated_at: now
  }));

  console.log('Creating', classesToCreate.length, 'Saturday 9:30am classes...');

  const { data: created, error } = await supabase
    .from('class_instances')
    .insert(classesToCreate)
    .select();

  if (error) {
    console.log('Error:', error.message);
    process.exit(1);
  }

  console.log('Created', created.length, 'classes\n');

  // Create bookings
  const bookings = [];
  for (const e of enrollments) {
    for (const c of created) {
      bookings.push({
        student_id: e.student_id,
        class_instance_id: c.id,
        status: 'booked',
        booking_type: 'regular',
        course_enrollment_id: e.id,
        booking_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  }

  const { data: createdBookings } = await supabase
    .from('bookings')
    .insert(bookings)
    .select();

  console.log('Created', createdBookings.length, 'bookings\n');

  // Update enrollments
  for (const e of enrollments) {
    await supabase
      .from('course_enrollments')
      .update({ bookings_created_at: now })
      .eq('id', e.id);
  }

  console.log('✅ Done!');
  process.exit(0);
})();
