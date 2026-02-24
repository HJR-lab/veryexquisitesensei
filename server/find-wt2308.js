require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function find() {
  const { data } = await supabase.from('class_instances').select('*').ilike('class_type', '%WT2308%').order('class_date');
  console.log('Found', data ? data.length : 0, 'WT2308 classes');
  if (data) data.forEach(c => console.log(c.class_date, c.class_type, c.instructor_name));
}
find().then(() => process.exit());