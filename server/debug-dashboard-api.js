require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function debugDashboardAPI() {
  try {
    console.log('=== Debugging Dashboard API for Meghna ===\n');

    const meghnaId = 1226;

    // Step 1: Check active enrollments
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', meghnaId)
      .eq('status', 'active')
      .order('course_start_date', { ascending: true });

    if (enrollmentsError) {
      console.error('Error fetching enrollments:', enrollmentsError);
      return;
    }

    console.log('=== ACTIVE ENROLLMENTS ===');
    console.log(`Found ${enrollments.length} active enrollments`);
    enrollments.forEach(e => {
      console.log(`   - ID: ${e.id}, Title: ${e.course_title}`);
      console.log(`     Identifier: ${e.course_identifier}`);
      console.log(`     Weeks: ${e.number_of_weeks || 6}`);
      console.log('');
    });

    // Step 2: Calculate total classes allocated (should be 12)
    const totalClassesAllocated = enrollments.reduce((sum, e) => {
      return sum + (e.number_of_weeks || 6);
    }, 0);

    console.log(`Total Classes Allocated: ${totalClassesAllocated}`);

    // Step 3: Get all bookings
    const { data: bookings, error: bookingsError } = await supabase
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
      .eq('student_id', meghnaId)
      .in('status', ['booked', 'attended', 'completed'])
      .order('class_instances(class_date)', { ascending: true });

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      return;
    }

    console.log(`\n=== ALL BOOKINGS ===`);
    console.log(`Found ${bookings.length} total bookings`);

    // Step 4: Filter to current and future bookings
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const currentAndFutureBookings = bookings.filter(b => {
      if (b.status === 'cancelled') return false;
      const classDate = new Date(b.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      return classDate >= today; // Only current and future classes
    });

    console.log(`Current and Future Bookings: ${currentAndFutureBookings.length}`);

    const totalBooked = currentAndFutureBookings.length;
    const available = totalClassesAllocated - totalBooked;

    console.log('\n=== DASHBOARD STATS CALCULATION ===');
    console.log(`Total Classes Allocated: ${totalClassesAllocated}`);
    console.log(`Total Booked (current + future): ${totalBooked}`);
    console.log(`Available: ${available}`);

    // Check if there might be multiple enrollments per course causing issues
    console.log('\n=== POTENTIAL ISSUES ===');

    // Check for enrollments from same course
    const enrollmentsByCourse = {};
    enrollments.forEach(e => {
      const courseId = e.course_identifier || 'unknown';
      if (!enrollmentsByCourse[courseId]) {
        enrollmentsByCourse[courseId] = [];
      }
      enrollmentsByCourse[courseId].push(e);
    });

    console.log('Enrollments by course:');
    Object.keys(enrollmentsByCourse).forEach(courseId => {
      const courseEnrollments = enrollmentsByCourse[courseId];
      console.log(`   ${courseId}: ${courseEnrollments.length} enrollment(s)`);
      if (courseEnrollments.length > 1) {
        console.log('   ⚠️  Multiple enrollments for same course!');
        courseEnrollments.forEach((e, i) => {
          console.log(`      ${i + 1}. ID: ${e.id}, Status: ${e.status}, Created: ${e.created_at}`);
        });
      }
    });

    // Test actual API call
    console.log('\n=== TESTING ACTUAL API CALL ===');
    console.log('Check if server has restarted with new code...');

    // Check customer data for classes_allocated field
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', meghnaId)
      .single();

    console.log(`Customer classes_allocated field: ${customer.classes_allocated || 'NULL'}`);
    if (customer.classes_allocated) {
      console.log('⚠️  Old logic might still be using customer.classes_allocated instead of calculating from enrollments');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

debugDashboardAPI().then(() => process.exit());