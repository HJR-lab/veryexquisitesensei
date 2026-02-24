require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createSarahSundayClasses() {
  console.log('=== CREATING SUNDAY CLASSES FOR SARAH CHER ===\n');

  const sarahId = 1197;
  const now = new Date().toISOString();

  // Sunday dates from October 12 to November 16, 2025 (6 weeks)
  const sundayDates = [
    { date: '2025-10-12', week: 1 },
    { date: '2025-10-19', week: 2 },
    { date: '2025-10-26', week: 3 },
    { date: '2025-11-02', week: 4 },
    { date: '2025-11-09', week: 5 },
    { date: '2025-11-16', week: 6 }
  ];

  const classIds = [];

  // Create class instances
  console.log('Creating class instances:\n');

  for (const { date, week } of sundayDates) {
    const { data, error } = await supabase
      .from('class_instances')
      .insert({
        class_type: `WT1210AM_JL6.${week}`,
        class_date: date,
        start_time: '9:30am',
        end_time: '12:00pm',
        instructor: 'Joyce Lim',
        room: 'Main Studio',
        max_capacity: 8,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      console.error(`❌ Error creating class for ${date}:`, error.message);
    } else {
      console.log(`✅ Created class ${data.id} for ${date} - WT1210AM_JL6.${week}`);
      classIds.push(data.id);
    }
  }

  // Create enrollment
  console.log('\n=== CREATING ENROLLMENT ===\n');

  const { data: enrollment, error: enrollError } = await supabase
    .from('course_enrollments')
    .insert({
      student_id: sarahId,
      course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
      course_identifier: 'WT1210AM_JL6',
      course_start_date: '2025-10-12',
      course_end_date: '2025-11-16',
      status: 'completed',
      created_at: now,
      updated_at: now
    })
    .select()
    .single();

  if (enrollError) {
    console.error('❌ Error creating enrollment:', enrollError.message);
    return;
  }

  console.log(`✅ Created enrollment ${enrollment.id}`);

  // Create bookings
  console.log('\n=== CREATING BOOKINGS ===\n');

  for (const classId of classIds) {
    const { data, error } = await supabase
      .from('bookings')
      .insert({
        student_id: sarahId,
        class_instance_id: classId,
        course_enrollment_id: enrollment.id,
        status: 'attended',
        attended: true,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      console.error(`❌ Error creating booking:`, error.message);
    } else {
      console.log(`✅ Created booking ${data.id} for class ${classId}`);
    }
  }

  console.log('\n=== VERIFYING SARAH CHER TOTAL COURSES ===\n');

  // Get all bookings
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
    .eq('student_id', sarahId);

  const extractCourseIdentifier = (classType) => {
    if (!classType) return null;
    const match = classType.match(/^(.+?)(?:\\.\\d+)?$/);
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

  console.log(`Sarah Cher now has ${courses.length} total courses:\n`);
  courses.forEach((course, idx) => {
    console.log(`${idx + 1}. ${course.courseIdentifier} (${course.bookingCount} bookings)`);
  });

  if (courses.length === 3) {
    console.log('\n✅ Sarah Cher has exactly 3 courses as expected');
  } else {
    console.log(`\n⚠️ Sarah Cher has ${courses.length} courses, expected 3`);
  }
}

createSarahSundayClasses().then(() => process.exit());
