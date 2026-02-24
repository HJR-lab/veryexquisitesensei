require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function cancelFeb4Booking() {
  try {
    const studentId = 2234;
    const feb4ClassId = 10290; // HB_040226_LT

    console.log('Cancelling Feb 4 handbuilding class to free up credit...\n');

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
    console.log(`  Status changed from 'booked' to 'cancelled'`);
    console.log(`  Credit is now available for rebooking\n`);

    console.log('✅ Successfully converted Feb 4 booking back to credit!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

cancelFeb4Booking();
