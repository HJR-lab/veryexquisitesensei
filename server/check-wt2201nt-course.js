require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkCourse() {
  console.log('=== CHECKING WT2201NT THURSDAY COURSE ===\n');

  // Look for classes matching this course pattern
  const { data: classes } = await supabase
    .from('class_instances')
    .select('*')
    .ilike('class_type', 'WT%')
    .gte('class_date', '2026-01-22')
    .lte('class_date', '2026-03-31')
    .order('class_date');

  console.log(`Total WT classes in date range: ${classes?.length || 0}\n`);

  // Filter for Thursday only
  const thursdayClasses = classes?.filter(c => {
    const date = new Date(c.class_date);
    return date.getDay() === 4; // Thursday
  });

  console.log(`Thursday WT classes: ${thursdayClasses?.length || 0}\n`);

  if (thursdayClasses && thursdayClasses.length > 0) {
    console.log('EXISTING THURSDAY CLASSES:');
    thursdayClasses.forEach(c => {
      const date = new Date(c.class_date);
      const dateStr = date.toLocaleDateString('en-SG');
      const isPast = date < new Date();
      const status = isPast ? '❌ PAST' : '✅ FUTURE';
      console.log(`  ${status} ${dateStr} | ${c.start_time} | ${c.class_type} | ${c.instructor} | Room ${c.room}`);
    });
  } else {
    console.log('❌ No Thursday wheelthrowing classes found');
    console.log('\nNeed to create classes. What time does this course run?');
    console.log('Check the enrollment details for start_time...\n');
  }

  // Check enrollment details
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .in('student_id', [2320, 1137, 1166]);

  console.log('\n=== ENROLLMENT DETAILS ===\n');
  enrollments?.forEach(e => {
    console.log(`Student ${e.student_id}:`);
    console.log(`  Course: ${e.course_type}`);
    console.log(`  Schedule: ${e.schedule_pattern}`);
    console.log(`  Start Date: ${e.course_start_date}`);
    console.log(`  Start Time: ${e.start_time || 'NOT SET'}`);
    console.log(`  End Time: ${e.end_time || 'NOT SET'}`);
    console.log('');
  });

  // Check if there are bookings for any of these students
  const { data: existingBookings } = await supabase
    .from('bookings')
    .select(`
      id,
      student_id,
      class_instance:class_instances!bookings_class_instance_id_fkey (
        id,
        class_date,
        class_type,
        start_time,
        end_time
      )
    `)
    .in('student_id', [2320, 1137, 1166]);

  console.log('=== EXISTING BOOKINGS ===\n');
  if (existingBookings && existingBookings.length > 0) {
    existingBookings.forEach(b => {
      console.log(`Student ${b.student_id}: ${b.class_instance.class_date.split('T')[0]} ${b.class_instance.class_type}`);
    });
  } else {
    console.log('No bookings found for these students');
  }
}

checkCourse().then(() => process.exit());
