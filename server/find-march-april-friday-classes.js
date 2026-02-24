require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function findMarchAprilFridayClasses() {
  console.log('=== FINDING FRIDAY CLASSES MARCH 14 - APRIL 25, 2025 ===\n');

  // Find all classes between March 14 and April 25, 2025 at 9:30am
  const { data: classes } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2025-03-14')
    .lte('class_date', '2025-04-25')
    .ilike('start_time', '9:30%')
    .order('class_date');

  console.log(`Found ${classes?.length || 0} classes at 9:30am:\n`);

  // Group by class_type prefix (course identifier)
  const extractCourseIdentifier = (classType) => {
    if (!classType) return null;
    const match = classType.match(/^(.+?)(?:\.\d+)?$/);
    return match ? match[1] : classType;
  };

  const courseMap = {};
  classes?.forEach(cls => {
    const courseId = extractCourseIdentifier(cls.class_type);
    if (courseId) {
      if (!courseMap[courseId]) {
        courseMap[courseId] = [];
      }
      courseMap[courseId].push(cls);
    }
  });

  console.log('Grouped by course identifier:\n');
  Object.keys(courseMap).forEach((courseId, idx) => {
    const courseCl = courseMap[courseId];
    console.log(`${idx + 1}. ${courseId} (${courseCl.length} classes)`);

    // Find Friday classes
    const fridayClasses = courseCl.filter(c => {
      const date = new Date(c.class_date);
      return date.getDay() === 5; // Friday is day 5
    });

    if (fridayClasses.length > 0) {
      console.log(`   ✅ FRIDAY CLASSES: ${fridayClasses.length}`);
      fridayClasses.forEach(fc => {
        console.log(`      - ${fc.class_date} ${fc.class_type} (ID: ${fc.id})`);
      });
    }
    console.log('');
  });

  // Find specifically Friday classes
  console.log('\n=== FRIDAY CLASSES ONLY ===\n');

  const fridayClasses = classes?.filter(c => {
    const date = new Date(c.class_date);
    return date.getDay() === 5;
  });

  console.log(`Found ${fridayClasses?.length || 0} Friday classes:\n`);

  // Group Friday classes by course identifier
  const fridayCourseMap = {};
  fridayClasses?.forEach(cls => {
    const courseId = extractCourseIdentifier(cls.class_type);
    if (courseId) {
      if (!fridayCourseMap[courseId]) {
        fridayCourseMap[courseId] = [];
      }
      fridayCourseMap[courseId].push(cls);
    }
  });

  Object.keys(fridayCourseMap).forEach((courseId, idx) => {
    const courseCls = fridayCourseMap[courseId];
    console.log(`${idx + 1}. ${courseId} (${courseCls.length} Friday classes)`);
    courseCls.forEach(fc => {
      console.log(`   ${fc.class_date} - ${fc.class_type} (ID: ${fc.id})`);
    });
    console.log('');
  });
}

findMarchAprilFridayClasses().then(() => process.exit());
