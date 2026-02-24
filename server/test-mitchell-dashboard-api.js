require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function testMitchellDashboardAPI() {
  try {
    // Find Mitchell's ID
    const { data: mitchell } = await supabase
      .from('customers')
      .select('id')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    const dbCustomerId = mitchell.id;

    console.log('=== Testing Mitchell Dashboard API Logic ===\n');
    console.log(`Customer ID: ${dbCustomerId}`);

    // Replicate the dashboard API logic
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', dbCustomerId)
      .order('course_start_date', { ascending: true });

    console.log('\n=== ALL ENROLLMENTS (Dashboard gets these) ===');
    enrollments.forEach((e, i) => {
      console.log(`${i + 1}. ID: ${e.id}, Status: ${e.status}`);
      console.log(`   Title: ${e.course_title}`);
      console.log(`   Identifier: ${e.course_identifier || 'NULL'}`);
      console.log(`   Package Total: ${e.package_total_courses || 'NULL'}`);
      console.log(`   Created: ${e.created_at}`);
      console.log('');
    });

    // Get bookings
    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          id,
          class_type,
          class_date,
          start_time,
          end_time,
          instructor,
          room
        )
      `)
      .eq('student_id', dbCustomerId)
      .in('status', ['booked', 'attended', 'completed'])
      .order('class_instances(class_date)', { ascending: true });

    console.log('=== BOOKINGS ===');
    console.log(`Total bookings: ${bookings.length}`);

    // Group bookings by enrollment
    const bookingsByEnrollment = {};
    bookings.forEach(booking => {
      const enrollmentId = booking.course_enrollment_id;
      if (!bookingsByEnrollment[enrollmentId]) {
        bookingsByEnrollment[enrollmentId] = [];
      }
      bookingsByEnrollment[enrollmentId].push(booking);
    });

    console.log('\n=== BOOKINGS BY ENROLLMENT ===');
    Object.keys(bookingsByEnrollment).forEach(enrollmentId => {
      const bookingsForEnrollment = bookingsByEnrollment[enrollmentId];
      const enrollment = enrollments.find(e => e.id == enrollmentId);
      console.log(`Enrollment ${enrollmentId} (${enrollment?.course_title || 'Unknown'}): ${bookingsForEnrollment.length} bookings`);
    });

    // Helper function to determine enrollment status (from API)
    const getEnrollmentStatus = (enrollment, bookingsForEnrollment) => {
      if (!bookingsForEnrollment || bookingsForEnrollment.length === 0) {
        return 'pending'; // No bookings yet = pending schedule
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allDates = bookingsForEnrollment.map(b => new Date(b.class_instances.class_date));
      const earliestDate = new Date(Math.min(...allDates));
      const latestDate = new Date(Math.max(...allDates));

      earliestDate.setHours(0, 0, 0, 0);
      latestDate.setHours(0, 0, 0, 0);

      // All classes in the future = upcoming
      if (earliestDate > today) {
        return 'upcoming';
      }

      // All classes in the past = completed
      if (latestDate < today) {
        return 'completed';
      }

      // Some past, some future = active
      return 'active';
    };

    console.log('\n=== COMPUTED ENROLLMENT STATUS ===');
    const activeEnrollments = [];
    const upcomingEnrollments = [];

    enrollments.filter(e => e.status === 'active').forEach(enrollment => {
      const bookingsForEnrollment = bookingsByEnrollment[enrollment.id] || [];
      const computedStatus = getEnrollmentStatus(enrollment, bookingsForEnrollment);

      console.log(`Enrollment ${enrollment.id}: ${computedStatus}`);
      console.log(`  - Title: ${enrollment.course_title}`);
      console.log(`  - Identifier: ${enrollment.course_identifier || 'NULL'}`);
      console.log(`  - Package: ${enrollment.package_total_courses || 'NULL'}`);
      console.log(`  - Bookings: ${bookingsForEnrollment.length}`);

      if (computedStatus === 'active') {
        activeEnrollments.push(enrollment);
      } else if (computedStatus === 'upcoming') {
        upcomingEnrollments.push(enrollment);
      }
      console.log('');
    });

    console.log('=== DASHBOARD WILL SHOW ===');
    console.log(`Active Enrollments: ${activeEnrollments.length}`);
    activeEnrollments.forEach(e => {
      console.log(`  - ${e.course_title} (${e.course_identifier || 'NULL'})`);
    });

    console.log(`Upcoming Enrollments: ${upcomingEnrollments.length}`);
    upcomingEnrollments.forEach(e => {
      console.log(`  - ${e.course_title} (${e.course_identifier || 'NULL'})`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

testMitchellDashboardAPI().then(() => process.exit());