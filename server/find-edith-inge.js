require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  // Find Edith
  const { data: edith } = await supabase
    .from('customers')
    .select('*')
    .ilike('first_name', '%edith%');

  console.log('EDITH:');
  if (edith && edith.length > 0) {
    edith.forEach(c => {
      console.log('  ID:', c.id, '|', c.first_name, c.last_name, '|', c.email);
    });
  } else {
    console.log('  Not found');
  }

  console.log('\nINGE:');
  // Find Inge
  const { data: inge } = await supabase
    .from('customers')
    .select('*')
    .ilike('first_name', '%inge%');

  if (inge && inge.length > 0) {
    inge.forEach(c => {
      console.log('  ID:', c.id, '|', c.first_name, c.last_name, '|', c.email);
    });
  } else {
    console.log('  Not found');
  }

  // Check their enrollments
  if (edith && edith.length > 0) {
    console.log('\nEDITH ENROLLMENTS:');
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', edith[0].id)
      .gte('course_start_date', '2026-01-01')
      .lte('course_start_date', '2026-01-31');

    if (enrollments && enrollments.length > 0) {
      enrollments.forEach(e => {
        console.log('  ', e.schedule_pattern, e.class_time, '-', e.course_start_date);
      });
    }
  }

  if (inge && inge.length > 0) {
    console.log('\nINGE ENROLLMENTS:');
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', inge[0].id)
      .gte('course_start_date', '2026-01-01')
      .lte('course_start_date', '2026-01-31');

    if (enrollments && enrollments.length > 0) {
      enrollments.forEach(e => {
        console.log('  ', e.schedule_pattern, e.class_time, '-', e.course_start_date);
      });
    }
  }

  process.exit(0);
})();
