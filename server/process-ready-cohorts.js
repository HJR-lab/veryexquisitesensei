/**
 * Process all cohorts that meet the threshold but don't have classes created yet
 * This is a one-time script to catch up on cohorts that were enrolled before the automated system
 */

require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');
const { createClassesAndBookings, MINIMUM_STUDENTS_THRESHOLD } = require('./utils/courseEnrollmentManager');

async function processReadyCohorts() {
  console.log('🔍 Finding all cohorts that meet threshold but need classes...\n');

  // Get all active wheelthrowing enrollments without bookings
  const { data: enrollments, error } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('status', 'active')
    .ilike('course_type', '%wheelthrowing%')
    .is('bookings_created_at', null)
    .order('course_start_date', { ascending: true });

  if (error) {
    console.error('Error fetching enrollments:', error);
    return;
  }

  if (!enrollments || enrollments.length === 0) {
    console.log('✅ No cohorts need processing');
    return;
  }

  // Group by cohort
  const cohorts = {};
  enrollments.forEach(e => {
    const key = `${e.course_type}|${e.course_start_date}|${e.schedule_pattern}|${e.class_time}`;
    if (!cohorts[key]) {
      cohorts[key] = {
        courseType: e.course_type,
        startDate: e.course_start_date,
        schedule: e.schedule_pattern,
        time: e.class_time,
        enrollments: []
      };
    }
    cohorts[key].enrollments.push(e);
  });

  console.log(`Found ${Object.keys(cohorts).length} cohorts to check\n`);

  let processedCount = 0;

  for (const [key, cohort] of Object.entries(cohorts)) {
    const studentCount = cohort.enrollments.length;

    // NEW: Always process cohorts (create draft for <4, active for >=4)
    const classStatus = studentCount >= MINIMUM_STUDENTS_THRESHOLD ? 'active' : 'draft';

    console.log(`\n📊 ${cohort.schedule}s ${cohort.time} starting ${cohort.startDate}`);
    console.log(`   Students: ${studentCount}`);

    if (classStatus === 'draft') {
      console.log(`   📝 Creating DRAFT classes (waiting for ${MINIMUM_STUDENTS_THRESHOLD - studentCount} more students)...`);
    } else {
      console.log(`   ✅ Creating ACTIVE classes (threshold met!)...`);
    }

    try {
      const result = await createClassesAndBookings(cohort.enrollments, classStatus);

      console.log(`   🎉 Created ${result.classInstancesCreated} ${classStatus.toUpperCase()} classes and ${result.bookingsCreated} bookings`);
      processedCount++;
    } catch (error) {
      console.error(`   ❌ Error processing cohort:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`\n✅ Processing complete!`);
  console.log(`   Total cohorts processed: ${processedCount}`);
  console.log(`   Total cohorts checked: ${Object.keys(cohorts).length}`);

  process.exit(0);
}

processReadyCohorts().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
