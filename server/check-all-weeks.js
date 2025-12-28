require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkAllWeeks() {
  const { data: allClasses } = await supabase
    .from('class_instances')
    .select('class_type, max_capacity')
    .limit(500);

  const weekNumbers = new Set();
  const capacityByWeek = {};

  allClasses.forEach(c => {
    const parts = c.class_type.split('.');
    if (parts.length === 2) {
      const weekNum = parts[1];
      weekNumbers.add(weekNum);
      if (!capacityByWeek[weekNum]) capacityByWeek[weekNum] = [];
      capacityByWeek[weekNum].push(c.max_capacity);
    }
  });

  console.log('Week numbers found:', Array.from(weekNumbers).sort());
  console.log('\nCapacity by week:');
  Array.from(weekNumbers).sort().forEach(week => {
    const caps = capacityByWeek[week];
    console.log(`  Week ${week}: ${caps[0]} capacity`);
  });

  process.exit(0);
}

checkAllWeeks().catch(console.error);
