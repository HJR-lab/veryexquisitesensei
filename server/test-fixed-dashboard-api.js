require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function testFixedDashboardAPI() {
  try {
    // Find Mitchell's ID
    const { data: mitchell } = await supabase
      .from('customers')
      .select('id')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    const dbCustomerId = mitchell.id;

    console.log('=== Testing FIXED Dashboard API Logic ===\n');
    console.log(`Customer ID: ${dbCustomerId}`);

    // This matches the FIXED dashboard API query (only active enrollments)
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', dbCustomerId)
      .eq('status', 'active')  // <-- This is the key fix
      .order('course_start_date', { ascending: true });

    console.log('\n=== ENROLLMENTS (Dashboard API now gets ONLY these) ===');
    enrollments.forEach((e, i) => {
      console.log(`${i + 1}. ID: ${e.id}, Status: ${e.status}`);
      console.log(`   Title: ${e.course_title}`);
      console.log(`   Identifier: ${e.course_identifier || 'NULL'}`);
      console.log(`   Package Total: ${e.package_total_courses || 'NULL'}`);
      console.log('');
    });

    // Get bookings (unchanged)
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

    // Group bookings by enrollment
    const bookingsByEnrollment = {};
    bookings.forEach(booking => {
      const enrollmentId = booking.course_enrollment_id;
      if (!bookingsByEnrollment[enrollmentId]) {
        bookingsByEnrollment[enrollmentId] = [];
      }
      bookingsByEnrollment[enrollmentId].push(booking);
    });

    // Apply the same status logic as the fixed API
    const getEnrollmentStatus = (enrollment, bookingsForEnrollment) => {
      if (!bookingsForEnrollment || bookingsForEnrollment.length === 0) {
        return 'pending';
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allDates = bookingsForEnrollment.map(b => new Date(b.class_instances.class_date));
      const earliestDate = new Date(Math.min(...allDates));
      const latestDate = new Date(Math.max(...allDates));

      earliestDate.setHours(0, 0, 0, 0);
      latestDate.setHours(0, 0, 0, 0);

      // Special logic for package courses
      if (enrollment.package_total_courses && enrollment.package_total_courses > 1) {
        if (earliestDate > today) {
          return 'upcoming';
        }
        const futureClasses = allDates.filter(date => {
          const d = new Date(date);
          d.setHours(0, 0, 0, 0);
          return d > today;
        });
        if (futureClasses.length >= allDates.length / 2) {
          return 'upcoming';
        }
      }

      if (earliestDate > today) {
        return 'upcoming';
      }

      if (latestDate < today) {
        return 'completed';
      }

      return 'active';
    };

    console.log('=== COMPUTED ENROLLMENT STATUS (Fixed Logic) ===');
    const activeEnrollments = [];
    const upcomingEnrollments = [];
    const completedEnrollments = [];
    const pendingEnrollments = [];

    enrollments.forEach(enrollment => {
      const bookingsForEnrollment = bookingsByEnrollment[enrollment.id] || [];
      const computedStatus = getEnrollmentStatus(enrollment, bookingsForEnrollment);

      console.log(`Enrollment ${enrollment.id}: ${computedStatus}`);
      console.log(`  - Title: ${enrollment.course_title}`);
      console.log(`  - Identifier: ${enrollment.course_identifier || 'NULL'}`);
      console.log(`  - Package: ${enrollment.package_total_courses || 'NULL'}`);

      switch (computedStatus) {
        case 'active':
          activeEnrollments.push(enrollment);
          break;
        case 'upcoming':
          upcomingEnrollments.push(enrollment);
          break;
        case 'completed':
          completedEnrollments.push(enrollment);
          break;
        case 'pending':
          pendingEnrollments.push(enrollment);
          break;
      }
      console.log('');
    });

    console.log('=== DASHBOARD WILL NOW SHOW ===');
    console.log(`Active Enrollments: ${activeEnrollments.length}`);
    activeEnrollments.forEach(e => {
      console.log(`  ✅ ${e.course_title} (${e.course_identifier || 'NULL'})`);
    });

    console.log(`Upcoming Enrollments: ${upcomingEnrollments.length}`);
    upcomingEnrollments.forEach(e => {
      console.log(`  📅 ${e.course_title} (${e.course_identifier || 'NULL'})`);
    });

    console.log(`Completed Enrollments: ${completedEnrollments.length}`);
    completedEnrollments.forEach(e => {
      console.log(`  ✅ ${e.course_title} (${e.course_identifier || 'NULL'})`);
    });

    console.log(`Pending Enrollments: ${pendingEnrollments.length}`);
    pendingEnrollments.forEach(e => {
      console.log(`  ⏳ ${e.course_title} (${e.course_identifier || 'NULL'})`);
    });

    const total = activeEnrollments.length + upcomingEnrollments.length + completedEnrollments.length + pendingEnrollments.length;
    console.log(`\n🎯 TOTAL COURSES ON DASHBOARD: ${total}`);
    console.log('✅ The N/A course should be GONE!');

  } catch (error) {
    console.error('Error:', error);
  }
}

testFixedDashboardAPI().then(() => process.exit());