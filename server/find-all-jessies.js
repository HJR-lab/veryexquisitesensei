require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function findAllJessies() {
  console.log('=== FINDING ALL JESSIES WITH BOOKINGS ===\n');

  const { data: jessies } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email')
    .ilike('first_name', 'jessie');

  console.log(`Found ${jessies?.length || 0} Jessies:\n`);

  for (const jessie of jessies || []) {
    // Get bookings
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
      .eq('student_id', jessie.id);

    // Get enrollments
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', jessie.id);

    if (bookings && bookings.length > 0) {
      console.log(`\n📋 ${jessie.first_name} ${jessie.last_name} (ID: ${jessie.id})`);
      console.log(`   Email: ${jessie.email}`);
      console.log(`   Enrollments: ${enrollments?.length || 0}`);
      console.log(`   Bookings: ${bookings.length}`);

      // Apply course grouping logic
      const extractCourseIdentifier = (classType) => {
        if (!classType) return null;
        const match = classType.match(/^(.+?)(?:\.\d+)?$/);
        return match ? match[1] : classType;
      };

      const courses = [];
      const enrollmentMap = {};

      bookings.forEach(booking => {
        const enrollmentId = booking.course_enrollment_id;
        if (!enrollmentMap[enrollmentId]) {
          enrollmentMap[enrollmentId] = [];
        }
        enrollmentMap[enrollmentId].push(booking);
      });

      Object.keys(enrollmentMap).forEach(enrollmentId => {
        const enrollmentBookings = enrollmentMap[enrollmentId];

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
        const hasFullCourse = courseIds.some(id => bookingsByCourse[id].length >= 4);

        if (!hasFullCourse && courseIds.length > 1) {
          const primaryCourseId = courseIds[0];
          courses.push({
            courseIdentifier: primaryCourseId,
            bookingCount: enrollmentBookings.length
          });
        } else {
          courseIds.forEach(courseId => {
            const courseBookings = bookingsByCourse[courseId];
            courses.push({
              courseIdentifier: courseId,
              bookingCount: courseBookings.length
            });
          });
        }
      });

      console.log(`   TOTAL COURSES: ${courses.length}`);
      courses.forEach((course, idx) => {
        console.log(`     ${idx + 1}. ${course.courseIdentifier} (${course.bookingCount} bookings)`);
      });
    } else {
      console.log(`\n${jessie.first_name} ${jessie.last_name} (ID: ${jessie.id}) - No bookings`);
    }
  }
}

findAllJessies().then(() => process.exit());
