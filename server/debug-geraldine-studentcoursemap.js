require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function debugGeraldineInStudentCourseMap() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    console.log(`Today: ${today.toISOString().split('T')[0]}\n`);

    // Get Geraldine
    const { data: geraldine } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'gbr@uwcsea.edu.sg')
      .single();

    console.log(`=== Geraldine Brogden (ID: ${geraldine.id}) ===\n`);

    // Get all bookings with class instances - SAME QUERY as in index.js
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

    console.log(`Total valid bookings: ${allBookings.length}`);
    console.log('All bookings:');
    allBookings.forEach(b => {
      console.log(`  ${b.class_instances.class_type} - ${b.class_instances.class_date} - ${b.booking_type} - enrollment: ${b.course_enrollment_id}`);
    });

    // Helper function
    const extractCourseIdentifier = (classType) => {
      if (!classType) return null;
      const parts = classType.split('.');
      return parts[0];
    };

    // Group by enrollment
    const studentEnrollmentBookings = {};
    allBookings.forEach(booking => {
      const enrollmentId = booking.course_enrollment_id || 'null';
      if (!studentEnrollmentBookings[enrollmentId]) {
        studentEnrollmentBookings[enrollmentId] = [];
      }
      studentEnrollmentBookings[enrollmentId].push(booking);
    });

    // Build studentCourseMap - SAME LOGIC as index.js
    const studentCourseMap = [];

    Object.keys(studentEnrollmentBookings).forEach(enrollmentId => {
      const bookings = studentEnrollmentBookings[enrollmentId];

      console.log(`\n=== Processing Enrollment ID: ${enrollmentId} ===`);
      console.log(`Bookings count: ${bookings.length}`);

      // Group bookings by course identifier within this enrollment
      // EXCLUDE makeup bookings - they don't count as separate courses
      const bookingsByCourse = {};
      bookings.forEach(booking => {
        // Skip makeup bookings when determining courses
        if (booking.booking_type === 'makeup') {
          console.log(`  SKIPPING MAKEUP: ${booking.class_instances.class_type}`);
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

      console.log(`\nCourses after skipping makeup:`);
      Object.keys(bookingsByCourse).forEach(courseId => {
        console.log(`  ${courseId}: ${bookingsByCourse[courseId].length} bookings`);
      });

      // Apply makeup class detection logic
      const courseIds = Object.keys(bookingsByCourse);
      const hasFullCourse = courseIds.some(id => bookingsByCourse[id].length >= 4);

      console.log(`Has full course (>=4 bookings): ${hasFullCourse}`);
      console.log(`Number of course IDs: ${courseIds.length}`);

      // If no full courses (all < 4 bookings), keep together as one course with makeups
      if (!hasFullCourse && courseIds.length > 1) {
        console.log('  -> Using FIRST COURSE ONLY (no full course, multiple IDs)');
        const primaryCourseId = courseIds[0];
        const latestDate = bookings[0]?.class_instances?.class_date;
        studentCourseMap.push({
          courseIdentifier: primaryCourseId,
          classDate: latestDate
        });
        console.log(`  -> Added: ${primaryCourseId} (${latestDate})`);
      } else {
        // Split into separate courses
        console.log('  -> Adding ALL COURSES SEPARATELY');
        courseIds.forEach(courseId => {
          const courseBookings = bookingsByCourse[courseId];
          const latestDate = courseBookings[0]?.class_instances?.class_date;
          studentCourseMap.push({
            courseIdentifier: courseId,
            classDate: latestDate
          });
          console.log(`  -> Added: ${courseId} (${latestDate})`);
        });
      }
    });

    // Sort courses by date (most recent first)
    studentCourseMap.sort((a, b) =>
      new Date(b.classDate) - new Date(a.classDate)
    );

    console.log(`\n=== FINAL studentCourseMap for Geraldine ===`);
    console.log(JSON.stringify(studentCourseMap, null, 2));

    // Now check getCourseStatus for each course
    console.log(`\n=== getCourseStatus for each course ===`);
    studentCourseMap.forEach(course => {
      const baseCourseCode = course.courseIdentifier.split('.')[0];
      const courseBookings = allBookings.filter(booking => {
        if (!booking.class_instances || !booking.class_instances.class_type) return false;
        return booking.class_instances.class_type.startsWith(baseCourseCode);
      });

      console.log(`\n${course.courseIdentifier}:`);
      console.log(`  Base course code: ${baseCourseCode}`);
      console.log(`  Matching bookings: ${courseBookings.length}`);

      if (courseBookings.length === 0) {
        console.log(`  Status: UPCOMING (no bookings)`);
        return;
      }

      // Check if any class has started
      const hasStarted = courseBookings.some(booking => {
        const classDate = new Date(booking.class_instances.class_date);
        const todayDate = new Date(today);
        classDate.setHours(0, 0, 0, 0);
        todayDate.setHours(0, 0, 0, 0);
        const started = classDate <= todayDate;
        console.log(`    ${booking.class_instances.class_type} - ${classDate.toISOString().split('T')[0]} - ${started ? 'STARTED' : 'FUTURE'}`);
        return started;
      });

      console.log(`  Status: ${hasStarted ? 'CURRENT' : 'UPCOMING'}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

debugGeraldineInStudentCourseMap();
