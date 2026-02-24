require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkSarahSundayClasses() {
  console.log('=== CHECKING FOR SUNDAY CLASSES OCT 12 - NOV 16, 2025 ===\n');

  // Find Sunday classes in the date range
  const { data: sundayClasses } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2025-10-12')
    .lte('class_date', '2025-11-16')
    .order('class_date');

  console.log(`Found ${sundayClasses?.length || 0} classes in date range\n`);

  // Filter for Sundays at 9:30am
  const targetClasses = sundayClasses?.filter(cls => {
    const date = new Date(cls.class_date);
    const dayOfWeek = date.getUTCDay();
    return dayOfWeek === 0 && cls.start_time === '9:30am';
  });

  console.log(`Found ${targetClasses?.length || 0} Sunday 9:30am classes:\n`);

  targetClasses?.forEach(cls => {
    console.log(`- ${cls.class_date} ${cls.class_type} ${cls.start_time}-${cls.end_time} (ID: ${cls.id})`);
  });

  if (targetClasses && targetClasses.length === 6) {
    console.log('\n✅ Found all 6 Sunday classes needed for Sarah Cher');
    console.log('\nCourse identifier:', targetClasses[0]?.class_type.split('.')[0]);
  } else if (targetClasses && targetClasses.length > 0) {
    console.log(`\n⚠️ Found only ${targetClasses.length} Sunday classes, expected 6`);
  } else {
    console.log('\n❌ No Sunday classes found. Will need to create them.');
    console.log('\nExpected dates:');
    console.log('- 2025-10-12 (Sunday)');
    console.log('- 2025-10-19 (Sunday)');
    console.log('- 2025-10-26 (Sunday)');
    console.log('- 2025-11-02 (Sunday)');
    console.log('- 2025-11-09 (Sunday)');
    console.log('- 2025-11-16 (Sunday)');
  }
}

checkSarahSundayClasses().then(() => process.exit());
