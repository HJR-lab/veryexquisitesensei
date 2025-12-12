require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  const { data: classes } = await supabase
    .from('class_instances')
    .select('class_type, class_date, instructor')
    .order('class_date', { ascending: true });

  // Group by course
  const courses = new Map();
  classes.forEach(cls => {
    const baseMatch = cls.class_type.match(/^(.+)\.\d+$/);
    const baseId = baseMatch ? baseMatch[1] : cls.class_type;
    if (!courses.has(baseId)) {
      courses.set(baseId, {
        identifier: baseId,
        instructor: cls.instructor,
        firstClass: cls.class_date,
        classCount: 0
      });
    }
    courses.get(baseId).classCount++;
  });

  console.log('\nAll courses in database:\n');
  for (const [id, course] of courses) {
    console.log(`${id} | ${course.instructor} | First class: ${course.firstClass.split('T')[0]} | ${course.classCount} classes`);
  }

  console.log(`\nTotal: ${courses.size} courses`);
  process.exit(0);
})();
