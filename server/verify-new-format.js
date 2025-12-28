require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function verify() {
  const { data, count } = await supabase.from('class_instances').select('*', { count: 'exact' }).like('class_type', 'HB/__/__/___%').order('class_date').limit(10);
  console.log('Total HB classes (new format):', count);
  console.log('\nFirst 10 classes:');
  data.forEach(c => console.log(c.class_date, '-', c.class_type, '-', c.start_time, 'to', c.end_time));
  process.exit(0);
}
verify();
