require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function debugKarynActiveStatus() {
  try {
    const karynId = 1116;
    const today = new Date().toISOString().split('T')[0];

    console.log('Checking why Karyn Chan is not in Active Students...\n');
    console.log(`Today's date: ${today}\n`);

    // Check if Karyn has future bookings
    const { data: allBookings } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date,
          start_time
        )
      `)
      .eq('student_id', karynId)
      .in('status', ['booked', 'completed', 'attended']);

    const futureBookings = allBookings.filter(b =>
      b.class_instances && b.class_instances.class_date >= today
    );

    console.log(`Karyn's bookings >= today (${futureBookings.length}):`);
    futureBookings.forEach(b => {
      if (b.class_instances) {
        console.log(`  ${b.class_instances.class_type} - ${b.class_instances.class_date} (${b.status})`);
      }
    });

    // Check customer data
    const { data: customer } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('id', karynId)
      .single();

    console.log(`\nCustomer data:`);
    console.log(`  Name: ${customer.first_name} ${customer.last_name}`);
    console.log(`  Email: ${customer.email}`);
    console.log(`  Customer Type: ${customer.customer_type}`);
    console.log(`  Course Purchase Count: ${customer.course_purchase_count}`);
    console.log(`  Classes Allocated: ${customer.classes_allocated}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

debugKarynActiveStatus();
