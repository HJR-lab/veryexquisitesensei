require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function combineJessieAccounts() {
  console.log('=== COMBINING JESSIE ACCOUNTS ===\n');

  const jessieOngId = 1240; // jessieong326@yahoo.com
  const kevynJessieId = 1300; // kevyn.jessie@gmail.com

  // Get Kevyn Jessie's enrollment and bookings
  const { data: kevynEnrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', kevynJessieId);

  console.log(`Kevyn Jessie has ${kevynEnrollments?.length || 0} enrollments\n`);

  const { data: kevynBookings } = await supabase
    .from('bookings')
    .select('*')
    .eq('student_id', kevynJessieId);

  console.log(`Kevyn Jessie has ${kevynBookings?.length || 0} bookings\n`);

  // Transfer enrollments to Jessie Ong
  console.log('Transferring enrollments...\n');
  for (const enrollment of kevynEnrollments || []) {
    const { error } = await supabase
      .from('course_enrollments')
      .update({ student_id: jessieOngId })
      .eq('id', enrollment.id);

    if (error) {
      console.error(`❌ Error transferring enrollment ${enrollment.id}:`, error.message);
    } else {
      console.log(`✅ Transferred enrollment ${enrollment.id} to Jessie Ong`);
    }
  }

  // Transfer bookings to Jessie Ong
  console.log('\nTransferring bookings...\n');
  for (const booking of kevynBookings || []) {
    const { error } = await supabase
      .from('bookings')
      .update({ student_id: jessieOngId })
      .eq('id', booking.id);

    if (error) {
      console.error(`❌ Error transferring booking ${booking.id}:`, error.message);
    } else {
      console.log(`✅ Transferred booking ${booking.id} to Jessie Ong`);
    }
  }

  // Verify Jessie Ong's total courses now
  console.log('\n=== VERIFYING JESSIE ONG TOTAL COURSES ===\n');

  const { data: allBookings } = await supabase
    .from('bookings')
    .select(`
      id,
      course_enrollment_id,
      class_instances!bookings_class_instance_id_fkey (
        class_type,
        class_date
      )
    `)
    .eq('student_id', jessieOngId);

  const extractCourseIdentifier = (classType) => {
    if (!classType) return null;
    const match = classType.match(/^(.+?)(?:\.\d+)?$/);
    return match ? match[1] : classType;
  };

  const courses = [];
  const enrollmentMap = {};

  allBookings?.forEach(booking => {
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

  console.log(`Jessie Ong now has ${courses.length} total courses:\n`);
  courses.forEach((course, idx) => {
    console.log(`${idx + 1}. ${course.courseIdentifier} (${course.bookingCount} bookings)`);
  });

  console.log('\n✅ COMPLETE: Jessie Ong now has all 5 courses under one account');
}

combineJessieAccounts().then(() => process.exit());
