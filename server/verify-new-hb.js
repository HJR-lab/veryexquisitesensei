require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function verify() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase.from('class_instances').select('*').like('class_type', 'HB_%').gte('created_at', today).order('class_date').limit(10);
  console.log('Newly created HB classes:', data.length);
  data.forEach(c => console.log(c.class_date, '-', c.class_type));
  process.exit(0);
}
verify();
