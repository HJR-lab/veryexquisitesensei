/**
 * PROCESS PENDING COHORTS
 * Find cohorts with 4+ students and create their classes
 */

require('dotenv').config();
const { checkAndProcessThreshold } = require('./utils/courseEnrollmentManager');
const { supabase } = require('./utils/supabaseDb');

async function processPendingCohorts() {
  console.log('\n🔄 PROCESSING PENDING COHORTS\n');
  console.log('==========================================\n');

  // Get all enrollments without bookings
  const { data: pending } = await supabase
    .from('course_enrollments')
    .select('*')
    .is('bookings_created_at', null);

  if (!pending || pending.length === 0) {
    console.log('No pending enrollments found.');
    process.exit(0);
  }

  console.log(`Found ${pending.length} pending enrollments\n`);

  // Group by cohort
  const cohorts = {};
  pending.forEach(enrollment => {
    // Skip if missing required fields
    if (!enrollment.class_time || enrollment.class_time === 'TBD') {
      return;
    }

    const key = `${enrollment.course_type}|${enrollment.course_start_date}|${enrollment.schedule_pattern}|${enrollment.class_time}`;
    if (!cohorts[key]) {
      cohorts[key] = {
        courseType: enrollment.course_type,
        startDate: enrollment.course_start_date,
        schedule: enrollment.schedule_pattern,
        time: enrollment.class_time,
        enrollments: []
      };
    }
    cohorts[key].enrollments.push(enrollment);
  });

  console.log(`Found ${Object.keys(cohorts).length} unique cohorts\n`);

  let processed = 0;
  let classesCreated = 0;
  let bookingsCreated = 0;

  for (const cohort of Object.values(cohorts)) {
    const count = cohort.enrollments.length;
    const isHandbuilding = cohort.courseType && cohort.courseType.toLowerCase().includes('handbuilding');
    const isWheelthrowing = cohort.courseType && 
      (cohort.courseType.includes('Wheelthrowing') || cohort.courseType.includes('wheelthrowing'));

    // Process if:
    // 1. Handbuilding (no threshold)
    // 2. Wheelthrowing with 4+ students
    const shouldProcess = isHandbuilding || (isWheelthrowing && count >= 4);

    if (shouldProcess) {
      console.log(`\n📊 Processing: ${cohort.courseType} - ${cohort.schedule}s ${cohort.time} starting ${cohort.startDate}`);
      console.log(`   Students: ${count}`);

      try {
        // Use the first enrollment to trigger threshold check
        const result = await checkAndProcessThreshold(cohort.enrollments[0]);
        
        if (result.classInstancesCreated) {
          console.log(`   ✅ Created ${result.classInstancesCreated} classes, ${result.bookingsCreated} bookings`);
          classesCreated += result.classInstancesCreated;
          bookingsCreated += result.bookingsCreated;
          processed++;
        } else if (result.addedToExistingCohort) {
          console.log(`   ✅ Classes already exist, skipping`);
        } else {
          console.log(`   ⏳ Waiting for more students (${count}/4)`);
        }
      } catch (error) {
        if (error.message && (error.message.includes('duplicate') || error.message.includes('unique constraint'))) {
          console.log(`   ℹ️  Classes already exist`);
        } else {
          console.log(`   ❌ Error: ${error.message}`);
        }
      }
    }
  }

  console.log('\n\n✅ PROCESSING COMPLETE!\n');
  console.log('==========================================\n');
  console.log(`📊 Summary:`);
  console.log(`   Cohorts processed: ${processed}`);
  console.log(`   Classes created: ${classesCreated}`);
  console.log(`   Bookings created: ${bookingsCreated}\n`);

  process.exit(0);
}

processPendingCohorts().catch(error => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
