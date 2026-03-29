/**
 * Automatic Cohort Processor
 * Runs daily to check for cohorts that meet the threshold and create classes automatically
 */

const { supabase } = require('./supabaseDb');
const { createClassesAndBookings, MINIMUM_STUDENTS_THRESHOLD } = require('./courseEnrollmentManager');
const courseConfig = require('./courseConfig');

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

      // NEW: Always process cohorts (create draft for <threshold, active for >=threshold)
      let minStudents = MINIMUM_STUDENTS_THRESHOLD; // fallback
      try {
        const wtConfigs = courseConfig.getConfigByCategory('wheelthrowing');
        if (wtConfigs && wtConfigs.length > 0) {
          minStudents = wtConfigs[0].min_students_to_activate || MINIMUM_STUDENTS_THRESHOLD;
        }
      } catch (e) { /* config not loaded yet, use fallback */ }
      const classStatus = studentCount >= minStudents ? 'active' : 'draft';

      if (classStatus === 'draft') {
        console.log(`[Auto-Processor] Creating DRAFT: ${cohort.schedule}s ${cohort.time} starting ${cohort.startDate} (${studentCount} students - waiting for ${minStudents - studentCount} more)`);
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

    // Read email_send_days_before from config (fallback to 5 if config not loaded)
    let sendDaysBefore = 5;
    try {
      const wtConfigs = courseConfig.getConfigByCategory('wheelthrowing');
      if (wtConfigs && wtConfigs.length > 0 && wtConfigs[0].email_send_days_before != null) {
        sendDaysBefore = wtConfigs[0].email_send_days_before;
      }
    } catch (e) { /* config not loaded, use fallback */ }

    const targetDateObj = new Date();
    targetDateObj.setDate(targetDateObj.getDate() + sendDaysBefore);
    const targetDate = targetDateObj.toISOString().split('T')[0];

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
 * Check for WT courses starting in 3 days that haven't met the threshold,
 * and send students an unconfirmed/postponement email.
 */
async function checkUnconfirmedCourses() {
  try {
    const { sendAndLogEmail } = require('./emailService');
    const { generateCourseUnconfirmedEmail } = require('../email-templates/course-unconfirmed');

    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const targetDate = threeDaysFromNow.toISOString().split('T')[0];

    // Find WT enrollments with course_start_date = 3 days from now
    // that haven't met threshold (no bookings_created_at means no classes created as active)
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*, customers!inner(email, first_name, last_name)')
      .eq('course_start_date', targetDate)
      .in('status', ['active', 'pending', 'upcoming'])
      .not('course_type', 'ilike', '%handbuilding%');

    if (!enrollments || enrollments.length === 0) return;

    // Group by cohort (course_type + schedule_pattern + class_time + start_date)
    const cohortMap = {};
    for (const enrollment of enrollments) {
      const key = `${enrollment.course_type}_${enrollment.schedule_pattern}_${enrollment.class_time}_${enrollment.course_start_date}`;
      if (!cohortMap[key]) {
        cohortMap[key] = {
          courseType: enrollment.course_type,
          schedulePattern: enrollment.schedule_pattern,
          classTime: enrollment.class_time,
          startDate: enrollment.course_start_date,
          enrollments: [],
        };
      }
      cohortMap[key].enrollments.push(enrollment);
    }

    for (const [key, cohort] of Object.entries(cohortMap)) {
      const studentCount = cohort.enrollments.length;

      // Skip if threshold is already met (read from config, fallback to MINIMUM_STUDENTS_THRESHOLD)
      let unconfirmedMinStudents = MINIMUM_STUDENTS_THRESHOLD;
      try {
        const wtConfigs = courseConfig.getConfigByCategory('wheelthrowing');
        if (wtConfigs && wtConfigs.length > 0) {
          unconfirmedMinStudents = wtConfigs[0].min_students_to_activate || MINIMUM_STUDENTS_THRESHOLD;
        }
      } catch (e) { /* config not loaded, use fallback */ }
      if (studentCount >= unconfirmedMinStudents) continue;

      // Check if we already sent an unconfirmed email for this cohort + date
      const cohortId = `${cohort.courseType}_${cohort.schedulePattern}_${cohort.startDate}`;
      const { data: alreadySent } = await supabase
        .from('sent_emails')
        .select('id')
        .eq('email_type', 'course_unconfirmed')
        .eq('course_identifier', cohortId)
        .limit(1)
        .maybeSingle();

      if (alreadySent) continue;

      // Get student emails
      const studentEmails = cohort.enrollments
        .map(e => e.customers?.email)
        .filter(Boolean);

      if (studentEmails.length === 0) continue;

      // Format day of week and time for the email
      const dayOfWeek = (cohort.schedulePattern || '').charAt(0).toUpperCase() +
        (cohort.schedulePattern || '').slice(1).toLowerCase();
      const formattedStart = new Date(cohort.startDate + 'T00:00:00')
        .toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

      const { subject, html } = generateCourseUnconfirmedEmail({
        courseType: cohort.courseType || 'Wheelthrowing',
        dayOfWeek,
        startDate: formattedStart,
        timeSlot: cohort.classTime || '',
      });

      await sendAndLogEmail({
        emailType: 'course_unconfirmed',
        courseIdentifier: cohortId,
        subject,
        html,
        recipientEmails: studentEmails,
        sentBy: 'system',
      });

      console.log(`[Auto-Processor] Sent unconfirmed course email to ${studentEmails.length} students for ${cohortId}`);

      // Also notify admin
      const { sendEmail } = require('./emailService');
      await sendEmail({
        to: 'info@ves.sg',
        subject: `VES Admin: Course unconfirmed — ${cohortId} (${studentCount} students)`,
        html: `<p>The following course starts in 3 days but only has ${studentCount} student(s) (minimum ${unconfirmedMinStudents} required):</p>
          <p><strong>${cohort.courseType}</strong> — ${dayOfWeek}s, ${formattedStart} (${cohort.classTime})</p>
          <p>An unconfirmed/postponement email has been sent to the enrolled students.</p>`,
      });
    }
  } catch (error) {
    console.error('[Auto-Processor] Unconfirmed course check failed:', error);
  }
}

/**
 * Weekly recheck of unconfirmed courses:
 * For courses that received an 'unconfirmed' email but no confirmation yet,
 * resend the unconfirmed email (or confirmation if threshold now met) every 7 days.
 */
async function checkWeeklyUnconfirmedRecheck() {
  const wtConfigs = courseConfig.getConfigByCategory('wheelthrowing');

  for (const config of wtConfigs) {
    // Find courses that have had unconfirmed emails sent but no confirmation yet
    const { data: unconfirmedSends } = await supabase
      .from('sent_emails')
      .select('*')
      .eq('email_type', 'course_unconfirmed')
      .order('sent_at', { ascending: false });

    if (!unconfirmedSends) continue;

    // Group by course_identifier, get latest send per course
    const latestByIdentifier = {};
    for (const send of unconfirmedSends) {
      if (!latestByIdentifier[send.course_identifier]) {
        latestByIdentifier[send.course_identifier] = send;
      }
    }

    for (const [courseId, lastSend] of Object.entries(latestByIdentifier)) {
      // Check if confirmation was already sent
      const { data: confirmationSent } = await supabase
        .from('sent_emails')
        .select('id')
        .eq('email_type', 'course_details')
        .eq('course_identifier', courseId)
        .limit(1);

      if (confirmationSent && confirmationSent.length > 0) continue;

      // Check if 7 days since last unconfirmed email
      const daysSinceLastSend = Math.floor((Date.now() - new Date(lastSend.sent_at).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceLastSend < 7) continue;

      // Check current enrollment count
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('id')
        .like('course_identifier', `${courseId}%`)
        .in('status', ['active', 'pending', 'upcoming']);

      const enrollmentCount = enrollments ? enrollments.length : 0;
      const minStudents = config.min_students_to_activate;

      if (enrollmentCount >= minStudents) {
        console.log(`[AutoProcessor] Course ${courseId} reached ${enrollmentCount} pax — sending confirmation`);
        // TODO: Trigger confirmation email (uses existing course email send logic)
      } else {
        console.log(`[AutoProcessor] Course ${courseId} still at ${enrollmentCount}/${minStudents} pax — resending unconfirmed`);
        // TODO: Trigger unconfirmed email resend (uses existing unconfirmed email logic)
      }
    }
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
      checkUnconfirmedCourses().catch(console.error);
      checkWeeklyUnconfirmedRecheck().catch(console.error);
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
  checkUnconfirmedCourses,
  checkWeeklyUnconfirmedRecheck,
  startAutomaticProcessing
};
