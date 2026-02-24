require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  const { data } = await supabase
    .from('course_enrollments')
    .select('id, course_start_date, schedule_pattern, class_time, status')
    .eq('status', 'active')
    .ilike('course_type', '%wheelthrowing%')
    .gte('course_start_date', '2026-01-01')
    .lte('course_start_date', '2026-01-31');

  const cohorts = {};
  if (data) {
    data.forEach(e => {
      const key = e.course_start_date + ' ' + e.schedule_pattern + ' ' + (e.class_time || 'no time');
      if (!cohorts[key]) cohorts[key] = [];
      cohorts[key].push(e);
    });

    console.log('COHORTS STARTING IN JANUARY 2026:\n');
    Object.keys(cohorts).sort().forEach(key => {
      const count = cohorts[key].length;
      console.log(key + ':', count, 'students');
    });

    console.log('\nTotal courses starting in Jan 2026:', Object.keys(cohorts).length);
    console.log('Total enrollments:', data.length);
  }

  process.exit(0);
})();
