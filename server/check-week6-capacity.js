require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkWeek6Capacity() {
  // Get all week 6 classes
  const { data: week6Classes } = await supabase
    .from('class_instances')
    .select('class_type, max_capacity, class_date')
    .like('class_type', '%_JL6.6')
    .order('class_date')
    .limit(20);

  console.log('\nWeek 6 (.6) Glazing Classes:\n');
  if (week6Classes && week6Classes.length > 0) {
    week6Classes.forEach(c => {
      console.log(`   ${c.class_type} - ${c.class_date} - Capacity: ${c.max_capacity}`);
    });
    
    const capacities = week6Classes.map(c => c.max_capacity);
    const uniqueCaps = [...new Set(capacities)];
    console.log(`\nUnique capacities for week 6: ${uniqueCaps.join(', ')}`);
  } else {
    console.log('   No week 6 classes found with _JL6.6 pattern');
  }

  // Also check LT (Lynette) week 4 (HB last class)
  const { data: hbWeek4 } = await supabase
    .from('class_instances')
    .select('class_type, max_capacity, class_date')
    .like('class_type', '%_LT4.4')
    .order('class_date')
    .limit(10);

  console.log('\n\nHB Week 4 (.4) Classes:\n');
  if (hbWeek4 && hbWeek4.length > 0) {
    hbWeek4.forEach(c => {
      console.log(`   ${c.class_type} - ${c.class_date} - Capacity: ${c.max_capacity}`);
    });
  }

  process.exit(0);
}

checkWeek6Capacity().catch(console.error);
