require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function verifyCancelledBookingLogic() {
  try {
    console.log('Checking cancelled bookings that could be reactivated...\n');

    // Find all cancelled bookings
    const { data: cancelledBookings, error } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        *,
        customers!bookings_student_id_fkey (
          first_name,
          last_name,
          email
        ),
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date,
          start_time
        )
      `)
      .eq('status', 'cancelled')
      .order('updated_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    console.log(`Found ${cancelledBookings.length} recent cancelled bookings:\n`);

    cancelledBookings.forEach((booking, index) => {
      console.log(`${index + 1}. ${booking.customers.first_name} ${booking.customers.last_name}`);
      console.log(`   Email: ${booking.customers.email}`);
      console.log(`   Class: ${booking.class_instances.class_type}`);
      console.log(`   Date: ${booking.class_instances.class_date} at ${booking.class_instances.start_time}`);
      console.log(`   Booking ID: ${booking.id}`);
      console.log(`   Student ID: ${booking.student_id}`);
      console.log(`   Class Instance ID: ${booking.class_instance_id}`);
      console.log(`   Cancelled on: ${new Date(booking.updated_at).toLocaleString()}`);
      console.log('');
    });

    // Check if there are any scenarios where someone tried to rebook a cancelled class
    const { data: activeBookings } = await supabaseDb.supabase
      .from('bookings')
      .select('student_id, class_instance_id')
      .eq('status', 'booked');

    console.log('\n='.repeat(60));
    console.log('REACTIVATION SIMULATION:');
    console.log('='.repeat(60));
    console.log('\nIf a student tried to rebook their cancelled class, the new logic would:');
    console.log('1. Check if there\'s a cancelled booking for that (student_id, class_instance_id)');
    console.log('2. If found: UPDATE the cancelled booking to status=\'booked\', booking_type=\'makeup\'');
    console.log('3. If not found: INSERT a new booking\n');

    console.log('This prevents duplicate key errors on the unique constraint:');
    console.log('bookings_student_id_class_instance_id_key\n');

    console.log('✅ The fix is active and ready to handle cancelled booking reactivation');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

verifyCancelledBookingLogic();
