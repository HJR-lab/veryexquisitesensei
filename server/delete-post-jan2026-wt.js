require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function deletePostJan2026WTClasses() {
  try {
    console.log('\n🔍 Finding WT classes after January 2026...\n');

    // Find all WT classes starting from February 2026 onwards
    const { data: futureClasses, error } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .gte('class_date', '2026-02-01')
      .order('class_date', { ascending: true });

    if (error) {
      console.error('❌ Error querying database:', error);
      return;
    }

    // Filter for WT classes only
    const wtClasses = futureClasses.filter(cls =>
      cls.class_type && cls.class_type.startsWith('WT')
    );

    if (wtClasses.length === 0) {
      console.log('✅ No WT classes found after January 2026!');
      return;
    }

    console.log(`Found ${wtClasses.length} WT classes after January 2026:\n`);

    // Group by course
    const courseMap = new Map();
    wtClasses.forEach(cls => {
      const fullIdentifier = cls.class_type;
      const lastDotIndex = fullIdentifier.lastIndexOf('.');
      const baseIdentifier = lastDotIndex > 0 ? fullIdentifier.substring(0, lastDotIndex) : fullIdentifier;

      if (!courseMap.has(baseIdentifier)) {
        courseMap.set(baseIdentifier, []);
      }
      courseMap.get(baseIdentifier).push(cls);
    });

    console.log(`Grouped into ${courseMap.size} courses:\n`);

    courseMap.forEach((classes, courseId) => {
      console.log(`📚 ${courseId} (${classes.length} classes)`);
      classes.forEach(cls => {
        console.log(`   - ${cls.class_date.split('T')[0]} | ${cls.start_time} | ${cls.instructor}`);
      });
    });

    // Get all bookings for these classes
    const classIds = wtClasses.map(c => c.id);
    const { data: bookings, error: bookingError } = await supabaseDb.supabase
      .from('bookings')
      .select('*, customers(first_name, last_name, email)')
      .in('class_instance_id', classIds);

    if (bookingError) {
      console.error('❌ Error fetching bookings:', bookingError);
      return;
    }

    console.log(`\n📊 Total bookings to delete: ${bookings.length}\n`);

    if (bookings.length > 0) {
      // Show affected students
      const uniqueStudents = new Set();
      bookings.forEach(b => {
        if (b.customers) {
          uniqueStudents.add(`${b.customers.first_name} ${b.customers.last_name} (${b.customers.email})`);
        }
      });

      console.log(`👥 Affected students (${uniqueStudents.size}):`);
      uniqueStudents.forEach(student => {
        console.log(`   - ${student}`);
      });
    }

    console.log('\n🗑️  Deleting all WT classes after January 2026...\n');

    let deletedBookings = 0;
    let deletedClasses = 0;

    // First delete all bookings
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
      deletedBookings = bookings.length;
      console.log(`✅ Deleted ${deletedBookings} bookings`);
    }

    // Then delete all classes
    for (const cls of wtClasses) {
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
    console.log(`   Courses removed: ${courseMap.size}`);
    console.log(`   Classes deleted: ${deletedClasses}`);
    console.log(`   Bookings deleted: ${deletedBookings}`);
    console.log(`\n✅ All WT classes after January 2026 have been removed!`);

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

deletePostJan2026WTClasses();
