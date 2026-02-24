require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function check() {
  const { data, count } = await supabase
    .from('class_instances')
    .select('id, class_date, class_type, start_time, current_enrollment', { count: 'exact' })
    .gte('class_date', '2026-01-01')
    .lte('class_date', '2026-02-28')
    .order('class_date');
    
  console.log('CLASSES IN JAN-FEB 2026:', count);
  console.log();
  
  if (data) {
    data.slice(0, 30).forEach(c => {
      const date = c.class_date.substring(0, 10);
      console.log(date, c.start_time, c.class_type, 'enrolled:', c.current_enrollment);
    });
  }
  
  process.exit(0);
}

check();
