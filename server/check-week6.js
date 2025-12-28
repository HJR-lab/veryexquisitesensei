require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkWeek6() {
  console.log('\n🔍 CHECKING WEEK 6 GLAZING CLASSES\n');

  // Get week 6 classes (those ending in .6)
  const { data: week6 } = await supabase
    .from('class_instances')
    .select('class_type, max_capacity, class_date, day_of_week')
    .ilike('class_type', '%.6')
    .order('class_date')
    .limit(15);

  console.log('Week 6 classes (should be glazing):\n');
  if (week6) {
    week6.forEach(c => {
      console.log(`   ${c.class_type} - ${c.class_date} ${c.day_of_week} - Capacity: ${c.max_capacity}`);
    });
  }

  // Get other weeks for comparison
  const { data: week1 } = await supabase
    .from('class_instances')
    .select('class_type, max_capacity')
    .ilike('class_type', '%.1')
    .limit(10);

  console.log('\n\nWeek 1 classes for comparison:\n');
  if (week1) {
    week1.forEach(c => {
      console.log(`   ${c.class_type} - Capacity: ${c.max_capacity}`);
    });
  }

  process.exit(0);
}

checkWeek6().catch(console.error);
