/**
 * Automatic Cohort Processor
 * Runs daily to check for cohorts that meet the threshold and create classes automatically
 */

const { supabase } = require('./supabaseDb');
const { createClassesAndBookings, MINIMUM_STUDENTS_THRESHOLD } = require('./courseEnrollmentManager');

/**
 * Main function to process all ready cohorts
 * @returns {Promise<Object>} Summary of processing results
 */
async function processReadyCohorts() {
  console.log('🔍 [Auto-Processor] Checking for cohorts that need classes...');

  try {
    // Get all active wheelthrowing enrollments without bookings
    const { data: enrollments, error } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('status', 'active')
      .ilike('course_type', '%wheelthrowing%')
      .is('bookings_created_at', null)
      .gte('course_start_date', new Date().toISOString().split('T')[0]); // Only future courses

    if (error) {
      console.error('[Auto-Processor] Error fetching enrollments:', error);
      return {
        success: false,
        error: error.message
      };
    }

    if (!enrollments || enrollments.length === 0) {
      console.log('[Auto-Processor] ✅ No cohorts need processing');
      return {
        success: true,
        cohortsProcessed: 0,
        cohortsSkipped: 0,
        message: 'No cohorts need processing'
      };
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

    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const processedCohorts = [];
    const errors = [];

    for (const [key, cohort] of Object.entries(cohorts)) {
      const studentCount = cohort.enrollments.length;

      // NEW: Always process cohorts (create draft for <4, active for >=4)
      const classStatus = studentCount >= MINIMUM_STUDENTS_THRESHOLD ? 'active' : 'draft';

      if (classStatus === 'draft') {
        console.log(`[Auto-Processor] Creating DRAFT: ${cohort.schedule}s ${cohort.time} starting ${cohort.startDate} (${studentCount} students - waiting for ${MINIMUM_STUDENTS_THRESHOLD - studentCount} more)`);
      } else {
        console.log(`[Auto-Processor] Creating ACTIVE: ${cohort.schedule}s ${cohort.time} starting ${cohort.startDate} (${studentCount} students)`);
      }

      try {
        const result = await createClassesAndBookings(cohort.enrollments, classStatus);

        console.log(`[Auto-Processor] ✅ Created ${result.classInstancesCreated} ${classStatus} classes and ${result.bookingsCreated} bookings`);

        processedCohorts.push({
          schedule: `${cohort.schedule}s ${cohort.time}`,
          startDate: cohort.startDate,
          students: studentCount,
          status: classStatus,
          classes: result.classInstancesCreated,
          bookings: result.bookingsCreated
        });

        processedCount++;
      } catch (error) {
        console.error(`[Auto-Processor] ❌ Error processing cohort:`, error.message);
        errorCount++;
        errors.push({
          cohort: `${cohort.schedule}s ${cohort.time} starting ${cohort.startDate}`,
          error: error.message
        });
      }
    }

    const summary = {
      success: true,
      cohortsProcessed: processedCount,
      cohortsSkipped: skippedCount,
      errors: errorCount,
      totalChecked: Object.keys(cohorts).length,
      processedCohorts,
      errorDetails: errors
    };

    console.log(`[Auto-Processor] ✅ Complete: ${processedCount} processed, ${skippedCount} skipped, ${errorCount} errors`);

    return summary;

  } catch (error) {
    console.error('[Auto-Processor] Fatal error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Schedule automatic processing (call this on server startup)
 */
function startAutomaticProcessing() {
  // Run once immediately on startup (after a short delay)
  setTimeout(() => {
    console.log('[Auto-Processor] Running initial check...');
    processReadyCohorts().catch(console.error);
  }, 5000);

  // Run daily at 2 AM
  const runDailyCheck = () => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    // Run at 2:00 AM
    if (hour === 2 && minute === 0) {
      console.log('[Auto-Processor] Running daily scheduled check...');
      processReadyCohorts().catch(console.error);
    }
  };

  // Check every minute if it's time to run
  setInterval(runDailyCheck, 60 * 1000);

  console.log('[Auto-Processor] ✅ Automatic daily processing scheduled (runs at 2:00 AM)');
}

module.exports = {
  processReadyCohorts,
  startAutomaticProcessing
};
