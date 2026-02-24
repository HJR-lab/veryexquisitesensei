require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function check() {
  const { data } = await supabase
    .from('course_enrollments')
    .select('*')
    .gte('course_start_date', '2026-01-01')
    .lte('course_start_date', '2026-03-31')
    .eq('status', 'active')
    .ilike('course_type', '%wheelthrowing%')
    .is('bookings_created_at', null);
    
  const cohorts = {};
  if (data) {
    data.forEach(e => {
      const key = e.schedule_pattern + ' ' + (e.class_time || '') + ' ' + e.course_start_date;
      if (!cohorts[key]) cohorts[key] = [];
      cohorts[key].push(e);
    });
    
    console.log('WHEELTHROWING COHORTS IN Q1 2026 NEEDING CLASSES:\n');
    Object.keys(cohorts).forEach(key => {
      const count = cohorts[key].length;
      console.log(key, ':', count, 'students', count >= 4 ? '✅' : '⏳');
    });
  }
  
  console.log('\nTotal cohorts:', Object.keys(cohorts).length);
  
  process.exit(0);
}

check();
