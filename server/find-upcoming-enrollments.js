require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function findUpcomingEnrollments() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    console.log(`Today: ${today.toISOString().split('T')[0]}\n`);

    // Get all students
    const { data: allStudents } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('customer_type', 'student');

    // Get all bookings with class instances
    const { data: allBookingsWithClasses } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        student_id,
        class_instance_id,
        course_enrollment_id,
        status,
        booking_type,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date
        )
      `)
      .in('status', ['booked', 'completed', 'attended']);

    // Helper function
    const extractCourseIdentifier = (classType) => {
      if (!classType) return null;
      const parts = classType.split('.');
      return parts[0];
    };

    // Group bookings by student and enrollment
    const studentEnrollmentBookings = {};
    allBookingsWithClasses.forEach(booking => {
      const studentId = booking.student_id;
      const enrollmentId = booking.course_enrollment_id || 'null';

      if (!studentEnrollmentBookings[studentId]) {
        studentEnrollmentBookings[studentId] = {};
      }
      if (!studentEnrollmentBookings[studentId][enrollmentId]) {
        studentEnrollmentBookings[studentId][enrollmentId] = [];
      }
      studentEnrollmentBookings[studentId][enrollmentId].push(booking);
    });

    // Build studentCourseMap
    const studentCourseMap = {};
    Object.keys(studentEnrollmentBookings).forEach(studentId => {
      studentCourseMap[studentId] = [];

      Object.keys(studentEnrollmentBookings[studentId]).forEach(enrollmentId => {
        const bookings = studentEnrollmentBookings[studentId][enrollmentId];

        // Group by course, excluding makeup bookings
        const bookingsByCourse = {};
        bookings.forEach(booking => {
          if (booking.booking_type === 'makeup') return;
          const courseId = extractCourseIdentifier(booking.class_instances?.class_type);
          if (courseId) {
            if (!bookingsByCourse[courseId]) {
              bookingsByCourse[courseId] = [];
            }
            bookingsByCourse[courseId].push(booking);
          }
        });

        const courseIds = Object.keys(bookingsByCourse);
        const hasFullCourse = courseIds.some(id => bookingsByCourse[id].length >= 4);

        if (!hasFullCourse && courseIds.length > 1) {
          const primaryCourseId = courseIds[0];
          const latestDate = bookings[0]?.class_instances?.class_date;
          studentCourseMap[studentId].push({
            courseIdentifier: primaryCourseId,
            classDate: latestDate
          });
        } else {
          courseIds.forEach(courseId => {
            const courseBookings = bookingsByCourse[courseId];
            const latestDate = courseBookings[0]?.class_instances?.class_date;
            studentCourseMap[studentId].push({
              courseIdentifier: courseId,
              classDate: latestDate
            });
          });
        }
      });

      studentCourseMap[studentId].sort((a, b) =>
        new Date(b.classDate) - new Date(a.classDate)
      );
    });

    // getCourseStatus function
    const getCourseStatus = (courseIdentifier, studentId) => {
      const baseCourseCode = courseIdentifier.split('.')[0];
      const courseBookings = allBookingsWithClasses.filter(booking => {
        if (booking.student_id !== parseInt(studentId)) return false;
        const classInstance = booking.class_instances;
        if (!classInstance || !classInstance.class_type) return false;
        return classInstance.class_type.startsWith(baseCourseCode);
      });

      if (courseBookings.length === 0) return 'upcoming';

      const hasStarted = courseBookings.some(booking => {
        const classDate = new Date(booking.class_instances.class_date);
        const todayDate = new Date(today);
        classDate.setHours(0, 0, 0, 0);
        todayDate.setHours(0, 0, 0, 0);
        return classDate <= todayDate;
      });

      return hasStarted ? 'current' : 'upcoming';
    };

    // Build upcoming enrollments list
    const upcomingEnrollmentsList = allStudents
      .filter(s => {
        const courses = studentCourseMap[s.id] || [];
        return courses.some(c => getCourseStatus(c.courseIdentifier, s.id) === 'upcoming');
      })
      .map(s => {
        const courses = studentCourseMap[s.id] || [];
        const upcomingCourses = courses.filter(c => getCourseStatus(c.courseIdentifier, s.id) === 'upcoming');

        return {
          name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
          email: s.email,
          courseIdentifier: upcomingCourses[0]?.courseIdentifier || null,
          startDate: upcomingCourses[0]?.classDate || null,
          studentId: s.id
        };
      })
      .sort((a, b) => {
        const dateA = a.startDate ? new Date(a.startDate) : new Date(0);
        const dateB = b.startDate ? new Date(b.startDate) : new Date(0);
        const dateCompare = dateA - dateB;
        if (dateCompare !== 0) return dateCompare;
        return a.name.localeCompare(b.name);
      });

    console.log(`=== UPCOMING ENROLLMENTS (${upcomingEnrollmentsList.length}) ===\n`);
    upcomingEnrollmentsList.forEach((s, index) => {
      console.log(`${index + 1}. ${s.name} (${s.email})`);
      console.log(`   Course: ${s.courseIdentifier}`);
      console.log(`   Start Date: ${s.startDate}`);
      console.log(`   Student ID: ${s.studentId}\n`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

findUpcomingEnrollments();
