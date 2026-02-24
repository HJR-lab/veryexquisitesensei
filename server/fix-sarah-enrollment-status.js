require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixSarahEnrollmentStatus() {
  console.log('=== FIXING SARAH ENROLLMENT STATUS ===\n');

  const sarahId = 1197;
  const enrollmentsToActivate = [4940, 5021];

  console.log(`Updating enrollments ${enrollmentsToActivate.join(', ')} to status='active'\n`);

  const { data, error } = await supabase
    .from('course_enrollments')
    .update({ status: 'active' })
    .in('id', enrollmentsToActivate)
    .select();

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log(`✅ Updated ${data?.length || 0} enrollments\n`);

  // Verify
  const { data: allEnrollments } = await supabase
    .from('course_enrollments')
    .select('id, status')
    .eq('student_id', sarahId);

  console.log('Sarah\'s enrollment statuses:');
  allEnrollments?.forEach(e => {
    console.log(`  Enrollment ${e.id}: status='${e.status}'`);
  });

  // Verify bookings will now appear
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, course_enrollment_id')
    .eq('student_id', sarahId);

  const activeEnrollmentIds = allEnrollments?.filter(e => e.status === 'active').map(e => e.id) || [];
  const visibleBookingCount = bookings?.filter(b => activeEnrollmentIds.includes(b.course_enrollment_id)).length || 0;

  console.log(`\n=== VERIFICATION ===`);
  console.log(`Active enrollments: ${activeEnrollmentIds.join(', ')}`);
  console.log(`Total bookings: ${bookings?.length || 0}`);
  console.log(`Bookings that will now appear on dashboard: ${visibleBookingCount}`);

  if (visibleBookingCount === bookings?.length) {
    console.log('\n✅ SUCCESS: All bookings will now be visible on the dashboard!');
  } else {
    console.log(`\n⚠️  WARNING: ${bookings.length - visibleBookingCount} bookings will still be hidden`);
  }
}

fixSarahEnrollmentStatus().then(() => process.exit());
