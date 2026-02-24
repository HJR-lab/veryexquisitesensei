require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkEdithLeeHistory() {
  console.log('=== CHECKING EDITH LEE COURSE HISTORY ===\n');

  const edithId = 1225; // Edith Lee

  // Get all enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', edithId)
    .order('course_start_date', { ascending: false });

  console.log(`Total enrollments: ${enrollments?.length || 0}\n`);

  enrollments?.forEach(enrollment => {
    console.log(`Enrollment ${enrollment.id}:`);
    console.log(`  Course Type: ${enrollment.course_type}`);
    console.log(`  Status: ${enrollment.status}`);
    console.log(`  Start Date: ${enrollment.course_start_date}`);
    console.log('');
  });

  // Get all bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      attended,
      course_enrollment_id,
      class_instance:class_instances!bookings_class_instance_id_fkey (
        id,
        class_date,
        class_type
      )
    `)
    .eq('student_id', edithId)
    .order('class_instance(class_date)', { ascending: false });

  console.log(`Total bookings: ${bookings?.length || 0}\n`);

  // Group by course identifier
  const courseGroups = {};
  bookings?.forEach(booking => {
    const courseId = booking.class_instance.class_type.match(/^(.+?)(?:\.\d+)?$/)?.[1];
    if (!courseGroups[courseId]) {
      courseGroups[courseId] = [];
    }
    courseGroups[courseId].push(booking);
  });

  console.log('=== BOOKINGS BY COURSE ===\n');
  Object.entries(courseGroups).forEach(([courseId, bookings]) => {
    const attended = bookings.filter(b => b.attended).length;
    const enrollmentId = bookings[0]?.course_enrollment_id;
    console.log(`${courseId}:`);
    console.log(`  Enrollment ID: ${enrollmentId}`);
    console.log(`  Total bookings: ${bookings.length}`);
    console.log(`  Attended: ${attended}/${bookings.length}`);
    console.log(`  Booking statuses:`);
    bookings.forEach(b => {
      console.log(`    - ${b.class_instance.class_date.split('T')[0]}: status=${b.status}, attended=${b.attended}`);
    });
    console.log('');
  });

  // Now simulate the backend API response
  console.log('=== SIMULATING API RESPONSE ===\n');

  const courseHistory = [];
  const today = new Date();

  const extractCourseIdentifier = (classType) => {
    if (!classType) return null;
    const match = classType.match(/^(.+?)(?:\.\d+)?$/);
    return match ? match[1] : classType;
  };

  enrollments?.forEach(enrollment => {
    const courseBookings = bookings.filter(b => b.course_enrollment_id === enrollment.id);

    if (courseBookings.length === 0) {
      console.log(`⚠️  Enrollment ${enrollment.id} has no bookings`);
      return;
    }

    // Group bookings by course identifier
    const bookingsByCourse = {};
    courseBookings.forEach(booking => {
      const courseId = extractCourseIdentifier(booking.class_instance.class_type);
      if (courseId) {
        if (!bookingsByCourse[courseId]) {
          bookingsByCourse[courseId] = [];
        }
        bookingsByCourse[courseId].push(booking);
      }
    });

    Object.entries(bookingsByCourse).forEach(([courseId, courseBookings]) => {
      const hasUpcomingClasses = courseBookings.some(b =>
        new Date(b.class_instance.class_date) >= today && b.status === 'booked'
      );

      const sortedBookings = [...courseBookings].sort((a, b) =>
        new Date(a.class_instance.class_date) - new Date(b.class_instance.class_date)
      );

      courseHistory.push({
        id: `${enrollment.id}-${courseId}`,
        courseIdentifier: courseId,
        status: hasUpcomingClasses ? 'current' : 'completed',
        numberOfWeeks: sortedBookings.length,
        classes: sortedBookings.map(b => ({
          date: b.class_instance.class_date,
          attended: b.attended
        }))
      });
    });
  });

  console.log(`Total courses in history: ${courseHistory.length}\n`);
  courseHistory.forEach((course, index) => {
    const attended = course.classes.filter(c => c.attended).length;
    console.log(`${index + 1}. ${course.courseIdentifier}`);
    console.log(`   Status: ${course.status}`);
    console.log(`   Attended: ${attended}/${course.classes.length}`);
    console.log('');
  });

  const completedCount = courseHistory.filter(c => c.status === 'completed').length;

  console.log('=== EXPECTED DISPLAY ===');
  console.log(`Courses purchased: ${courseHistory.length}`);
  console.log(`Courses completed: ${completedCount}`);
}

checkEdithLeeHistory().then(() => process.exit());
