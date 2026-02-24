require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function cancelFeb4AndRebookMar3() {
  try {
    const studentId = 2234;
    const feb4ClassId = 10290; // HB_040226_LT
    const mar3ClassId = 13317; // WT2001NT_JL6.6 (glazing)

    console.log('Step 1: Cancelling Feb 4 handbuilding class...\n');

    // Cancel Feb 4 booking
    const { data: feb4Booking, error: feb4Error } = await supabaseDb.supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('student_id', studentId)
      .eq('class_instance_id', feb4ClassId)
      .eq('status', 'booked')
      .select()
      .single();

    if (feb4Error) throw feb4Error;

    console.log('✓ Cancelled Feb 4 handbuilding class (HB_040226_LT)');
    console.log(`  Booking ID: ${feb4Booking.id}`);
    console.log(`  Status changed from 'booked' to 'cancelled'\n`);

    console.log('Step 2: Reactivating March 3 glazing class...\n');

    // Reactivate March 3 booking
    const { data: mar3Booking, error: mar3Error } = await supabaseDb.supabase
      .from('bookings')
      .update({
        status: 'booked',
        booking_type: 'regular', // Keep it as regular since it's their cohort's glazing class
        updated_at: new Date().toISOString()
      })
      .eq('student_id', studentId)
      .eq('class_instance_id', mar3ClassId)
      .eq('status', 'cancelled')
      .select()
      .single();

    if (mar3Error) throw mar3Error;

    console.log('✓ Reactivated March 3 glazing class (WT2001NT_JL6.6)');
    console.log(`  Booking ID: ${mar3Booking.id}`);
    console.log(`  Status changed from 'cancelled' to 'booked'\n`);

    console.log('='.repeat(60));
    console.log('VERIFICATION:');
    console.log('='.repeat(60));

    // Verify the changes
    const { data: verifyBookings } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date,
          start_time
        )
      `)
      .eq('student_id', studentId)
      .in('class_instance_id', [feb4ClassId, mar3ClassId]);

    console.log('\nUpdated bookings:');
    verifyBookings.forEach(b => {
      console.log(`\n${b.class_instances.class_type}`);
      console.log(`  Date: ${new Date(b.class_instances.class_date).toLocaleDateString()}`);
      console.log(`  Time: ${b.class_instances.start_time}`);
      console.log(`  Status: ${b.status}`);
      console.log(`  Booking Type: ${b.booking_type || 'regular'}`);
    });

    console.log('\n✅ Successfully cancelled Feb 4 and rebooked March 3!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

cancelFeb4AndRebookMar3();
