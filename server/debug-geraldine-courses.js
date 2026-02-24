require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function debugGeraldine() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Today: ${today}\n`);

    // Get Geraldine
    const { data: geraldine } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'gbr@uwcsea.edu.sg')
      .single();

    console.log(`=== Geraldine Brogden (ID: ${geraldine.id}) ===\n`);

    // Get all bookings with class instances
    const { data: allBookings } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          id,
          class_type,
          class_date
        )
      `)
      .eq('student_id', geraldine.id)
      .in('status', ['booked', 'completed', 'attended']);

    console.log(`Total bookings: ${allBookings.length}\n`);

    // Simulate the studentCourseMap logic
    const extractCourseIdentifier = (classType) => {
      if (!classType) return null;
      const parts = classType.split('.');
      return parts[0];
    };

    // Group by enrollment_id
    const studentEnrollmentBookings = {};
    allBookings.forEach(booking => {
      const enrollmentId = booking.course_enrollment_id || 'null';
      if (!studentEnrollmentBookings[enrollmentId]) {
        studentEnrollmentBookings[enrollmentId] = [];
      }
      studentEnrollmentBookings[enrollmentId].push(booking);
    });

    console.log('=== GROUPING BY ENROLLMENT ===');
    Object.keys(studentEnrollmentBookings).forEach(enrollmentId => {
      console.log(`\nEnrollment ID: ${enrollmentId}`);
      const bookings = studentEnrollmentBookings[enrollmentId];
      console.log(`  Total bookings: ${bookings.length}`);

      // Show all bookings for this enrollment
      bookings.forEach(b => {
        console.log(`    - ${b.class_instances.class_type} (${b.class_instances.class_date}) [${b.booking_type}]`);
      });

      // Group by course identifier (EXCLUDING makeup bookings)
      const bookingsByCourse = {};
      bookings.forEach(booking => {
        // Skip makeup bookings when determining courses
        if (booking.booking_type === 'makeup') {
          console.log(`    SKIPPED: ${booking.class_instances.class_type} (makeup)`);
          return;
        }
        const courseId = extractCourseIdentifier(booking.class_instances?.class_type);
        if (courseId) {
          if (!bookingsByCourse[courseId]) {
            bookingsByCourse[courseId] = [];
          }
          bookingsByCourse[courseId].push(booking);
        }
      });

      console.log(`\n  Courses after skipping makeup bookings:`);
      const courseIds = Object.keys(bookingsByCourse);
      courseIds.forEach(courseId => {
        console.log(`    ${courseId}: ${bookingsByCourse[courseId].length} bookings`);
        bookingsByCourse[courseId].forEach(b => {
          console.log(`      - ${b.class_instances.class_date}`);
        });
      });

      // Check course status
      console.log(`\n  Course status check:`);
      courseIds.forEach(courseId => {
        const courseBookings = bookingsByCourse[courseId];
        const hasStarted = courseBookings.some(booking => {
          const classDate = new Date(booking.class_instances.class_date);
          const todayDate = new Date(today);
          classDate.setHours(0, 0, 0, 0);
          todayDate.setHours(0, 0, 0, 0);
          return classDate <= todayDate;
        });
        console.log(`    ${courseId}: ${hasStarted ? 'CURRENT' : 'UPCOMING'}`);
      });
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

debugGeraldine();
