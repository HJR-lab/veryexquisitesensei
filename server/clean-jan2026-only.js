require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function cleanJan2026Only() {
  try {
    console.log('\n🧹 Cleaning up to keep ONLY 6 January 2026 courses from Nov 17+ orders...\n');

    // Step 1: Delete ALL 2026 WT classes
    console.log('Step 1: Deleting all 2026 WT classes...');
    const { data: allClasses } = await supabaseDb.supabase
      .from('class_instances')
      .select('id')
      .gte('class_date', '2026-01-01')
      .lt('class_date', '2027-01-01')
      .ilike('class_type', 'WT%');

    if (allClasses && allClasses.length > 0) {
      const classIds = allClasses.map(c => c.id);

      // Delete bookings
      await supabaseDb.supabase
        .from('bookings')
        .delete()
        .in('class_instance_id', classIds);

      // Delete classes
      await supabaseDb.supabase
        .from('class_instances')
        .delete()
        .in('id', classIds);

      console.log(`✅ Deleted ${allClasses.length} classes and their bookings`);
    }

    // Step 2: Delete all enrollments NOT from the 6 January 2026 courses
    console.log('\nStep 2: Cleaning enrollments...');

    // The 6 valid January 2026 cohorts from Nov 17+ orders:
    const validCohorts = [
      { day: 'SATURDAY', time: '9:30am - 12:00pm', start: '2026-01-17' },
      { day: 'SATURDAY', time: '1:00pm - 3:30pm', start: '2026-01-17' },
      { day: 'SUNDAY', time: '9:30am - 12:00pm', start: '2026-01-18' },
      { day: 'TUESDAY', time: '7:00pm - 9:30pm', start: '2026-01-20' },
      { day: 'THURSDAY', time: '7:00pm - 9:30pm', start: '2026-01-22' },
      { day: 'FRIDAY', time: '9:30am - 12:00pm', start: '2026-01-23' }
    ];

    // Delete all 2026 enrollments that don't match these 6 cohorts
    const { data: allEnrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*')
      .ilike('course_type', '%wheelthrowing%')
      .gte('course_start_date', '2026-01-01');

    let deletedCount = 0;
    let keptCount = 0;

    for (const enrollment of allEnrollments) {
      const isValid = validCohorts.some(cohort =>
        enrollment.schedule_pattern === cohort.day &&
        enrollment.class_time === cohort.time &&
        enrollment.course_start_date === cohort.start
      );

      if (!isValid) {
        await supabaseDb.supabase
          .from('course_enrollments')
          .delete()
          .eq('id', enrollment.id);
        deletedCount++;
      } else {
        // Reset bookings_created_at so they can be processed fresh
        await supabaseDb.supabase
          .from('course_enrollments')
          .update({ bookings_created_at: null })
          .eq('id', enrollment.id);
        keptCount++;
      }
    }

    console.log(`✅ Deleted ${deletedCount} invalid enrollments`);
    console.log(`✅ Kept ${keptCount} valid January 2026 enrollments`);

    console.log('\n📊 Summary:');
    console.log(`   Kept 6 courses in January 2026`);
    console.log(`   All ready for processing with draft/active system`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

cleanJan2026Only();
