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
 * Auto-mark past bookings as attended.
 * Finds all bookings with status='booked' whose class date has passed (before today)
 * and transitions them to status='attended', attended=true.
 *
 * This does NOT deduct HB credits or increment forfeit counters — those side effects
 * only happen when an admin explicitly marks attendance via the mark-attendance endpoint.
 * The auto-mark simply reflects the default assumption: if a student was booked and
 * the class happened, they attended.
 */
async function autoMarkPastBookingsAsAttended() {
  console.log('[Auto-Processor] Checking for past bookings to mark as attended...');

  try {
    const todayStr = new Date().toISOString().split('T')[0];

    // Fetch past bookings still in 'booked' status, paginated to handle >1000 rows
    let allPastBookings = [];
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const { data: page, error } = await supabase
        .from('bookings')
        .select('id, class_instance_id, class_instances!inner(class_date)')
        .eq('status', 'booked')
        .lt('class_instances.class_date', todayStr)
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error('[Auto-Processor] Error fetching past bookings:', error);
        return { success: false, error: error.message };
      }

      if (!page || page.length === 0) break;
      allPastBookings = allPastBookings.concat(page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }

    if (allPastBookings.length === 0) {
      console.log('[Auto-Processor] ✅ No past bookings need status update');
      return { success: true, updated: 0 };
    }

    const ids = allPastBookings.map(b => b.id);
    console.log(`[Auto-Processor] Marking ${ids.length} past bookings as attended...`);

    // Batch update in chunks of 200 (Supabase .in() limit)
    const chunkSize = 200;
    let totalUpdated = 0;

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          status: 'attended',
          attended: true,
          attendance_marked_at: new Date().toISOString()
        })
        .in('id', chunk);

      if (updateError) {
        console.error(`[Auto-Processor] Error updating batch ${i / chunkSize + 1}:`, updateError);
      } else {
        totalUpdated += chunk.length;
      }
    }

    console.log(`[Auto-Processor] ✅ Marked ${totalUpdated} past bookings as attended`);
    return { success: true, updated: totalUpdated };

  } catch (error) {
    console.error('[Auto-Processor] Error in autoMarkPastBookingsAsAttended:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check for courses starting in 5 days that haven't had their course details email sent,
 * and send an admin reminder if any are found.
 */
async function checkCourseEmailReminders() {
  try {
    const { sendEmail } = require('./emailService');

    const fiveDaysFromNow = new Date();
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);
    const targetDate = fiveDaysFromNow.toISOString().split('T')[0];

    // Find class instances on that date
    const { data: classes } = await supabase
      .from('class_instances')
      .select('class_type, class_date')
      .eq('class_date', targetDate);

    if (!classes || classes.length === 0) return;

    // Get unique base course IDs (exclude HB — their emails are sent automatically on enrollment)
    const candidateCourseIds = [...new Set(classes.map(c => c.class_type.split('.')[0]))]
      .filter(id => !id.startsWith('HB'));

    // Only keep courses whose actual START date (first class) is on the target date
    const courseIds = [];
    for (const courseId of candidateCourseIds) {
      const { data: firstClass } = await supabase
        .from('class_instances')
        .select('class_date')
        .like('class_type', `${courseId}%`)
        .order('class_date', { ascending: true })
        .limit(1)
        .single();

      // Only include if the first class of this course is exactly on the target date
      if (firstClass && firstClass.class_date === targetDate) {
        courseIds.push(courseId);
      }
    }

    if (courseIds.length === 0) return;

    // Check which have sent emails
    const { data: sentEmails } = await supabase
      .from('sent_emails')
      .select('course_identifier')
      .in('course_identifier', courseIds)
      .eq('email_type', 'course_details');

    const sentSet = new Set((sentEmails || []).map(e => e.course_identifier));
    const unsent = courseIds.filter(id => !sentSet.has(id));

    if (unsent.length === 0) return;

    // Get student counts for unsent courses
    const reminders = [];
    for (const courseId of unsent) {
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('id')
        .like('course_identifier', `${courseId}%`)
        .in('status', ['active', 'pending']);

      reminders.push(`• ${courseId} — ${(enrollments || []).length} students enrolled`);
    }

    // Send reminder to admin
    await sendEmail({
      to: 'info@ves.sg',
      subject: `VES Admin: ${unsent.length} course email${unsent.length > 1 ? 's' : ''} pending`,
      html: `<p>The following courses start in 5 days and haven't had their course details email sent:</p><p>${reminders.join('<br/>')}</p><p><a href="https://club.ves.sg/admin/emails">Review and send course emails</a></p>`,
    });

    console.log(`[Auto-Processor] Sent course email reminder for ${unsent.length} courses`);
  } catch (error) {
    console.error('[Auto-Processor] Course email reminder failed:', error);
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
    autoMarkPastBookingsAsAttended().catch(console.error);
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
      autoMarkPastBookingsAsAttended().catch(console.error);
      checkCourseEmailReminders().catch(console.error);
    }
  };

  // Check every minute if it's time to run
  setInterval(runDailyCheck, 60 * 1000);

  console.log('[Auto-Processor] ✅ Automatic daily processing scheduled (runs at 2:00 AM)');
}

module.exports = {
  processReadyCohorts,
  autoMarkPastBookingsAsAttended,
  checkCourseEmailReminders,
  startAutomaticProcessing
};
