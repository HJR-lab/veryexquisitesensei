require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  // Find Amanda Ang
  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .ilike('first_name', '%amanda%')
    .ilike('last_name', '%ang%');

  if (!customers || customers.length === 0) {
    console.log('Customer not found');
    process.exit(0);
  }

  const customer = customers[0];

  console.log('Customer found:');
  console.log('  Name:', customer.first_name, customer.last_name);
  console.log('  Email:', customer.email);
  console.log('  Shopify Customer ID:', customer.shopify_customer_id);
  console.log('  course_purchase_count:', customer.course_purchase_count);

  // Get all bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      booking_date,
      class_instances (
        id,
        class_date,
        start_time,
        end_time,
        instructor,
        class_type
      )
    `)
    .eq('student_id', customer.id)
    .order('booking_date', { ascending: false });

  console.log('\nTotal bookings:', bookings?.length || 0);

  if (bookings && bookings.length > 0) {
    console.log('\nBookings:');
    bookings.forEach((b, idx) => {
      console.log(`${idx + 1}. ${b.class_instances.class_date} ${b.class_instances.start_time} - ${b.class_instances.instructor} [${b.status}]`);
    });
  } else {
    console.log('\n⚠️  NO BOOKINGS FOUND - Amanda has 3 course purchases but no bookings created!');
    console.log('   Need to check her Shopify orders and create bookings.');
  }

  process.exit(0);
})();
