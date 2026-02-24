require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function deleteInvalidJan2026Courses() {
  try {
    console.log('\n🗑️  Deleting invalid weekend 7pm courses from January 2026...\n');

    // Find all WT classes that start with these invalid course identifiers
    const invalidCourses = ['WT1701NT_JL6', 'WT1801NT_JL6'];

    for (const courseId of invalidCourses) {
      // Find all classes in this course
      const { data: classes, error: findError } = await supabaseDb.supabase
        .from('class_instances')
        .select('*')
        .like('class_type', `${courseId}.%`);

      if (findError) {
        console.error(`❌ Error finding ${courseId}:`, findError);
        continue;
      }

      if (classes.length === 0) {
        console.log(`⏭️  ${courseId} - no classes found (already deleted)`);
        continue;
      }

      console.log(`\n📚 ${courseId} - ${classes.length} classes`);

      // Get bookings for these classes
      const classIds = classes.map(c => c.id);
      const { data: bookings, error: bookingError } = await supabaseDb.supabase
        .from('bookings')
        .select('*, customers(first_name, last_name)')
        .in('class_instance_id', classIds);

      if (bookingError) {
        console.error(`❌ Error fetching bookings:`, bookingError);
        continue;
      }

      console.log(`   Bookings: ${bookings.length}`);

      if (bookings.length > 0) {
        bookings.forEach(b => {
          console.log(`   - ${b.customers?.first_name} ${b.customers?.last_name}`);
        });

        // Delete bookings
        const bookingIds = bookings.map(b => b.id);
        const { error: deleteBookingsError } = await supabaseDb.supabase
          .from('bookings')
          .delete()
          .in('id', bookingIds);

        if (deleteBookingsError) {
          console.error(`❌ Failed to delete bookings:`, deleteBookingsError);
          continue;
        }
        console.log(`   ✅ Deleted ${bookings.length} bookings`);
      }

      // Delete classes
      const { error: deleteError } = await supabaseDb.supabase
        .from('class_instances')
        .delete()
        .in('id', classIds);

      if (deleteError) {
        console.error(`❌ Failed to delete classes:`, deleteError);
      } else {
        console.log(`   ✅ Deleted ${classes.length} classes`);
      }
    }

    console.log(`\n✅ Done! You now have 6 valid WT courses in January 2026.`);

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

deleteInvalidJan2026Courses();
