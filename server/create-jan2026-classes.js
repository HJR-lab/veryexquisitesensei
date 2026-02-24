require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');
const { createClassesAndBookings } = require('./utils/courseEnrollmentManager');

async function createJanuaryClasses() {
  console.log('Creating classes ONLY for courses starting in January 2026...\n');

  // Get enrollments starting in January 2026
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('status', 'active')
    .ilike('course_type', '%wheelthrowing%')
    .is('bookings_created_at', null)
    .gte('course_start_date', '2026-01-01')
    .lte('course_start_date', '2026-01-31');

  if (!enrollments || enrollments.length === 0) {
    console.log('No enrollments found for January 2026');
    process.exit(0);
  }

  // Group by cohort
  const cohorts = {};
  enrollments.forEach(enrollment => {
    const cohortKey = `${enrollment.schedule_pattern}|${enrollment.class_time || ''}|${enrollment.course_start_date}`;
    if (!cohorts[cohortKey]) {
      cohorts[cohortKey] = [];
    }
    cohorts[cohortKey].push(enrollment);
  });

  console.log(`Found ${Object.keys(cohorts).length} cohorts in January 2026\n`);

  let processed = 0;
  let skipped = 0;

  for (const [cohortKey, cohortEnrollments] of Object.entries(cohorts)) {
    const [schedule, time, startDate] = cohortKey.split('|');
    const count = cohortEnrollments.length;

    console.log(`📊 ${schedule} ${time} starting ${startDate}`);
    console.log(`   Students: ${count}`);

    if (count >= 4) {
      console.log('   ✅ Creating classes...');
      try {
        await createClassesAndBookings(cohortEnrollments);
        processed++;
        console.log('   ✅ Done!\n');
      } catch (error) {
        console.log('   ❌ Error:', error.message, '\n');
      }
    } else {
      console.log(`   ⏳ Below threshold (${count}/4)\n`);
      skipped++;
    }
  }

  console.log('================================================================================');
  console.log(`✅ Complete!`);
  console.log(`   Processed: ${processed} cohorts`);
  console.log(`   Skipped: ${skipped} cohorts (below threshold)`);

  process.exit(0);
}

createJanuaryClasses();
