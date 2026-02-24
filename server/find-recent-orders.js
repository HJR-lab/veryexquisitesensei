require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://fpdbfbxpthmaceuspcrf.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function findRecentOrders() {
  console.log('Looking for recent orders (last 7 days)...\n');

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Get all enrollments created in the last 7 days
  const { data: enrollments, error } = await supabase
    .from('course_enrollments')
    .select(`
      id,
      student_id,
      shopify_order_id,
      shopify_line_item_id,
      course_title,
      course_type,
      status,
      course_start_date,
      schedule_pattern,
      class_time,
      created_at,
      student:customers!course_enrollments_student_id_fkey (
        id,
        first_name,
        last_name,
        email
      )
    `)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${enrollments?.length || 0} enrollments created in the last 7 days:\n`);

  if (enrollments && enrollments.length > 0) {
    enrollments.forEach(e => {
      console.log(`Order ID: ${e.shopify_order_id}`);
      console.log(`  Student: ${e.student.first_name} ${e.student.last_name} (${e.student.email})`);
      console.log(`  Course: ${e.course_title}`);
      console.log(`  Status: ${e.status}`);
      console.log(`  Start Date: ${e.course_start_date}`);
      console.log(`  Schedule: ${e.schedule_pattern} ${e.class_time}`);
      console.log(`  Created: ${e.created_at}`);
      console.log('');
    });
  } else {
    console.log('No recent enrollments found.');
  }

  // Now let's check for orders with name "Jessie" or "Sabrina"
  console.log('\n--- Looking for Jessie and Sabrina ---\n');

  const { data: jessieOrders, error: jessieError } = await supabase
    .from('course_enrollments')
    .select(`
      id,
      shopify_order_id,
      course_title,
      status,
      created_at,
      student:customers!course_enrollments_student_id_fkey (
        first_name,
        last_name,
        email
      )
    `)
    .or('student.first_name.ilike.%jessie%,student.first_name.ilike.%sabrina%')
    .order('created_at', { ascending: false })
    .limit(10);

  if (jessieOrders && jessieOrders.length > 0) {
    jessieOrders.forEach(e => {
      console.log(`${e.student.first_name} ${e.student.last_name} (${e.student.email})`);
      console.log(`  Order: ${e.shopify_order_id}`);
      console.log(`  Course: ${e.course_title}`);
      console.log(`  Status: ${e.status}`);
      console.log(`  Created: ${e.created_at}`);
      console.log('');
    });
  }
}

findRecentOrders()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
