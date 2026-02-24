require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkActiveBookings() {
  console.log('=== CHECKING ACTIVE BOOKINGS FOR APRIL ===\n');

  const aprilId = 1182;
  const activeEnrollmentId = 4781;

  // Get all bookings with enrollment info
  const { data: allBookings } = await supabase
    .from('bookings')
    .select(`
      id,
      course_enrollment_id,
      class_instance:class_instances!bookings_class_instance_id_fkey (
        class_date,
        class_type
      ),
      course_enrollment:course_enrollments!bookings_course_enrollment_id_fkey (
        id,
        status
      )
    `)
    .eq('student_id', aprilId)
    .order('class_instance(class_date)');

  console.log(`Total bookings in database: ${allBookings?.length || 0}\n`);

  // Group by enrollment
  const byEnrollment = {
    active: [],
    completed: [],
    noEnrollment: []
  };

  allBookings?.forEach(b => {
    if (b.course_enrollment && b.course_enrollment.status === 'active') {
      byEnrollment.active.push(b);
    } else if (b.course_enrollment && b.course_enrollment.status === 'completed') {
      byEnrollment.completed.push(b);
    } else {
      byEnrollment.noEnrollment.push(b);
    }
  });

  console.log('=== BOOKINGS BY ENROLLMENT STATUS ===\n');

  console.log(`Active enrollment (${byEnrollment.active.length} bookings):`);
  byEnrollment.active.forEach((b, i) => {
    console.log(`  ${i + 1}. ${b.class_instance.class_date.split('T')[0]} - ${b.class_instance.class_type} (enrollment_id: ${b.course_enrollment_id})`);
  });

  console.log(`\nCompleted enrollment (${byEnrollment.completed.length} bookings):`);
  byEnrollment.completed.forEach((b, i) => {
    console.log(`  ${i + 1}. ${b.class_instance.class_date.split('T')[0]} - ${b.class_instance.class_type} (enrollment_id: ${b.course_enrollment_id})`);
  });

  console.log(`\nNo enrollment link (${byEnrollment.noEnrollment.length} bookings):`);
  byEnrollment.noEnrollment.forEach((b, i) => {
    console.log(`  ${i + 1}. ${b.class_instance.class_date.split('T')[0]} - ${b.class_instance.class_type} (enrollment_id: ${b.course_enrollment_id || 'NULL'})`);
  });

  // Check specifically for the first class booking we added
  console.log('\n=== CHECKING FIRST CLASS BOOKING (WT2001NT_JL6.1) ===\n');
  const firstClassBooking = allBookings?.find(b =>
    b.class_instance.class_type === 'WT2001NT_JL6.1'
  );

  if (firstClassBooking) {
    console.log('✅ First class booking exists');
    console.log(`   Enrollment ID: ${firstClassBooking.course_enrollment_id || 'NULL'}`);
    console.log(`   Enrollment Status: ${firstClassBooking.course_enrollment?.status || 'N/A'}`);
  } else {
    console.log('❌ First class booking NOT FOUND');
  }

  // Check makeup booking
  console.log('\n=== CHECKING MAKEUP BOOKING (WT2201NT_JL6.2 Thursday) ===\n');
  const makeupBooking = allBookings?.find(b =>
    b.class_instance.class_type === 'WT2201NT_JL6.2'
  );

  if (makeupBooking) {
    console.log('✅ Makeup booking exists');
    console.log(`   Enrollment ID: ${makeupBooking.course_enrollment_id || 'NULL'}`);
    console.log(`   Enrollment Status: ${makeupBooking.course_enrollment?.status || 'N/A'}`);
  } else {
    console.log('❌ Makeup booking NOT FOUND');
  }
}

checkActiveBookings().then(() => process.exit());
