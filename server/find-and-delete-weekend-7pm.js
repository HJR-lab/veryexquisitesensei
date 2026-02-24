require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function findAndDeleteWeekend7pmClasses() {
  try {
    console.log('\n🔍 Searching for weekend 7pm classes...\n');

    // Find all classes on weekends (Saturday=6, Sunday=0 in PostgreSQL) with 7pm start time
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
      const dayOfWeek = date.getDay(); // 0=Sunday, 6=Saturday
      return dayOfWeek === 0 || dayOfWeek === 6;
    });

    console.log(`Found ${weekendClasses.length} weekend 7pm classes:\n`);

    if (weekendClasses.length === 0) {
      console.log('✅ No weekend 7pm classes found. Database is clean!');
      return;
    }

    // Display found classes
    weekendClasses.forEach((cls, index) => {
      const date = new Date(cls.class_date);
      const dayName = date.getDay() === 0 ? 'Sunday' : 'Saturday';
      console.log(`${index + 1}. ${dayName} ${cls.class_date.split('T')[0]} | ${cls.start_time} | ${cls.class_type} | Instructor: ${cls.instructor} | ID: ${cls.id}`);
    });

    console.log('\n⚠️  These classes violate the schedule rules:');
    console.log('- Joyce Lim: Only weekdays (Tue, Thu, Fri) at 7pm');
    console.log('- Dillon Lin: Weekends only but NO 7pm classes (only 9:30am & 1pm)');
    console.log('\n🗑️  Attempting to delete these classes...\n');

    // Check if any have bookings
    const classIds = weekendClasses.map(c => c.id);
    const { data: bookings, error: bookingError } = await supabaseDb.supabase
      .from('bookings')
      .select('class_instance_id, student_id')
      .in('class_instance_id', classIds)
      .in('status', ['booked', 'completed']);

    if (bookingError) {
      console.error('❌ Error checking bookings:', bookingError);
      return;
    }

    // Group bookings by class
    const bookingsByClass = {};
    bookings.forEach(b => {
      if (!bookingsByClass[b.class_instance_id]) {
        bookingsByClass[b.class_instance_id] = [];
      }
      bookingsByClass[b.class_instance_id].push(b);
    });

    // Delete classes without bookings
    let deletedCount = 0;
    let skippedCount = 0;

    for (const cls of weekendClasses) {
      const hasBookings = bookingsByClass[cls.id] && bookingsByClass[cls.id].length > 0;

      if (hasBookings) {
        console.log(`⏭️  Skipping ${cls.class_type} (${cls.class_date.split('T')[0]}) - has ${bookingsByClass[cls.id].length} booking(s)`);
        skippedCount++;
      } else {
        const { error: deleteError } = await supabaseDb.supabase
          .from('class_instances')
          .delete()
          .eq('id', cls.id);

        if (deleteError) {
          console.error(`❌ Failed to delete ${cls.class_type}:`, deleteError);
        } else {
          console.log(`✅ Deleted ${cls.class_type} (${cls.class_date.split('T')[0]})`);
          deletedCount++;
        }
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total found: ${weekendClasses.length}`);
    console.log(`   Deleted: ${deletedCount}`);
    console.log(`   Skipped (has bookings): ${skippedCount}`);

    if (skippedCount > 0) {
      console.log(`\n⚠️  ${skippedCount} class(es) have bookings and need manual review.`);
      console.log('   You may need to reschedule students before deleting these classes.');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

findAndDeleteWeekend7pmClasses();
