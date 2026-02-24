require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  // Get ONLY recent enrollments for January 2026
  const { data } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('status', 'active')
    .ilike('course_type', '%wheelthrowing%')
    .gte('created_at', '2025-11-01')
    .gte('course_start_date', '2026-01-01')
    .lte('course_start_date', '2026-01-31')
    .order('created_at', { ascending: false });

  console.log('RECENT ENROLLMENTS FOR JANUARY 2026 (created after Nov 1, 2025):\n');

  const cohorts = {};
  data.forEach(e => {
    const key = e.schedule_pattern + ' ' + (e.class_time || 'NO TIME') + ' - ' + e.course_start_date;
    if (!cohorts[key]) cohorts[key] = [];
    cohorts[key].push(e);
  });

  Object.keys(cohorts).sort().forEach(key => {
    const c = cohorts[key];
    console.log(key + ':', c.length, 'students');
    c.forEach(e => {
      // Get customer name
      console.log('  Enrollment ID:', e.id, '| Student:', e.student_id, '| Created:', e.created_at.substring(0, 10));
    });
    console.log();
  });

  console.log('Total enrollments:', data.length);

  process.exit(0);
})();
