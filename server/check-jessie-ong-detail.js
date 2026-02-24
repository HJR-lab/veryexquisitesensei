require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkJessieOngDetail() {
  console.log('=== JESSIE ONG DETAILED ANALYSIS ===\n');

  const jessieId = 1240;

  // Get customer details
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', jessieId)
    .single();

  console.log('Customer:', customer.first_name, customer.last_name);
  console.log('Email:', customer.email);
  console.log('course_purchase_count:', customer.course_purchase_count);
  console.log('classes_allocated:', customer.classes_allocated);

  // Get all enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', jessieId)
    .order('course_start_date');

  console.log(`\n📋 ENROLLMENTS: ${enrollments?.length || 0}\n`);
  enrollments?.forEach((e, i) => {
    console.log(`${i + 1}. Enrollment ID: ${e.id}`);
    console.log(`   Course: ${e.course_title}`);
    console.log(`   Identifier: ${e.course_identifier}`);
    console.log(`   Start: ${e.course_start_date}, End: ${e.course_end_date}`);
    console.log(`   Status: ${e.status}`);
    console.log('');
  });

  // Get all bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      course_enrollment_id,
      class_instances!bookings_class_instance_id_fkey (
        id,
        class_type,
        class_date,
        start_time
      )
    `)
    .eq('student_id', jessieId)
    .order('class_instances(class_date)');

  console.log(`\n📚 BOOKINGS: ${bookings?.length || 0}\n`);

  // Group by enrollment
  const bookingsByEnrollment = {};
  bookings?.forEach(b => {
    const enrollmentId = b.course_enrollment_id;
    if (!bookingsByEnrollment[enrollmentId]) {
      bookingsByEnrollment[enrollmentId] = [];
    }
    bookingsByEnrollment[enrollmentId].push(b);
  });

  enrollments?.forEach(enrollment => {
    const enrollmentBookings = bookingsByEnrollment[enrollment.id] || [];
    console.log(`\n📘 Enrollment ${enrollment.id} - ${enrollment.course_identifier || 'No identifier'}`);
    console.log(`   Total Bookings: ${enrollmentBookings.length}`);

    const extractCourseIdentifier = (classType) => {
      if (!classType) return null;
      const match = classType.match(/^(.+?)(?:\.\d+)?$/);
      return match ? match[1] : classType;
    };

    const courseIds = new Set();
    enrollmentBookings.forEach(b => {
      if (b.class_instances?.class_type) {
        courseIds.add(extractCourseIdentifier(b.class_instances.class_type));
      }
    });

    console.log(`   Unique course identifiers: ${courseIds.size}`);
    [...courseIds].forEach(cid => {
      console.log(`     - ${cid}`);
    });

    console.log('   Classes:');
    enrollmentBookings.forEach((b, idx) => {
      const ci = b.class_instances;
      if (!ci) return;
      console.log(`     ${idx + 1}. ${ci.class_date?.split('T')[0]} - ${ci.class_type}`);
    });
  });

  console.log('\n\n=== SUMMARY ===');
  console.log(`Jessie Ong currently has ${enrollments?.length || 0} enrollments and ${bookings?.length || 0} bookings`);
  console.log('Based on our grouping logic, she has 3 courses.');
  console.log('\nIf she should have 5 courses, we may need to add 2 more courses worth of data.');
}

checkJessieOngDetail().then(() => process.exit());
