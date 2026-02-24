require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function findAllMarchAprilClasses() {
  console.log('=== ALL CLASSES MARCH 14 - APRIL 25, 2025 ===\n');

  // Find all classes between March 14 and April 25, 2025
  const { data: classes, error } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2025-03-14')
    .lte('class_date', '2025-04-25')
    .order('class_date');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${classes?.length || 0} total classes\n`);

  // Filter for Fridays (manually check day of week)
  const fridayClasses = classes?.filter(c => {
    const date = new Date(c.class_date);
    return date.getUTCDay() === 5; // Friday
  });

  console.log(`Friday classes: ${fridayClasses?.length || 0}\n`);

  if (fridayClasses && fridayClasses.length > 0) {
    // Group by course identifier
    const extractCourseIdentifier = (classType) => {
      if (!classType) return null;
      const match = classType.match(/^(.+?)(?:\.\d+)?$/);
      return match ? match[1] : classType;
    };

    const courseMap = {};
    fridayClasses.forEach(cls => {
      const courseId = extractCourseIdentifier(cls.class_type);
      if (courseId) {
        if (!courseMap[courseId]) {
          courseMap[courseId] = [];
        }
        courseMap[courseId].push(cls);
      }
    });

    Object.keys(courseMap).forEach((courseId, idx) => {
      const courseCls = courseMap[courseId];
      console.log(`${idx + 1}. ${courseId} (${courseCls.length} classes)`);
      courseCls.forEach(fc => {
        console.log(`   ${fc.class_date} - ${fc.class_type} ${fc.start_time}-${fc.end_time} (ID: ${fc.id})`);
      });
      console.log('');
    });
  }

  // Check specifically for March 14, 21, 28, April 4, 11, 18, 25 (Fridays)
  const expectedFridays = [
    '2025-03-14',
    '2025-03-21',
    '2025-03-28',
    '2025-04-04',
    '2025-04-11',
    '2025-04-18',
    '2025-04-25'
  ];

  console.log('\n=== CHECKING SPECIFIC FRIDAYS ===\n');
  expectedFridays.forEach(date => {
    const classesOnDate = classes?.filter(c => c.class_date.startsWith(date));
    console.log(`${date}: ${classesOnDate?.length || 0} classes`);
    classesOnDate?.forEach(c => {
      console.log(`   - ${c.class_type} ${c.start_time}-${c.end_time}`);
    });
  });
}

findAllMarchAprilClasses().then(() => process.exit());
