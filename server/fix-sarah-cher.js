require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function fixSarahCher() {
  try {
    console.log('\n🔧 Fixing Sarah Cher enrollment...\n');

    const { data: sarah } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'sarahcherwh1011@gmail.com')
      .single();

    if (!sarah) {
      console.log('❌ Sarah Cher not found');
      return;
    }

    console.log(`✅ Found Sarah Cher (ID: ${sarah.id})`);

    const { data: allBookings, error: bookError } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        id,
        student_id,
        class_instance_id,
        status,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date,
          start_time
        )
      `)
      .eq('student_id', sarah.id);

    if (bookError) {
      console.error('Error fetching bookings:', bookError);
      return;
    }

    if (!allBookings || allBookings.length === 0) {
      console.log('No bookings found');
      return;
    }

    console.log(`Found ${allBookings.length} total bookings`);

    const jan2026Bookings = allBookings.filter(b => {
      const classDate = b.class_instances?.class_date;
      return classDate >= '2026-01-17' && classDate <= '2026-03-03';
    });

    console.log(`Found ${jan2026Bookings.length} Jan 2026 bookings`);

    const sundayBookings = jan2026Bookings.filter(b => 
      b.class_instances?.class_type?.startsWith('WT1801AM_DL6')
    );

    console.log(`Found ${sundayBookings.length} Sunday 9:30am bookings (WT1801AM_DL6)`);

    const bookingsToDelete = jan2026Bookings.filter(b => 
      !b.class_instances?.class_type?.startsWith('WT1801AM_DL6')
    );

    console.log(`\nDeleting ${bookingsToDelete.length} incorrect bookings...`);

    for (const booking of bookingsToDelete) {
      const { error } = await supabaseDb.supabase
        .from('bookings')
        .delete()
        .eq('id', booking.id);

      if (error) {
        console.error(`❌ Error deleting booking ${booking.id}:`, error);
      } else {
        console.log(`  ✅ Deleted ${booking.class_instances?.class_type} on ${booking.class_instances?.class_date}`);
      }
    }

    const { error: updateError } = await supabaseDb.supabase
      .from('customers')
      .update({
        course_purchase_count: 3,
        classes_used: sundayBookings.length,
        updated_at: new Date().toISOString()
      })
      .eq('id', sarah.id);

    if (updateError) {
      console.error('❌ Error updating Sarah:', updateError);
    } else {
      console.log(`\n✅ Updated course_purchase_count to 3`);
      console.log(`✅ Updated classes_used to ${sundayBookings.length}`);
    }

    console.log('\n🎉 Sarah Cher is now correctly enrolled!');
    console.log(`   Course: WT1801AM_DL6 (Sunday 9:30am-12:00pm)`);
    console.log(`   Classes: ${sundayBookings.length}/6 weeks`);
    console.log(`   Purchase count: 3 (3rd time)\n`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixSarahCher();
