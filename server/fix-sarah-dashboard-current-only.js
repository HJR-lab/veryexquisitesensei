require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixSarahDashboard() {
  console.log('=== FIXING SARAH DASHBOARD - SHOW CURRENT CLASSES ONLY ===\n');

  const sarahId = 1197;

  // Set past enrollments back to 'completed' so they don't show on student dashboard
  const pastEnrollments = [4940, 5021];
  const currentEnrollment = 4843;

  console.log(`Setting past enrollments ${pastEnrollments.join(', ')} back to 'completed'\n`);

  const { data, error } = await supabase
    .from('course_enrollments')
    .update({ status: 'completed' })
    .in('id', pastEnrollments)
    .select();

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log(`✅ Updated ${data?.length || 0} enrollments to 'completed'\n`);

  // Verify current state
  const { data: allEnrollments } = await supabase
    .from('course_enrollments')
    .select('id, status, course_start_date')
    .eq('student_id', sarahId)
    .order('course_start_date');

  console.log('Sarah\'s enrollments:');
  allEnrollments?.forEach(e => {
    console.log(`  Enrollment ${e.id}: status='${e.status}', start=${e.course_start_date}`);
  });

  // Count bookings that will show on dashboard
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, course_enrollment_id')
    .eq('student_id', sarahId);

  const activeEnrollments = allEnrollments?.filter(e => e.status === 'active').map(e => e.id) || [];
  const visibleBookings = bookings?.filter(b => activeEnrollments.includes(b.course_enrollment_id)) || [];

  console.log(`\n=== DASHBOARD VERIFICATION ===`);
  console.log(`Active enrollments: ${activeEnrollments.join(', ')}`);
  console.log(`Bookings visible on dashboard: ${visibleBookings.length}`);
  console.log(`\nExpected: 6 bookings (current course only)`);

  if (visibleBookings.length === 6) {
    console.log('✅ SUCCESS: Dashboard will show 6 current classes only!');
  } else {
    console.log(`❌ ERROR: Expected 6 bookings but got ${visibleBookings.length}`);
  }
}

fixSarahDashboard().then(() => process.exit());
