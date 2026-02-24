require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkMeghnaEnrollments() {
  const meghnaId = 1087;

  console.log('Checking Meghna\'s enrollments...\n');

  // Get all enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', meghnaId)
    .order('created_at', { ascending: false });

  console.log('All enrollments:');
  enrollments.forEach(e => {
    console.log(`  - ID: ${e.id}, Status: ${e.status}, Title: ${e.course_title}`);
  });

  // Get all bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      course_enrollment_id,
      class_instances!bookings_class_instance_id_fkey (
        class_type,
        class_date
      )
    `)
    .eq('student_id', meghnaId)
    .in('status', ['booked', 'attended'])
    .order('class_instances(class_date)', { ascending: true });

  console.log(`\nAll bookings (${bookings.length} total):`);
  const groupedByEnrollment = {};

  bookings.forEach(b => {
    const enrollmentId = b.course_enrollment_id;
    if (!groupedByEnrollment[enrollmentId]) {
      groupedByEnrollment[enrollmentId] = [];
    }
    groupedByEnrollment[enrollmentId].push(b);
  });

  Object.entries(groupedByEnrollment).forEach(([enrollmentId, bookingList]) => {
    const enrollment = enrollments.find(e => e.id === parseInt(enrollmentId));
    console.log(`\n  Enrollment ${enrollmentId} (${enrollment?.status}): ${bookingList.length} bookings`);
    bookingList.forEach(b => {
      console.log(`    - ${b.class_instances.class_date}: ${b.class_instances.class_type} (${b.status})`);
    });
  });

  // Identify which enrollment is active
  const activeEnrollments = enrollments.filter(e => e.status === 'active');
  console.log(`\n✅ Active enrollments: ${activeEnrollments.length}`);
  activeEnrollments.forEach(e => {
    console.log(`  - ID: ${e.id}, Title: ${e.course_title}`);
  });
}

checkMeghnaEnrollments().then(() => process.exit());
