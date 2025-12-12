require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkAllEnrollment() {
  // Get all classes grouped by base identifier
  const { data: allClasses } = await supabase
    .from('class_instances')
    .select('id, class_type, class_date, instructor, start_time')
    .order('class_date', { ascending: true });

  // Group by base identifier
  const courseMap = {};

  allClasses.forEach(cls => {
    const baseId = cls.class_type.substring(0, cls.class_type.lastIndexOf('.')) || cls.class_type;
    if (!courseMap[baseId]) {
      courseMap[baseId] = {
        baseIdentifier: baseId,
        firstClass: cls,
        weekCount: 0,
        classIds: []
      };
    }
    courseMap[baseId].weekCount++;
    courseMap[baseId].classIds.push(cls.id);
  });

  // Get enrollment for each course
  console.log('📊 ENROLLMENT BY COURSE:\n');

  let totalCourses = 0;
  let coursesWithStudents = 0;
  let coursesWithLessThan4 = 0;

  for (const [baseId, course] of Object.entries(courseMap)) {
    totalCourses++;

    // Count unique students across all weeks of this course
    const { data: bookings } = await supabase
      .from('bookings')
      .select('student_id')
      .in('class_instance_id', course.classIds)
      .in('status', ['booked', 'completed']);

    const uniqueStudents = new Set(bookings.map(b => b.student_id)).size;
    const firstClass = course.firstClass;

    if (uniqueStudents > 0) {
      coursesWithStudents++;
    }

    if (uniqueStudents < 4) {
      coursesWithLessThan4++;
    }

    const emoji = uniqueStudents === 0 ? '❌' : uniqueStudents < 4 ? '⚠️ ' : '✅';
    console.log(`${emoji} ${baseId} (${firstClass.class_date} ${firstClass.start_time}): ${uniqueStudents}/8 students`);
  }

  console.log(`\n📈 SUMMARY:`);
  console.log(`   Total courses: ${totalCourses}`);
  console.log(`   Courses with students: ${coursesWithStudents}`);
  console.log(`   Courses with 0-3 students: ${coursesWithLessThan4}`);
  console.log(`   Courses with 4+ students: ${totalCourses - coursesWithLessThan4}`);

  process.exit(0);
}

checkAllEnrollment();
