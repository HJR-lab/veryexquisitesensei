require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkJanClassDetails() {
  try {
    console.log('\n🔍 Checking January 2026 class details...\n');

    const { data: classes } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .gte('class_date', '2026-01-01')
      .lt('class_date', '2026-03-31')
      .ilike('class_type', 'WT%')
      .order('class_date', { ascending: true });

    // Group by course
    const courseMap = new Map();
    classes.forEach(cls => {
      const fullIdentifier = cls.class_type;
      const lastDotIndex = fullIdentifier.lastIndexOf('.');
      const baseIdentifier = lastDotIndex > 0 ? fullIdentifier.substring(0, lastDotIndex) : fullIdentifier;

      if (!courseMap.has(baseIdentifier)) {
        courseMap.set(baseIdentifier, []);
      }
      courseMap.get(baseIdentifier).push(cls);
    });

    console.log(`Found ${courseMap.size} courses:\n`);

    courseMap.forEach((classes, courseId) => {
      console.log(`\n📚 ${courseId} (${classes.length} classes)`);
      classes.forEach(cls => {
        const date = new Date(cls.class_date);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        console.log(`   ${cls.class_type} | ${dayName} | ${cls.start_time} | Status: ${cls.status}`);
      });
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkJanClassDetails();
