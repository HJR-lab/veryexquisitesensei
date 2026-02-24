require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function forceDeleteWeekend7pmClasses() {
  try {
    console.log('\n🔍 Finding remaining weekend 7pm classes...\n');

    // Find all classes on weekends with 7pm start time
    const { data: weekendEveningClasses, error } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .or('start_time.eq.7:00 PM,start_time.eq.7:00pm,start_time.eq.19:00:00')
      .order('class_date', { ascending: true });

    if (error) {
      console.error('❌ Error querying database:', error);
      return;
    }

    // Filter for weekends only
    const weekendClasses = weekendEveningClasses.filter(cls => {
      const date = new Date(cls.class_date);
      const dayOfWeek = date.getDay();
      return dayOfWeek === 0 || dayOfWeek === 6;
    });

    if (weekendClasses.length === 0) {
      console.log('✅ No weekend 7pm classes found!');
      return;
    }

    console.log(`Found ${weekendClasses.length} weekend 7pm classes:\n`);

    // Get all bookings for these classes
    const classIds = weekendClasses.map(c => c.id);
    const { data: bookings, error: bookingError } = await supabaseDb.supabase
      .from('bookings')
      .select('*, customers(first_name, last_name, email)')
      .in('class_instance_id', classIds);

    if (bookingError) {
      console.error('❌ Error fetching bookings:', bookingError);
      return;
    }

    // Display classes and their bookings
    for (const cls of weekendClasses) {
      const date = new Date(cls.class_date);
      const dayName = date.getDay() === 0 ? 'Sunday' : 'Saturday';
      const classBookings = bookings.filter(b => b.class_instance_id === cls.id);

      console.log(`${dayName} ${cls.class_date.split('T')[0]} | ${cls.class_type} | Bookings: ${classBookings.length}`);

      if (classBookings.length > 0) {
        classBookings.forEach(b => {
          console.log(`   - ${b.customers?.first_name} ${b.customers?.last_name} (${b.customers?.email}) | Status: ${b.status} | Booking ID: ${b.id}`);
        });
      }
    }

    console.log('\n🗑️  Deleting all weekend 7pm classes (including bookings)...\n');

    let deletedBookings = 0;
    let deletedClasses = 0;

    // First delete all bookings
    for (const cls of weekendClasses) {
      const classBookings = bookings.filter(b => b.class_instance_id === cls.id);

      if (classBookings.length > 0) {
        const bookingIds = classBookings.map(b => b.id);
        const { error: deleteBookingsError } = await supabaseDb.supabase
          .from('bookings')
          .delete()
          .in('id', bookingIds);

        if (deleteBookingsError) {
          console.error(`❌ Failed to delete bookings for ${cls.class_type}:`, deleteBookingsError);
        } else {
          deletedBookings += classBookings.length;
          console.log(`✅ Deleted ${classBookings.length} booking(s) from ${cls.class_type} (${cls.class_date.split('T')[0]})`);
        }
      }
    }

    // Then delete all classes
    for (const cls of weekendClasses) {
      const { error: deleteError } = await supabaseDb.supabase
        .from('class_instances')
        .delete()
        .eq('id', cls.id);

      if (deleteError) {
        console.error(`❌ Failed to delete ${cls.class_type}:`, deleteError);
      } else {
        deletedClasses++;
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Bookings deleted: ${deletedBookings}`);
    console.log(`   Classes deleted: ${deletedClasses}`);
    console.log(`\n✅ All weekend 7pm classes have been removed!`);

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

forceDeleteWeekend7pmClasses();
