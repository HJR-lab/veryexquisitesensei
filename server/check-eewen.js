require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkEewen() {
  console.log('\n🔍 CHECKING EEWEN CHEW\n');

  // Find customer
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .ilike('email', '%eewen%')
    .single();

  if (!customer) {
    console.log('Customer not found');
    process.exit(0);
  }

  console.log(`Customer: ${customer.first_name} ${customer.last_name} (${customer.email})`);

  // Get all enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', customer.id);

  console.log(`\nTotal enrollments: ${enrollments?.length || 0}\n`);

  if (enrollments) {
    enrollments.forEach((e, i) => {
      console.log(`Enrollment ${i + 1}:`);
      console.log(`   Course: ${e.course_type}`);
      console.log(`   Schedule: ${e.schedule_pattern}s ${e.class_time}`);
      console.log(`   Start Date: ${e.course_start_date}`);
      console.log(`   Shopify Order: ${e.shopify_order_id}`);
      console.log(`   Shopify Line Item: ${e.shopify_line_item_id}`);
      console.log(`   Has Bookings: ${e.bookings_created_at ? 'Yes' : 'No'}\n`);
    });
  }

  // Get bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select('*, class_instance:class_instances(*)')
    .eq('student_id', customer.id);

  console.log(`Total bookings: ${bookings?.length || 0}\n`);

  process.exit(0);
}

checkEewen().catch(console.error);
