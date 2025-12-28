require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkPatterns() {
  console.log('\n🔍 CHECKING CLASS_TYPE PATTERNS\n');

  // Get sample cohort
  const { data: classes } = await supabase
    .from('class_instances')
    .select('class_type, class_date, max_capacity')
    .ilike('class_type', '%WT2504%')
    .order('class_date')
    .limit(10);

  console.log('Sample WT cohort class_types:\n');
  
  if (classes) {
    classes.forEach((c, i) => {
      console.log(`Week ${i + 1}: ${c.class_type} - Capacity: ${c.max_capacity}`);
    });
  }

  // Check week 6 pattern
  const { data: week6 } = await supabase
    .from('class_instances')
    .select('class_type, max_capacity')
    .ilike('class_type', '%.6')
    .limit(20);

  console.log('\n\nWeek 6 classes (.6 suffix):\n');
  if (week6) {
    week6.forEach(c => {
      console.log(`   ${c.class_type} - Capacity: ${c.max_capacity}`);
    });
  }

  process.exit(0);
}

checkPatterns().catch(console.error);
