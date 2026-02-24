require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkAprilEnrollments() {
  console.log('=== CHECKING APRIL\'S ENROLLMENTS ===\n');

  const aprilId = 1182;

  // Get all enrollments for April
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', aprilId)
    .order('course_start_date');

  console.log(`Total enrollments: ${enrollments?.length || 0}\n`);

  enrollments?.forEach((e, i) => {
    console.log(`Enrollment ${i + 1}:`);
    console.log(`  ID: ${e.id}`);
    console.log(`  Course: ${e.course_type}`);
    console.log(`  Schedule: ${e.schedule_pattern}`);
    console.log(`  Start Date: ${e.course_start_date}`);
    console.log(`  Status: ${e.status}`);
    console.log(`  Bookings Created: ${e.bookings_created_at ? 'YES' : 'NO'}`);
    console.log('');
  });

  // Count bookings per enrollment
  for (const enrollment of enrollments || []) {
    const { data: bookings, count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact' })
      .eq('student_id', aprilId)
      .eq('course_enrollment_id', enrollment.id);

    console.log(`Enrollment ${enrollment.id} (${enrollment.course_type || 'Unknown'}) has ${count} bookings`);
  }
}

checkAprilEnrollments().then(() => process.exit());
