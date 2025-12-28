require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);
async function check() {
  const { data: w6 } = await supabase
    .from('class_instances')
    .select('class_type, max_capacity')
    .like('class_type', '%6.6')
    .limit(20);
  console.log('Week 6 glazing (.6):');
  if (w6) w6.forEach(c => console.log(`  ${c.class_type}: cap=${c.max_capacity}`));
  
  const { data: w1 } = await supabase
    .from('class_instances')
    .select('max_capacity')
    .like('class_type', '%6.1')
    .limit(5);
  console.log('\nWeek 1 (.1):');
  if (w1) w1.forEach(c => console.log(`  cap=${c.max_capacity}`));
  process.exit(0);
}
check().catch(console.error);
