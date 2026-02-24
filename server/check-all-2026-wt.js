require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkAll2026WT() {
  try {
    console.log('\n🔍 Checking all 2026 WT courses...\n');

    const { data: allClasses, error } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .gte('class_date', '2026-01-01')
      .lt('class_date', '2027-01-01')
      .order('class_date', { ascending: true });

    if (error) {
      console.error('❌ Error querying database:', error);
      return;
    }

    const wtClasses = allClasses.filter(cls =>
      cls.class_type && cls.class_type.startsWith('WT')
    );

    // Group by course
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
          firstDate: cls.class_date,
          status: cls.status
        });
      }
      courseMap.get(baseIdentifier).classes.push(cls);
    });

    const sortedCourses = Array.from(courseMap.entries()).sort((a, b) => {
      return new Date(a[1].firstDate) - new Date(b[1].firstDate);
    });

    console.log(`Found ${sortedCourses.length} WT courses in 2026:\n`);

    sortedCourses.forEach(([courseId, data], index) => {
      const firstClass = data.classes[0];
      const firstDate = new Date(firstClass.class_date);
      const dayName = firstDate.toLocaleDateString('en-US', { weekday: 'long' });
      const dateStr = firstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      console.log(`${index + 1}. ${courseId} [${data.status.toUpperCase()}]`);
      console.log(`   ${dayName}s ${data.startTime} | Starts: ${dateStr}`);
      console.log(`   Classes: ${data.classes.length} | Instructor: ${data.instructor}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

checkAll2026WT();
