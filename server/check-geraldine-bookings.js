require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkGeraldineBookings() {
  try {
    // Get Geraldine
    const { data: geraldine } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'gbr@uwcsea.edu.sg')
      .single();

    console.log(`Geraldine Brogden (ID: ${geraldine.id})\n`);

    // Get all bookings with details
    const { data: bookings, error } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          id,
          class_type,
          class_date
        )
      `)
      .eq('student_id', geraldine.id)
      .in('status', ['booked', 'completed', 'attended']);

    if (error) {
      console.error('Error fetching bookings:', error);
      return;
    }

    if (!bookings || bookings.length === 0) {
      console.log('No bookings found\n');
      return;
    }

    // Sort by date
    bookings.sort((a, b) => {
      if (!a.class_instances || !b.class_instances) return 0;
      return a.class_instances.class_date.localeCompare(b.class_instances.class_date);
    });

    console.log(`Total bookings: ${bookings.length}\n`);

    bookings.forEach(b => {
      if (b.class_instances) {
        console.log(`Booking ID: ${b.id}`);
        console.log(`  Class: ${b.class_instances.class_type}`);
        console.log(`  Date: ${b.class_instances.class_date}`);
        console.log(`  Status: ${b.status}`);
        console.log(`  Type: ${b.booking_type}`);
        console.log('');
      }
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkGeraldineBookings();
