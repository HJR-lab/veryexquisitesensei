require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function testMeghnaDashboard() {
  console.log('Testing dashboard display for students with multiple courses...\n');

  // Meghna's ID (she has 2 courses - one past, one active)
  const meghnaId = 1087;

  // Get all course enrollments for Meghna
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('id, course_title, status')
    .eq('student_id', meghnaId)
    .order('created_at', { ascending: false });

  console.log('Meghna\'s Course Enrollments:');
  enrollments.forEach(e => {
    console.log(`  - ${e.course_title} (${e.status}) - ID: ${e.id}`);
  });

  // Get the active enrollment
  const activeEnrollment = enrollments.find(e => e.status === 'active');

  if (!activeEnrollment) {
    console.log('\n❌ No active enrollment found');
    return;
  }

  console.log(`\n✅ Active Enrollment: ${activeEnrollment.course_title} (ID: ${activeEnrollment.id})`);

  // Get bookings from ALL courses
  const { data: allBookings } = await supabase
    .from('bookings')
    .select('id, status, attended, course_enrollment_id')
    .eq('student_id', meghnaId)
    .in('status', ['booked', 'attended']);

  console.log(`\nAll bookings (across all courses): ${allBookings.length}`);

  // Get bookings from ACTIVE course only
  const activeBookings = allBookings.filter(b => b.course_enrollment_id === activeEnrollment.id);
  const attendedCount = activeBookings.filter(b => b.status === 'attended' || b.attended === true).length;

  console.log(`Bookings in ACTIVE course only: ${activeBookings.length}`);
  console.log(`Attended in ACTIVE course: ${attendedCount}`);
  console.log(`Remaining in ACTIVE course: ${activeBookings.length - attendedCount}`);

  console.log('\n✅ Dashboard should now show:');
  console.log(`   Total Classes: ${activeBookings.length}`);
  console.log(`   Attended: ${attendedCount}`);
  console.log(`   Remaining: ${activeBookings.length - attendedCount}`);
}

testMeghnaDashboard().then(() => process.exit());
