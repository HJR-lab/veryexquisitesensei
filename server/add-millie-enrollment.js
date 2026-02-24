require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  // Millie Wright - customer ID 1209
  const enrollment = {
    student_id: 1209,
    shopify_order_id: 6470000000000, // placeholder
    shopify_line_item_id: null,
    course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
    course_variant_title: 'FRIDAYS • 23 Jan –27 Feb • 9:30am-12:00pm',
    course_type: 'Wheelthrowing Beginner',
    schedule_pattern: 'FRIDAY',
    number_of_weeks: 6,
    course_start_date: '2026-01-23',
    course_end_date: '2026-02-27',
    class_time: '9:30am - 12:00pm',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  console.log('Creating enrollment for Millie Wright...\n');

  const { data, error } = await supabase
    .from('course_enrollments')
    .insert([enrollment])
    .select();

  if (error) {
    console.log('Error:', error.message);
    process.exit(1);
  }

  console.log('✅ Created enrollment ID:', data[0].id);
  console.log('   Student:', data[0].student_id);
  console.log('   Course:', data[0].course_type);
  console.log('   Start:', data[0].course_start_date);
  console.log('   Schedule:', data[0].schedule_pattern, data[0].class_time);

  process.exit(0);
})();
