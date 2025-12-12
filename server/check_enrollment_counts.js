require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkEnrollmentCounts() {
  try {
    console.log('🔍 Checking enrollment counts per course...\n');

    // Get all class instances with their bookings
    const { data: classes, error: classError } = await supabase
      .from('class_instances')
      .select('id, class_date, start_time, instructor, class_type')
      .gte('class_date', '2025-01-01')
      .order('class_date', { ascending: true });

    if (classError) throw classError;

    // Group classes into courses (same start time, instructor, type, consecutive weeks)
    const courses = {};

    for (const cls of classes) {
      // Get bookings for this class
      const { data: bookings, error: bookingError } = await supabase
        .from('bookings')
        .select('student_id')
        .eq('class_instance_id', cls.id);

      if (bookingError) throw bookingError;

      const uniqueStudents = [...new Set(bookings.map(b => b.student_id))];

      // Create a course key
      const courseKey = `${cls.class_date.split('T')[0]}_${cls.start_time}_${cls.instructor}`;

      if (!courses[courseKey]) {
        courses[courseKey] = {
          firstClass: cls,
          studentCount: uniqueStudents.length
        };
      }
    }

    // Check for over-capacity courses
    let overCapacity = [];
    for (const [key, course] of Object.entries(courses)) {
      if (course.studentCount > 8) {
        overCapacity.push({
          date: course.firstClass.class_date,
          time: course.firstClass.start_time,
          instructor: course.firstClass.instructor,
          type: course.firstClass.class_type,
          count: course.studentCount
        });
      }
    }

    if (overCapacity.length > 0) {
      console.log('⚠️  Found courses with more than 8 students:\n');
      for (const course of overCapacity) {
        console.log(`${course.date} ${course.time} - ${course.instructor} (${course.type})`);
        console.log(`   👥 ${course.count} students enrolled (max 8)\n`);
      }
    } else {
      console.log('✅ All courses have 8 or fewer students enrolled');
    }

    // Also show summary of all courses
    console.log('\n📊 All course enrollment counts:');
    for (const [key, course] of Object.entries(courses)) {
      console.log(`${course.firstClass.class_date} ${course.firstClass.start_time} - ${course.firstClass.instructor}: ${course.studentCount}/8 students`);
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkEnrollmentCounts();
