require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixMitchellBookings() {
  try {
    // Find Mitchell's ID
    const { data: mitchell } = await supabase
      .from('customers')
      .select('id')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    console.log('=== Fixing Mitchell\'s Booking Assignments ===\n');

    // Get all his bookings
    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date,
          start_time
        )
      `)
      .eq('student_id', mitchell.id)
      .in('status', ['booked', 'attended', 'completed']);

    console.log(`Found ${bookings.length} bookings for Mitchell`);

    // Get his current active enrollments
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', mitchell.id)
      .eq('status', 'active');

    console.log('\n=== CURRENT ACTIVE ENROLLMENTS ===');
    enrollments.forEach(e => {
      console.log(`${e.id}: ${e.course_title} (${e.course_identifier || 'NULL'})`);
    });

    // Analyze bookings
    console.log('\n=== CURRENT BOOKING ASSIGNMENTS ===');
    const bookingsByEnrollment = {};
    bookings.forEach(booking => {
      const enrollmentId = booking.course_enrollment_id;
      if (!bookingsByEnrollment[enrollmentId]) {
        bookingsByEnrollment[enrollmentId] = [];
      }
      bookingsByEnrollment[enrollmentId].push(booking);
    });

    Object.keys(bookingsByEnrollment).forEach(enrollmentId => {
      const bookingsForEnrollment = bookingsByEnrollment[enrollmentId];
      console.log(`\nEnrollment ${enrollmentId}: ${bookingsForEnrollment.length} bookings`);
      bookingsForEnrollment.forEach((b, i) => {
        console.log(`  ${i+1}. ${b.class_instances.class_type} on ${b.class_instances.class_date}`);
      });
    });

    console.log('\n=== FIXING ASSIGNMENTS ===');

    // The logic should be:
    // - WT1701PM_DL6 classes (currently happening) should be assigned to enrollment 4801
    // - WT2802PM_DL6 classes (future/package) should be assigned to enrollment 5054

    const wt1701Enrollment = enrollments.find(e => e.course_identifier === 'WT1701PM_DL6');
    const packageEnrollment = enrollments.find(e => e.package_total_courses === 3);

    console.log(`WT1701PM_DL6 enrollment ID: ${wt1701Enrollment?.id}`);
    console.log(`Package enrollment ID: ${packageEnrollment?.id}`);

    if (wt1701Enrollment && packageEnrollment) {
      // Reassign bookings based on class_type or date logic
      for (const booking of bookings) {
        const classType = booking.class_instances.class_type;
        const classDate = new Date(booking.class_instances.class_date);
        const today = new Date();

        let correctEnrollmentId;

        // If class contains WT1701PM or is in the past/current, assign to individual course
        if (classType?.includes('WT1701PM') || classDate <= today) {
          correctEnrollmentId = wt1701Enrollment.id;
        }
        // If class contains WT2802PM or is in the future, assign to package
        else if (classType?.includes('WT2802PM') || classDate > today) {
          correctEnrollmentId = packageEnrollment.id;
        }
        // Default: assign current classes to individual, future to package
        else {
          correctEnrollmentId = classDate <= today ? wt1701Enrollment.id : packageEnrollment.id;
        }

        // Update if needed
        if (booking.course_enrollment_id !== correctEnrollmentId) {
          console.log(`Moving booking ${booking.id} from enrollment ${booking.course_enrollment_id} to ${correctEnrollmentId}`);

          const { error } = await supabase
            .from('bookings')
            .update({ course_enrollment_id: correctEnrollmentId })
            .eq('id', booking.id);

          if (error) {
            console.error(`Error updating booking ${booking.id}:`, error);
          } else {
            console.log(`✅ Updated booking ${booking.id}`);
          }
        }
      }

      console.log('\n✅ Booking assignments updated!');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

fixMitchellBookings().then(() => process.exit());