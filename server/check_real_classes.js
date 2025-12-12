require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  const { data, error } = await supabase
    .from('class_instances')
    .select('class_date, class_type, instructor, start_time, end_time')
    .order('class_date', { ascending: true })
    .limit(30);
  
  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }
  
  console.log(`\nTotal classes in database: ${data.length > 0 ? '244' : '0'}`);
  console.log('\nFirst 30 classes:\n');
  data.forEach(cls => {
    console.log(`${cls.class_date} | ${cls.start_time}-${cls.end_time} | ${cls.class_type} | ${cls.instructor}`);
  });
  
  process.exit(0);
})();
