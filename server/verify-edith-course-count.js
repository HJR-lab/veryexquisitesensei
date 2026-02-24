require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function verifyEdithCourseCount() {
  console.log('=== VERIFYING EDITH COURSE COUNT ===\n');

  const edithId = 1117; // Edith Ng

  // Get all bookings with class details
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      attended,
      booking_date,
      course_enrollment_id,
      class_instance:class_instances!bookings_class_instance_id_fkey (
        id,
        class_date,
        start_time,
        end_time,
        class_type,
        instructor,
        room
      )
    `)
    .eq('student_id', edithId)
    .order('class_instance(class_date)', { ascending: false });

  if (bookingsError) {
    console.error('Error fetching bookings:', bookingsError);
    return;
  }

  console.log(`Total bookings: ${bookings.length}\n`);

  // Get course enrollments
  const { data: enrollments, error: enrollmentsError } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', edithId)
    .order('course_start_date', { ascending: false });

  if (enrollmentsError) {
    console.error('Error fetching enrollments:', enrollmentsError);
    return;
  }

  console.log(`Total enrollments: ${enrollments.length}\n`);

  // Mimic the backend logic to build courseHistory
  const courseHistory = [];
  const today = new Date();

  const extractCourseIdentifier = (classType) => {
    if (!classType) return null;
    const match = classType.match(/^(.+?)(?:\.\d+)?$/);
    return match ? match[1] : classType;
  };

  enrollments.forEach(enrollment => {
    const courseBookings = bookings.filter(b => b.course_enrollment_id === enrollment.id);

    if (courseBookings.length === 0) {
      console.log(`⚠️  Enrollment ${enrollment.id} has no bookings - will be skipped`);
      return; // Skip enrollments with no bookings
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

    const courseIds = Object.keys(bookingsByCourse);
    const hasFullCourse = courseIds.some(id => bookingsByCourse[id].length >= 4);

    // If no full courses detected, keep all bookings together as one course entry
    if (!hasFullCourse && courseIds.length > 1) {
      const primaryCourseId = courseIds[0];
      const allBookings = courseBookings;

      const hasUpcomingClasses = allBookings.some(b =>
        new Date(b.class_instance.class_date) >= today && b.status === 'booked'
      );

      const sortedBookings = [...allBookings].sort((a, b) =>
        new Date(a.class_instance.class_date) - new Date(b.class_instance.class_date)
      );

      courseHistory.push({
        id: `${enrollment.id}-${primaryCourseId}`,
        courseIdentifier: primaryCourseId,
        status: hasUpcomingClasses ? 'current' : 'completed',
        numberOfWeeks: sortedBookings.length,
        startDate: sortedBookings[0]?.class_instance.class_date,
        endDate: sortedBookings[sortedBookings.length - 1]?.class_instance.class_date
      });
      return;
    }

    // Create a separate history entry for each unique course
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
        startDate: sortedBookings[0]?.class_instance.class_date,
        endDate: sortedBookings[sortedBookings.length - 1]?.class_instance.class_date
      });
    });
  });

  // Sort by most recent first
  courseHistory.sort((a, b) => {
    const dateA = a.startDate || '';
    const dateB = b.startDate || '';
    return new Date(dateB) - new Date(dateA);
  });

  console.log('=== COURSE HISTORY ===');
  console.log(`Total courses in history: ${courseHistory.length}\n`);

  courseHistory.forEach((course, index) => {
    console.log(`${index + 1}. ${course.courseIdentifier}`);
    console.log(`   Status: ${course.status}`);
    console.log(`   Weeks: ${course.numberOfWeeks}`);
    console.log(`   Start: ${course.startDate?.split('T')[0]}`);
    console.log(`   End: ${course.endDate?.split('T')[0]}`);
    console.log('');
  });

  const completedCount = courseHistory.filter(c => c.status === 'completed').length;
  const currentCount = courseHistory.filter(c => c.status === 'current').length;

  console.log('=== SUMMARY ===');
  console.log(`Courses purchased: ${courseHistory.length}`);
  console.log(`Current courses: ${currentCount}`);
  console.log(`Completed courses: ${completedCount}`);
  console.log('');

  if (courseHistory.length === 4 && completedCount === 3 && currentCount === 1) {
    console.log('✅ SUCCESS: Edith shows 4 courses purchased, 3 completed, 1 current');
  } else {
    console.log(`❌ ERROR: Expected 4 courses (3 completed, 1 current), got ${courseHistory.length} (${completedCount} completed, ${currentCount} current)`);
  }

  // Also check the database cached value
  const { data: customer } = await supabase
    .from('customers')
    .select('course_purchase_count')
    .eq('id', edithId)
    .single();

  console.log(`\nDatabase cached value (course_purchase_count): ${customer?.course_purchase_count}`);
  if (customer?.course_purchase_count !== courseHistory.length) {
    console.log(`⚠️  WARNING: Cached value (${customer?.course_purchase_count}) doesn't match actual count (${courseHistory.length})`);
    console.log('   This is OK now because the frontend uses history.length instead of the cached value');
  }
}

verifyEdithCourseCount().then(() => process.exit());
