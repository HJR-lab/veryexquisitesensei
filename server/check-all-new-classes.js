require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkAllNew() {
  const today = new Date().toISOString().split('T')[0];
  
  const { data: newClasses } = await supabase
    .from('class_instances')
    .select('*')
    .gte('created_at', today)
    .order('class_date', { ascending: true });
    
  console.log(`=== ALL ${newClasses.length} CLASSES CREATED TODAY ===\n`);
  
  const byMonth = {};
  newClasses.forEach(cls => {
    const month = cls.class_date.substring(0, 7); // YYYY-MM
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(cls);
  });
  
  Object.keys(byMonth).sort().forEach(month => {
    console.log(`\n${month} (${byMonth[month].length} classes):`);
    byMonth[month].forEach(cls => {
      console.log(`  ${cls.class_date.split('T')[0]} - ${cls.class_type} - ${cls.start_time}`);
    });
  });
  
  process.exit(0);
}

checkAllNew().catch(console.error);
