require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  const enrollments = [
    {
      student_id: 1225, // Edith Lee
      shopify_order_id: 6470000002438,
      course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
      course_variant_title: 'SATURDAYS • 17 Jan –21 Feb • 9:30am-12:00pm',
      course_type: 'Wheelthrowing Beginner',
      schedule_pattern: 'SATURDAY',
      number_of_weeks: 6,
      course_start_date: '2026-01-17',
      course_end_date: '2026-02-21',
      class_time: '9:30am - 12:00pm',
      status: 'active',
      created_at: '2025-12-30T00:00:00Z',
      updated_at: new Date().toISOString()
    },
    {
      student_id: 1762, // Inge Bukit
      shopify_order_id: 6470000002437,
      course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
      course_variant_title: 'SATURDAYS • 17 Jan –21 Feb • 9:30am-12:00pm',
      course_type: 'Wheelthrowing Beginner',
      schedule_pattern: 'SATURDAY',
      number_of_weeks: 6,
      course_start_date: '2026-01-17',
      course_end_date: '2026-02-21',
      class_time: '9:30am - 12:00pm',
      status: 'active',
      created_at: '2025-12-30T00:00:00Z',
      updated_at: new Date().toISOString()
    }
  ];

  console.log('Creating enrollments for Edith and Inge...\n');

  const { data, error } = await supabase
    .from('course_enrollments')
    .insert(enrollments)
    .select();

  if (error) {
    console.log('Error:', error.message);
    process.exit(1);
  }

  console.log('✅ Created enrollments:');
  data.forEach(e => {
    console.log('  ID:', e.id, '| Student:', e.student_id);
  });

  process.exit(0);
})();
