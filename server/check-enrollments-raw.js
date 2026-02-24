require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkRawEnrollments() {
  const thaliaId = 2320;
  const huitingId = 1137;

  // Get their enrollments with exact values
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .in('student_id', [thaliaId, huitingId]);

  console.log('=== RAW ENROLLMENT DATA ===\n');
  enrollments?.forEach(e => {
    console.log(`Enrollment ${e.id}:`);
    console.log(`  student_id: ${e.student_id}`);
    console.log(`  course_type: "${e.course_type}"`);
    console.log(`  schedule_pattern: "${e.schedule_pattern}"`);
    console.log(`  course_start_date: ${e.course_start_date}`);
    console.log(`  start_time: ${e.start_time}`);
    console.log(`  status: ${e.status}`);
    console.log(`  bookings_created_at: ${e.bookings_created_at}`);
    console.log('');
  });

  // Now check what's in the orders table for these students
  console.log('\n=== CHECKING SHOPIFY ORDERS ===\n');
  const { data: orders } = await supabase
    .from('shopify_orders')
    .select('*')
    .in('customer_id', [thaliaId, huitingId])
    .order('order_date', { ascending: false });

  if (orders?.length > 0) {
    orders.forEach(order => {
      console.log(`Order ${order.shopify_order_id}:`);
      console.log(`  Customer ID: ${order.customer_id}`);
      console.log(`  Order Date: ${order.order_date}`);
      console.log(`  Product: ${order.product_title}`);
      console.log(`  Variant: ${order.variant_title}`);
      console.log('');
    });
  } else {
    console.log('No Shopify orders found for these students');
  }
}

checkRawEnrollments().then(() => process.exit());
