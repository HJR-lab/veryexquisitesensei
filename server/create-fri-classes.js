require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('status', 'active')
    .ilike('course_type', '%wheelthrowing%')
    .eq('schedule_pattern', 'FRIDAY')
    .eq('course_start_date', '2026-01-23');

  console.log('Found', enrollments.length, 'Friday enrollments\n');

  // User confirmed 4 students total
  const studentCount = 4;

  // Create 6 classes (Fridays from Jan 23 to Feb 27)
  const dates = [
    '2026-01-23',
    '2026-01-30',
    '2026-02-06',
    '2026-02-13',
    '2026-02-20',
    '2026-02-27'
  ];

  const now = new Date().toISOString();
  const classesToCreate = dates.map((date, idx) => ({
    class_date: date,
    start_time: '9:30am',
    end_time: '12:00pm',
    class_type: `WT2301AM_JL6.${idx + 1}`,
    instructor: 'Joyce Lim',
    room: 'Studio A',
    max_capacity: 10,
    current_enrollment: studentCount,
    status: 'scheduled',
    created_at: now,
    updated_at: now
  }));

  console.log('Creating', classesToCreate.length, 'Friday classes...');

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
