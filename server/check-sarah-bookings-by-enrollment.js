require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkSarahBookingsByEnrollment() {
  console.log('=== SARAH BOOKINGS BY ENROLLMENT ===\n');

  const sarahId = 1197;

  // Get all bookings grouped by enrollment
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, status, course_enrollment_id, class_instance_id')
    .eq('student_id', sarahId)
    .order('course_enrollment_id');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Total bookings: ${bookings?.length || 0}\n`);

  // Group by enrollment
  const byEnrollment = {};
  bookings?.forEach(b => {
    const enrollId = b.course_enrollment_id;
    if (!byEnrollment[enrollId]) {
      byEnrollment[enrollId] = [];
    }
    byEnrollment[enrollId].push(b);
  });

  // Show counts
  console.log('Bookings by enrollment:');
  Object.keys(byEnrollment).forEach(enrollId => {
    const count = byEnrollment[enrollId].length;
    console.log(`  Enrollment ${enrollId}: ${count} bookings`);
  });

  // Get enrollment details
  console.log('\nEnrollment details:');
  const enrollIds = Object.keys(byEnrollment);
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('id, status, course_type, course_start_date')
    .in('id', enrollIds);

  enrollments?.forEach(e => {
    const bookingCount = byEnrollment[e.id].length;
    console.log(`  Enrollment ${e.id}: status='${e.status}', ${bookingCount} bookings, type=${e.course_type || 'null'}`);
  });

  // Calculate what SHOULD show
  console.log('\n=== IMPACT ON DASHBOARD ===');
  const activeEnrollIds = enrollments?.filter(e => e.status === 'active').map(e => e.id) || [];
  const activeBookingCount = activeEnrollIds.reduce((sum, id) => sum + byEnrollment[id].length, 0);

  console.log(`Enrollments with status='active': ${activeEnrollIds.join(', ')}`);
  console.log(`Bookings from active enrollments: ${activeBookingCount}`);
  console.log(`Bookings HIDDEN (from completed enrollments): ${bookings.length - activeBookingCount}`);
}

checkSarahBookingsByEnrollment().then(() => process.exit());
