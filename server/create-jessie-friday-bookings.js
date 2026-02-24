require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createJessieFridayBookings() {
  console.log('=== CREATING JESSIE FRIDAY BOOKINGS (Oct 10 - Nov 14) ===\n');

  const jessieId = 1240;
  const enrollmentId = 4963; // Her completed enrollment

  const fridayClassIds = [
    { id: 10206, date: 'Oct 10', class_type: 'WT1010AM_JL6.1' },
    { id: 10207, date: 'Oct 17', class_type: 'WT1010AM_JL6.2' },
    { id: 10208, date: 'Oct 24', class_type: 'WT1010AM_JL6.3' },
    { id: 10209, date: 'Oct 31', class_type: 'WT1010AM_JL6.4' },
    { id: 10210, date: 'Nov 7', class_type: 'WT1010AM_JL6.5' },
    { id: 10211, date: 'Nov 14', class_type: 'WT1010AM_JL6.6' }
  ];

  const now = new Date().toISOString();

  for (const cls of fridayClassIds) {
    const { data, error } = await supabase
      .from('bookings')
      .insert({
        student_id: jessieId,
        class_instance_id: cls.id,
        course_enrollment_id: enrollmentId,
        status: 'attended',
        attended: true,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      console.error(`❌ Error creating booking for ${cls.date}:`, error.message);
    } else {
      console.log(`✅ Created booking ${data.id} for ${cls.date} - ${cls.class_type}`);
    }
  }

  console.log('\n=== VERIFYING JESSIE\'S UPDATED COURSE COUNT ===\n');

  // Re-run the course grouping logic
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
    .eq('student_id', jessieId);

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

  console.log(`Jessie Ong now has ${courses.length} courses:\n`);
  courses.forEach((course, idx) => {
    console.log(`${idx + 1}. ${course.courseIdentifier} (${course.bookingCount} bookings)`);
  });

  console.log(`\n✅ Total course count: ${courses.length}`);
}

createJessieFridayBookings().then(() => process.exit());
