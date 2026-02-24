require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkSarahEnrollmentStatus() {
  console.log('=== CHECKING SARAH ENROLLMENT STATUS ===\n');

  const sarahId = 1197;

  // Get ALL enrollments regardless of status
  const { data: allEnrollments, error } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', sarahId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Total enrollments for Sarah (ID ${sarahId}): ${allEnrollments?.length || 0}\n`);

  if (allEnrollments && allEnrollments.length > 0) {
    allEnrollments.forEach((enrollment, idx) => {
      console.log(`Enrollment ${idx + 1}:`);
      console.log(`  ID: ${enrollment.id}`);
      console.log(`  Status: ${enrollment.status}`);
      console.log(`  Course Type: ${enrollment.course_type}`);
      console.log(`  Start Date: ${enrollment.course_start_date}`);
      console.log(`  Schedule: ${enrollment.schedule_pattern}`);
      console.log(`  Time: ${enrollment.class_time}`);
      console.log('');
    });
  }

  // Check how many have 'active' status
  const activeCount = allEnrollments?.filter(e => e.status === 'active').length || 0;
  console.log(`Enrollments with status='active': ${activeCount}`);
  console.log(`Enrollments with other status: ${(allEnrollments?.length || 0) - activeCount}`);

  if (activeCount === 0) {
    console.log('\n❌ PROBLEM: Sarah has NO enrollments with status="active"');
    console.log('This is why getStudentBookings() returns 0 bookings!');
    console.log('\nStatus values found:');
    const statuses = {};
    allEnrollments?.forEach(e => {
      statuses[e.status] = (statuses[e.status] || 0) + 1;
    });
    Object.keys(statuses).forEach(status => {
      console.log(`  "${status}": ${statuses[status]}`);
    });
  }
}

checkSarahEnrollmentStatus().then(() => process.exit());
