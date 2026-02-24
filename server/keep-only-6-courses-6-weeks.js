require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function keepOnly6CoursesOf6Weeks() {
  try {
    console.log('\n🔍 Finding all WT courses in 2026...\n');

    // Find ALL WT classes in 2026
    const { data: allClasses, error } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .gte('class_date', '2026-01-01')
      .lt('class_date', '2027-01-01')
      .order('class_date', { ascending: true });

    if (error) {
      console.error('❌ Error querying database:', error);
      return;
    }

    // Filter for WT classes only
    const wtClasses = allClasses.filter(cls =>
      cls.class_type && cls.class_type.startsWith('WT')
    );

    // Group by course (base identifier)
    const courseMap = new Map();
    wtClasses.forEach(cls => {
      const fullIdentifier = cls.class_type;
      const lastDotIndex = fullIdentifier.lastIndexOf('.');
      const baseIdentifier = lastDotIndex > 0 ? fullIdentifier.substring(0, lastDotIndex) : fullIdentifier;

      if (!courseMap.has(baseIdentifier)) {
        courseMap.set(baseIdentifier, {
          classes: [],
          instructor: cls.instructor,
          startTime: cls.start_time,
          firstDate: cls.class_date
        });
      }
      courseMap.get(baseIdentifier).classes.push(cls);
    });

    // Filter for courses with exactly 6 classes
    const sixWeekCourses = Array.from(courseMap.entries())
      .filter(([_, data]) => data.classes.length === 6)
      .sort((a, b) => new Date(a[1].firstDate) - new Date(b[1].firstDate));

    console.log(`📊 Found ${courseMap.size} total WT courses`);
    console.log(`📊 Found ${sixWeekCourses.length} courses with exactly 6 weeks\n`);

    if (sixWeekCourses.length === 0) {
      console.log('❌ No 6-week courses found!');
      return;
    }

    // Show the 6-week courses
    sixWeekCourses.forEach(([courseId, data], index) => {
      const firstClass = data.classes[0];
      const firstDate = new Date(firstClass.class_date);
      const dayName = firstDate.toLocaleDateString('en-US', { weekday: 'short' });

      console.log(`${index + 1}. ${courseId}`);
      console.log(`   Instructor: ${data.instructor}`);
      console.log(`   Day/Time: ${dayName} ${data.startTime}`);
      console.log(`   First class: ${firstClass.class_date.split('T')[0]}`);
      console.log(`   Classes: ${data.classes.length}`);
      console.log('');
    });

    // Keep only the first 6 courses with 6 weeks
    const coursesToKeep = sixWeekCourses.slice(0, 6);
    const coursesToDelete = sixWeekCourses.slice(6);

    console.log(`\n✅ Keeping ${coursesToKeep.length} courses (first 6 with 6 weeks each)`);
    console.log(`🗑️  Will delete ${coursesToDelete.length} extra 6-week courses\n`);

    // Also delete all courses that don't have exactly 6 weeks
    const nonSixWeekCourses = Array.from(courseMap.entries())
      .filter(([_, data]) => data.classes.length !== 6);

    console.log(`🗑️  Will also delete ${nonSixWeekCourses.length} courses that don't have 6 weeks\n`);

    // Combine courses to delete
    const allCoursesToDelete = [...coursesToDelete, ...nonSixWeekCourses];

    if (allCoursesToDelete.length === 0) {
      console.log('✅ Nothing to delete - you already have exactly 6 courses of 6 weeks!');
      return;
    }

    console.log(`🗑️  Deleting ${allCoursesToDelete.length} courses...\n`);

    let totalBookingsDeleted = 0;
    let totalClassesDeleted = 0;

    for (const [courseId, data] of allCoursesToDelete) {
      console.log(`Deleting ${courseId} (${data.classes.length} classes)...`);

      const classIds = data.classes.map(c => c.id);

      // Get bookings
      const { data: bookings, error: bookingError } = await supabaseDb.supabase
        .from('bookings')
        .select('id')
        .in('class_instance_id', classIds);

      if (bookingError) {
        console.error(`  ❌ Error fetching bookings:`, bookingError);
        continue;
      }

      // Delete bookings if any
      if (bookings && bookings.length > 0) {
        const bookingIds = bookings.map(b => b.id);
        const { error: deleteBookingsError } = await supabaseDb.supabase
          .from('bookings')
          .delete()
          .in('id', bookingIds);

        if (deleteBookingsError) {
          console.error(`  ❌ Failed to delete bookings:`, deleteBookingsError);
          continue;
        }
        totalBookingsDeleted += bookings.length;
        console.log(`  ✅ Deleted ${bookings.length} bookings`);
      }

      // Delete classes
      const { error: deleteError } = await supabaseDb.supabase
        .from('class_instances')
        .delete()
        .in('id', classIds);

      if (deleteError) {
        console.error(`  ❌ Failed to delete classes:`, deleteError);
      } else {
        totalClassesDeleted += data.classes.length;
        console.log(`  ✅ Deleted ${data.classes.length} classes`);
      }
    }

    console.log(`\n📊 Final Summary:`);
    console.log(`   Courses kept: ${coursesToKeep.length}`);
    console.log(`   Courses deleted: ${allCoursesToDelete.length}`);
    console.log(`   Classes deleted: ${totalClassesDeleted}`);
    console.log(`   Bookings deleted: ${totalBookingsDeleted}`);
    console.log(`\n✅ Done! You now have exactly 6 WT courses, each with 6 weeks.`);

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

keepOnly6CoursesOf6Weeks();
