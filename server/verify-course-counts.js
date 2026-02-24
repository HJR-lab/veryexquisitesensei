require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function verifyCourseCountsForTargetStudents() {
  console.log('=== VERIFYING COURSE COUNTS FOR EDITH, INGE, AND JESSIE ===\n');

  // Find these students by name
  const { data: students } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email')
    .or('first_name.ilike.edith,first_name.ilike.inge,first_name.ilike.jessie');

  console.log(`Found ${students?.length || 0} matching students:\n`);

  for (const student of students || []) {
    console.log(`\n📋 ${student.first_name} ${student.last_name} (ID: ${student.id})`);

    // Get their enrollments
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', student.id);

    // Get their bookings with class details
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
      .eq('student_id', student.id);

    console.log(`   Enrollments: ${enrollments?.length || 0}`);
    console.log(`   Bookings: ${bookings?.length || 0}`);

    // Apply the same course grouping logic
    const extractCourseIdentifier = (classType) => {
      if (!classType) return null;
      const match = classType.match(/^(.+?)(?:\.\d+)?$/);
      return match ? match[1] : classType;
    };

    const courses = [];
    const enrollmentMap = {};

    // Group bookings by enrollment
    (bookings || []).forEach(booking => {
      const enrollmentId = booking.course_enrollment_id;
      if (!enrollmentMap[enrollmentId]) {
        enrollmentMap[enrollmentId] = [];
      }
      enrollmentMap[enrollmentId].push(booking);
    });

    // Process each enrollment
    Object.keys(enrollmentMap).forEach(enrollmentId => {
      const enrollmentBookings = enrollmentMap[enrollmentId];

      // Group by course identifier
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

      // Apply makeup class detection
      const courseIds = Object.keys(bookingsByCourse);
      const hasFullCourse = courseIds.some(id => bookingsByCourse[id].length >= 4);

      // If no full courses (all < 4 bookings), keep together
      if (!hasFullCourse && courseIds.length > 1) {
        const primaryCourseId = courseIds[0];
        courses.push({
          courseIdentifier: primaryCourseId,
          bookingCount: enrollmentBookings.length,
          isComposite: true
        });
      } else {
        // Split into separate courses
        courseIds.forEach(courseId => {
          const courseBookings = bookingsByCourse[courseId];
          courses.push({
            courseIdentifier: courseId,
            bookingCount: courseBookings.length,
            isComposite: false
          });
        });
      }
    });

    console.log(`\n   ✅ TOTAL COURSES: ${courses.length}\n`);
    courses.forEach((course, idx) => {
      console.log(`   ${idx + 1}. ${course.courseIdentifier} (${course.bookingCount} bookings)${course.isComposite ? ' [composite]' : ''}`);
    });

    console.log('\n   ---');
  }

  console.log('\n\n=== EXPECTED COUNTS ===');
  console.log('Edith: 4 courses');
  console.log('Inge: 4 courses');
  console.log('Jessie: 5 courses');
}

verifyCourseCountsForTargetStudents().then(() => process.exit());
