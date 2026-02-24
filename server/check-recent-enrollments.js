require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function check() {
  const { data } = await supabase
    .from('course_enrollments')
    .select('*')
    .gte('created_at', '2024-11-01')
    .eq('status', 'active')
    .ilike('course_type', '%wheelthrowing%')
    .order('created_at', { ascending: false })
    .limit(20);
    
  console.log('RECENT WHEELTHROWING ENROLLMENTS:\n');
  
  if (data) {
    data.forEach(e => {
      console.log('Enrolled:', e.created_at.substring(0, 10));
      console.log('Course starts:', e.course_start_date);
      console.log('Schedule:', e.schedule_pattern, e.class_time);
      console.log('Bookings created:', e.bookings_created_at ? 'YES' : 'NO');
      console.log('---');
    });
  }
  
  process.exit(0);
}

check();
