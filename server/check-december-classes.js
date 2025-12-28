require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkDecember() {
  console.log('\n📅 DECEMBER 2025 CLASSES CHECK\n');

  // Get December 2025 classes
  const { data: decClasses } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2025-12-01')
    .lte('class_date', '2025-12-31')
    .order('class_date');

  console.log(`December 2025 classes: ${decClasses?.length || 0}\n`);
  
  if (decClasses && decClasses.length > 0) {
    console.log('December 2025 classes:');
    decClasses.forEach(c => {
      console.log(`   ${c.class_date} ${c.day_of_week} ${c.start_time} - ${c.class_type}`);
    });
  }

  // Get December 2025 enrollments
  const { data: decEnrollments } = await supabase
    .from('course_enrollments')
    .select('id, course_start_date, course_type, schedule_pattern, class_time, shopify_order_id')
    .gte('course_start_date', '2025-12-01')
    .lte('course_start_date', '2025-12-31')
    .order('course_start_date');

  console.log(`\nDecember 2025 enrollments: ${decEnrollments?.length || 0}\n`);
  
  if (decEnrollments && decEnrollments.length > 0) {
    console.log('December 2025 enrollments:');
    decEnrollments.forEach(e => {
      console.log(`   ${e.course_start_date} - ${e.course_type} - Order: ${e.shopify_order_id}`);
    });
  }

  // Check for any 2024 data
  const { data: data2024 } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2024-01-01')
    .lt('class_date', '2025-01-01');

  console.log(`\n2024 classes: ${data2024?.length || 0}`);

  const { data: enrollments2024 } = await supabase
    .from('course_enrollments')
    .select('id')
    .gte('course_start_date', '2024-01-01')
    .lt('course_start_date', '2025-01-01');

  console.log(`2024 enrollments: ${enrollments2024?.length || 0}\n`);

  process.exit(0);
}

checkDecember().catch(console.error);
