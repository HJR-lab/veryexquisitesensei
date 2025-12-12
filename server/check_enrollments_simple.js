require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('course_enrollments').select('*').limit(2);
  if (error) {
    console.log('Error:', error.message);
  } else {
    console.log('Columns:', data.length > 0 ? Object.keys(data[0]).join(', ') : 'No data');
    console.log(JSON.stringify(data, null, 2));
  }
  process.exit(0);
}
check();
