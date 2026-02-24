require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkJan2026WTCourses() {
  try {
    console.log('\n🔍 Finding all WT courses in January 2026...\n');

    // Find all WT classes in January 2026
    const { data: jan2026Classes, error } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .gte('class_date', '2026-01-01')
      .lt('class_date', '2026-02-01')
      .order('class_date', { ascending: true });

    if (error) {
      console.error('❌ Error querying database:', error);
      return;
    }

    // Filter for WT classes only
    const wtClasses = jan2026Classes.filter(cls =>
      cls.class_type && cls.class_type.startsWith('WT')
    );

    // Group by course (base identifier)
    const courseMap = new Map();
    wtClasses.forEach(cls => {
      const fullIdentifier = cls.class_type;
      const lastDotIndex = fullIdentifier.lastIndexOf('.');
      const baseIdentifier = lastDotIndex > 0 ? fullIdentifier.substring(0, lastDotIndex) : fullIdentifier;

      if (!courseMap.has(baseIdentifier)) {
        courseMap.set(baseIdentifier, {
          classes: [],
          instructor: cls.instructor,
          startTime: cls.start_time,
          firstDate: cls.class_date
        });
      }
      courseMap.get(baseIdentifier).classes.push(cls);
    });

    // Sort courses by first class date
    const sortedCourses = Array.from(courseMap.entries()).sort((a, b) => {
      return new Date(a[1].firstDate) - new Date(b[1].firstDate);
    });

    console.log(`Found ${sortedCourses.length} WT courses starting in January 2026:\n`);

    sortedCourses.forEach(([courseId, data], index) => {
      const firstClass = data.classes[0];
      const firstDate = new Date(firstClass.class_date);
      const dayName = firstDate.toLocaleDateString('en-US', { weekday: 'short' });

      console.log(`${index + 1}. ${courseId}`);
      console.log(`   Instructor: ${data.instructor}`);
      console.log(`   Day/Time: ${dayName} ${data.startTime}`);
      console.log(`   First class: ${firstClass.class_date.split('T')[0]}`);
      console.log(`   Total classes: ${data.classes.length}`);
      console.log('');
    });

    console.log(`\n📊 Total: ${sortedCourses.length} courses in January 2026`);

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

checkJan2026WTCourses();
