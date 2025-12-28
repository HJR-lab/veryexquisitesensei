require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function verify() {
  // Get HB classes created today
  const today = new Date().toISOString().split('T')[0];
  
  const { data: newClasses } = await supabase
    .from('class_instances')
    .select('*')
    .like('class_type', 'HB_%')
    .gte('created_at', today)
    .order('class_date')
    .limit(10);

  console.log('\nNewly created HB classes (today):');
  console.log(`Found ${newClasses?.length || 0} classes\n`);
  
  newClasses?.forEach(c => {
    console.log(`${c.class_date} - ${c.class_type}`);
    console.log(`  Time: ${c.start_time} to ${c.end_time}`);
    console.log(`  Instructor: ${c.instructor}, Room: ${c.room}`);
    console.log(`  Capacity: ${c.max_capacity}, Technique: ${c.class_technique || 'not set'}\n`);
  });
  
  process.exit(0);
}

verify();
