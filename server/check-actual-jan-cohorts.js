require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('course_variant_title, schedule_pattern, class_time, course_start_date')
    .eq('status', 'active')
    .ilike('course_type', '%wheelthrowing%')
    .gte('course_start_date', '2026-01-01')
    .lte('course_start_date', '2026-01-31');

  // Group by cohort
  const cohorts = {};
  enrollments.forEach(e => {
    const key = e.schedule_pattern + ' ' + (e.class_time || 'NO TIME') + ' - ' + e.course_start_date;
    if (!cohorts[key]) cohorts[key] = { count: 0, variant: e.course_variant_title };
    cohorts[key].count++;
  });

  console.log('ACTUAL ENROLLMENT COHORTS:\n');
  Object.keys(cohorts).sort().forEach(key => {
    const c = cohorts[key];
    console.log(key + ':', c.count, 'students');
    console.log('  Variant:', c.variant);
    console.log();
  });

  process.exit(0);
})();
