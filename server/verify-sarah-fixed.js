require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function verifySarahFixed() {
  console.log('=== FIXED VERIFICATION: SARAH CHER COURSE COUNT ===\n');

  const sarahId = 1197;

  // Get bookings with class details
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      course_enrollment_id,
      class_instances!bookings_class_instance_id_fkey (
        class_type,
        class_date
      )
    `)
    .eq('student_id', sarahId);

  console.log(`Total bookings: ${bookings?.length || 0}\n`);

  const extractCourseIdentifier = (classType) => {
    if (!classType) return null;
    // Fix: single backslash for escaping dot in regex
    const match = classType.match(/^(.+?)(?:\.\d+)?$/);
    return match ? match[1] : classType;
  };

  const courses = [];
  const enrollmentMap = {};

  bookings?.forEach(booking => {
    const enrollmentId = booking.course_enrollment_id;
    if (!enrollmentMap[enrollmentId]) {
      enrollmentMap[enrollmentId] = [];
    }
    enrollmentMap[enrollmentId].push(booking);
  });

  console.log('=== PROCESSING BY ENROLLMENT ===\n');

  Object.keys(enrollmentMap).forEach(enrollmentId => {
    const enrollmentBookings = enrollmentMap[enrollmentId];
    console.log(`Enrollment ${enrollmentId}: ${enrollmentBookings.length} bookings`);

    const bookingsByCourse = {};
    enrollmentBookings.forEach(booking => {
      const courseId = extractCourseIdentifier(booking.class_instances?.class_type);
      if (courseId) {
        if (!bookingsByCourse[courseId]) {
          bookingsByCourse[courseId] = [];
        }
        bookingsByCourse[courseId].push(booking);
      }
    });

    const courseIds = Object.keys(bookingsByCourse);
    console.log(`  Course identifiers found: ${courseIds.join(', ')}`);

    courseIds.forEach(id => {
      console.log(`    - ${id}: ${bookingsByCourse[id].length} bookings`);
    });

    const hasFullCourse = courseIds.some(id => bookingsByCourse[id].length >= 4);
    console.log(`  Has full course (>=4 bookings): ${hasFullCourse}`);

    if (!hasFullCourse && courseIds.length > 1) {
      console.log(`  → Keeping together as makeup course`);
      const primaryCourseId = courseIds[0];
      courses.push({
        courseIdentifier: primaryCourseId,
        bookingCount: enrollmentBookings.length
      });
    } else {
      console.log(`  → Splitting into separate courses`);
      courseIds.forEach(courseId => {
        const courseBookings = bookingsByCourse[courseId];
        courses.push({
          courseIdentifier: courseId,
          bookingCount: courseBookings.length
        });
      });
    }
    console.log('');
  });

  console.log('=== FINAL RESULT ===\n');
  console.log(`Sarah Cher has ${courses.length} total courses:\n`);
  courses.forEach((course, idx) => {
    console.log(`${idx + 1}. ${course.courseIdentifier} (${course.bookingCount} bookings)`);
  });

  if (courses.length === 3) {
    console.log('\n✅ SUCCESS: Sarah Cher has exactly 3 courses as expected');
  } else {
    console.log(`\n❌ ERROR: Sarah Cher has ${courses.length} courses, expected 3`);
  }
}

verifySarahFixed().then(() => process.exit());
