require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkOverCapacityDetails() {
  try {
    console.log('🔍 Checking details of over-capacity courses...\n');

    // Get the Oct 10 9:30 AM Dillon Lin course (first over-capacity one)
    const { data: classes, error: classError } = await supabase
      .from('class_instances')
      .select('*')
      .eq('class_date', '2025-10-10')
      .eq('start_time', '9:30 AM')
      .eq('instructor', 'Dillon Lin')
      .single();

    if (classError) throw classError;

    console.log(`📅 Checking course: ${classes.class_date} ${classes.start_time} - ${classes.instructor}\n`);

    // Get all bookings for this class
    const { data: bookings, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        student_id,
        created_at,
        customers (
          email,
          first_name,
          last_name,
          shopify_customer_id
        )
      `)
      .eq('class_instance_id', classes.id)
      .order('created_at', { ascending: true });

    if (bookingError) throw bookingError;

    console.log(`👥 Found ${bookings.length} bookings:\n`);

    for (let i = 0; i < bookings.length; i++) {
      const booking = bookings[i];
      console.log(`${i + 1}. ${booking.customers.first_name} ${booking.customers.last_name} (${booking.customers.email})`);
      console.log(`   Booked: ${booking.created_at}`);
      console.log(`   Shopify ID: ${booking.customers.shopify_customer_id}\n`);
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkOverCapacityDetails();
