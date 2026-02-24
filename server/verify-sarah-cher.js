require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function verifySarahCher() {
  console.log('=== VERIFYING SARAH CHER COURSE COUNT ===\n');

  // Find Sarah Cher
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .ilike('first_name', 'sarah')
    .ilike('last_name', 'cher')
    .single();

  if (!customer) {
    console.log('❌ Sarah Cher not found');
    return;
  }

  console.log(`Found: ${customer.first_name} ${customer.last_name} (ID: ${customer.id})`);
  console.log(`Email: ${customer.email}\n`);

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
    .eq('student_id', customer.id);

  console.log(`Total bookings: ${bookings?.length || 0}\n`);

  // Apply course grouping logic
  const extractCourseIdentifier = (classType) => {
    if (!classType) return null;
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

  console.log(`Sarah Cher has ${courses.length} total courses:\n`);
  courses.forEach((course, idx) => {
    console.log(`${idx + 1}. ${course.courseIdentifier} (${course.bookingCount} bookings)`);
  });

  if (courses.length === 3) {
    console.log('\n✅ Sarah Cher has exactly 3 courses as expected');
  } else {
    console.log(`\n⚠️ Sarah Cher has ${courses.length} courses, expected 3`);
  }
}

verifySarahCher().then(() => process.exit());
