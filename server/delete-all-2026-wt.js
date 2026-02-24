require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function deleteAll2026WT() {
  try {
    console.log('\n🗑️  Deleting ALL 2026 WT classes...\n');

    // Find ALL WT classes in 2026
    const { data: allClasses, error } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .gte('class_date', '2026-01-01')
      .lt('class_date', '2027-01-01');

    if (error) {
      console.error('❌ Error querying database:', error);
      return;
    }

    // Filter for WT classes only
    const wtClasses = allClasses.filter(cls =>
      cls.class_type && cls.class_type.startsWith('WT')
    );

    if (wtClasses.length === 0) {
      console.log('✅ No 2026 WT classes found!');
      return;
    }

    console.log(`Found ${wtClasses.length} WT classes in 2026`);

    const classIds = wtClasses.map(c => c.id);

    // Get all bookings
    const { data: bookings, error: bookingError } = await supabaseDb.supabase
      .from('bookings')
      .select('id')
      .in('class_instance_id', classIds);

    if (bookingError) {
      console.error('❌ Error fetching bookings:', bookingError);
      return;
    }

    console.log(`Found ${bookings.length} bookings to delete\n`);

    // Delete all bookings
    if (bookings.length > 0) {
      const bookingIds = bookings.map(b => b.id);
      const { error: deleteBookingsError } = await supabaseDb.supabase
        .from('bookings')
        .delete()
        .in('id', bookingIds);

      if (deleteBookingsError) {
        console.error('❌ Failed to delete bookings:', deleteBookingsError);
        return;
      }
      console.log(`✅ Deleted ${bookings.length} bookings`);
    }

    // Delete all classes
    const { error: deleteError } = await supabaseDb.supabase
      .from('class_instances')
      .delete()
      .in('id', classIds);

    if (deleteError) {
      console.error('❌ Failed to delete classes:', deleteError);
      return;
    }

    console.log(`✅ Deleted ${wtClasses.length} classes`);
    console.log(`\n✅ All 2026 WT classes have been deleted!`);

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

deleteAll2026WT();
