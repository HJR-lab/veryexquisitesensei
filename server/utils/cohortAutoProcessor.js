/**
 * Automatic Cohort Processor
 * Runs daily to check for cohorts that meet the threshold and create classes automatically
 */

const { supabase, resolveBookingEnrollment, syncStoredCredits } = require('./supabaseDb');
const { createClassesAndBookings, MINIMUM_STUDENTS_THRESHOLD } = require('./courseEnrollmentManager');
const courseConfig = require('./courseConfig');
const inboxProcessor = require('./inboxProcessor');
const { processCampaigns } = require('./campaignCron');
const calendarSync = require('./calendarSync');
const { publicBaseUrl } = require('./publicUrl');

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

    // Fetch all 'booked' bookings with class dates, then filter for past dates in JS
    let allPastBookings = [];
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const { data: page, error } = await supabase
        .from('bookings')
        .select('id, class_instance_id, class_instances!bookings_class_instance_id_fkey(class_date)')
        .eq('status', 'booked')
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error('[Auto-Processor] Error fetching past bookings:', error);
        return { success: false, error: error.message };
      }

      if (!page || page.length === 0) break;
      // Filter for past class dates
      const pastInPage = page.filter(b => {
        const d = b.class_instances?.class_date?.split(/[T ]/)[0];
        return d && d < todayStr;
      });
      allPastBookings = allPastBookings.concat(pastInPage);
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
    // Credits are computed on read via getEnrollmentCredits — no counter updates needed
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

      // Student-facing unconfirmed/postponement emails are DISABLED.
      // Only notify admin internally so they can decide what to do.
      // Sent via sendAndLogEmail (email_type 'course_unconfirmed') so the
      // alreadySent dedup check above stops this re-firing every day.
      await sendAndLogEmail({
        emailType: 'course_unconfirmed',
        courseIdentifier: cohortId,
        subject: `VES Admin: Course unconfirmed — ${cohortId} (${studentCount} students)`,
        html: `<p>The following course starts in 3 days but only has ${studentCount} student(s) (minimum ${unconfirmedMinStudents} required):</p>
          <p><strong>${cohort.courseType}</strong> — ${dayOfWeek}s, ${formattedStart} (${cohort.classTime})</p>
          <p>No email was sent to the enrolled students — handle this cohort manually.</p>`,
        recipientEmails: ['info@ves.sg'],
        sentBy: 'system',
      });

      console.log(`[Auto-Processor] Course unconfirmed (admin-only notice) for ${cohortId} — ${studentCount} students, NO student email sent`);
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
 * Check for piece batches that need reminder emails.
 * Sends reminders every 14 days for batches in 'ready' status
 * that haven't been collected/shipped within the 60-day hold period.
 */
async function checkPieceReminders() {
  try {
    const supabaseDb = require('./supabaseDb');
    const { sendAndLogEmail } = require('./emailService');
    const piecesReminderTemplate = require('../email-templates/pieces/pieces-reminder');
    const appUrl = publicBaseUrl();

    const batches = await supabaseDb.getReadyBatchesNeedingReminder();
    console.log(`[Auto-Processor] Found ${batches.length} piece batches needing reminders`);

    let sent = 0;
    for (const batch of batches) {
      const student = batch.customers;
      if (!student || !student.email) continue;

      const readyAt = new Date(batch.ready_at);
      const now = new Date();
      const daysSinceReady = Math.floor((now - readyAt) / (1000 * 60 * 60 * 24));

      if (daysSinceReady > 60) continue;

      const holdExpires = new Date(batch.hold_expires_at);
      const holdExpiresDate = holdExpires.toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' });

      const courseName = batch.course_enrollments?.course_title || batch.course_enrollments?.course_variant_title || 'your course';
      const photoUrl = batch.photo_urls && batch.photo_urls.length > 0 ? batch.photo_urls[0] : null;

      const { subject, html } = piecesReminderTemplate.generate({
        studentName: student.first_name || 'there',
        courseName,
        pieceCount: batch.piece_count,
        photoUrl,
        appUrl,
        daysSinceReady,
        holdExpiresDate,
      });

      const result = await sendAndLogEmail({
        emailType: 'pieces-reminder',
        courseIdentifier: batch.course_enrollments?.course_identifier || `batch-${batch.id}`,
        subject,
        html,
        recipientEmails: [student.email],
        sentBy: 'system',
      });

      if (result.success) {
        await supabaseDb.updatePieceBatch(batch.id, { last_reminder_at: new Date().toISOString() });
        sent++;
      }
    }

    console.log(`[Auto-Processor] ✅ Sent ${sent} piece reminder emails`);
    return { success: true, sent };
  } catch (error) {
    console.error('[Auto-Processor] Error in checkPieceReminders:', error);
    return { success: false, error: error.message };
  }
}

async function autoRecycleExpiredBatches() {
  try {
    const supabaseDb = require('./supabaseDb');
    const { sendAndLogEmail } = require('./emailService');
    const recycledTemplate = require('../email-templates/pieces/pieces-recycled');
    const appUrl = publicBaseUrl();

    const expiredBatches = await supabaseDb.getExpiredPieceBatches();
    console.log(`[Auto-Processor] Found ${expiredBatches.length} expired piece batches to recycle`);

    let recycled = 0;
    for (const batch of expiredBatches) {
      // Update status to recycled
      await supabaseDb.updatePieceBatchStatus(batch.id, 'recycled');

      // Send disposal email
      const student = batch.customers;
      if (student && student.email) {
        const courseName = batch.course_enrollments?.course_title || batch.course_enrollments?.course_variant_title || 'your course';

        const { subject, html } = recycledTemplate.generate({
          studentName: student.first_name || 'there',
          pieceCount: batch.piece_count,
          courseName,
          appUrl,
        });

        await sendAndLogEmail({
          emailType: 'pieces-recycled',
          courseIdentifier: batch.course_enrollments?.course_identifier || `batch-${batch.id}`,
          subject,
          html,
          recipientEmails: [student.email],
          sentBy: 'system',
        });
      }

      recycled++;
    }

    console.log(`[Auto-Processor] ✅ Recycled ${recycled} expired piece batches`);
    return { success: true, recycled };
  } catch (error) {
    console.error('[Auto-Processor] Error in autoRecycleExpiredBatches:', error);
    return { success: false, error: error.message };
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
    autoMarkPastBookingsAsAttended()
      .then(() => calendarSync.resyncUpcoming())
      .then(() => calendarSync.resyncMemberships())
      .catch(console.error);
    checkPieceReminders().catch(console.error);
    autoRecycleExpiredBatches().catch(console.error);
    cleanupExpiredWaitlist().catch(console.error);
    processCampaigns().catch(console.error);
    autoRelinkUnlinkedBookings().catch(console.error);
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
      // Mark yesterday's classes attended, THEN refresh the calendar so progress
      // strings (which count attended bookings) reflect the new attendance.
      autoMarkPastBookingsAsAttended()
        .then(() => calendarSync.resyncUpcoming())
        .then(() => calendarSync.resyncMemberships())
        .catch(console.error);
      checkCourseEmailReminders().catch(console.error);
      checkUnconfirmedCourses().catch(console.error);
      checkWeeklyUnconfirmedRecheck().catch(console.error);
      checkPieceReminders().catch(console.error);
      autoRecycleExpiredBatches().catch(console.error);
      cleanupExpiredWaitlist().catch(console.error);
      // Runs before the 2:15 anomaly probe, so the probe only reports what
      // could not be repaired automatically.
      autoRelinkUnlinkedBookings().catch(console.error);
      // Lapse yesterday's expired continuation offers and offer the next
      // course to anyone newly due one.
      require('./continuationSweep').runContinuationSweep().catch(console.error);
    }

    // Run anomaly probe at 2:15 AM — after the 2:00 AM batch so any
    // attendance/booking transitions have settled before we evaluate invariants.
    if (hour === 2 && minute === 15) {
      runAnomalyProbeAndAlert().catch(err => {
        console.error('[Anomaly Probe] Daily run failed:', err);
      });
    }

    // Check waitlist 24h notifications and process campaigns every hour
    if (minute === 30) {
      notifyWaitlist24Hours().catch(console.error);
      processCampaigns().catch(console.error);
    }

    // Process inbox emails every 15 minutes
    if (minute % 15 === 0) {
      inboxProcessor.processNewEmails().catch(err => {
        console.error('[Inbox Cron] Error processing emails:', err.message);
      });
    }
  };

  // Check every minute if it's time to run
  setInterval(runDailyCheck, 60 * 1000);

  console.log('[Auto-Processor] ✅ Automatic daily processing scheduled (runs at 2:00 AM)');
}

/**
 * Repair upcoming bookings that carry no enrollment link.
 *
 * A booking with course_enrollment_id = null is invisible to
 * getEnrollmentCredits, which counts by that column — the seat is taken and no
 * credit is spent. Two students reached production that way (Nicole Wong,
 * April; Sanjana Vijay, August) through three different booking paths before
 * the shared resolver landed.
 *
 * The code paths are fixed. This runs nightly anyway, because the cost of
 * being wrong is asymmetric: relinking a booking that was already correct is a
 * no-op, while missing one gives away a class and quietly misstates a
 * student's balance for months.
 *
 * UPCOMING ONLY. A past unlinked booking is history — relinking it rewrites a
 * balance the student has lived with, which is a decision for a person, not a
 * cron job.
 */
async function autoRelinkUnlinkedBookings() {
  console.log('[Auto-Processor] Checking for bookings with no enrollment link...');

  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const CONSUMING = ['booked', 'attended', 'completed', 'forfeited', 'absent'];

    const { data: unlinked, error } = await supabase
      .from('bookings')
      .select('id, student_id, status, class_instances!bookings_class_instance_id_fkey(class_date, class_type)')
      .is('course_enrollment_id', null)
      .in('status', CONSUMING);

    if (error) {
      console.error('[Auto-Processor] Error fetching unlinked bookings:', error);
      return { success: false, error: error.message };
    }

    const upcoming = (unlinked || []).filter(b =>
      (b.class_instances?.class_date || '').split(/[T ]/)[0] >= todayStr);

    if (upcoming.length === 0) {
      console.log('[Auto-Processor] ✅ No unlinked upcoming bookings');
      return { success: true, relinked: 0 };
    }

    let relinked = 0;
    for (const b of upcoming) {
      const enrollmentId = await resolveBookingEnrollment(b.student_id, b.class_instances);
      if (!enrollmentId) {
        // Legitimate: a cross-course makeup covered by the legacy per-customer
        // allocation has no enrollment to charge. Reported by the anomaly probe
        // rather than forced.
        console.log(`[Auto-Processor] booking ${b.id} (student ${b.student_id}) has no candidate enrollment — left for review`);
        continue;
      }
      const { error: updErr } = await supabase
        .from('bookings')
        .update({ course_enrollment_id: enrollmentId, updated_at: new Date().toISOString() })
        .eq('id', b.id);
      if (updErr) {
        console.error(`[Auto-Processor] Failed to relink booking ${b.id}:`, updErr.message);
        continue;
      }
      await syncStoredCredits(enrollmentId);
      console.log(`[Auto-Processor] 🔗 Relinked booking ${b.id} -> enrollment ${enrollmentId} (was consuming no credit)`);
      relinked++;
    }

    console.log(`[Auto-Processor] ✅ Relinked ${relinked} of ${upcoming.length} unlinked upcoming booking(s)`);
    return { success: true, relinked };

  } catch (error) {
    console.error('[Auto-Processor] Error in autoRelinkUnlinkedBookings:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Notify waitlisted students 24 hours before class that it's still full
 * and they need to reschedule. Deletes the waitlist entry after notifying.
 */
async function notifyWaitlist24Hours() {
  try {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find unclaimed waitlist entries where class is within the next 24 hours
    const { data: entries, error } = await supabase
      .from('waitlist')
      .select(`
        id, student_id, notification_sent_at,
        customers!waitlist_student_id_fkey (first_name, last_name, email),
        class_instances!waitlist_class_instance_id_fkey (id, class_type, class_date, start_time, end_time, instructor)
      `)
      .eq('claimed', false)
      .is('notification_sent_at', null);

    if (error) {
      console.error('[Waitlist 24h] Query error:', error);
      return;
    }

    // Filter to entries where class is within 24 hours
    const toNotify = (entries || []).filter(e => {
      if (!e.class_instances?.class_date) return false;
      const classDate = new Date(e.class_instances.class_date);
      // Set class time
      if (e.class_instances.start_time) {
        const match = e.class_instances.start_time.trim().toLowerCase().match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
        if (match) {
          let h = parseInt(match[1], 10);
          const mins = parseInt(match[2] || '0', 10);
          if (match[3] === 'pm' && h !== 12) h += 12;
          if (match[3] === 'am' && h === 12) h = 0;
          classDate.setHours(h, mins, 0, 0);
        }
      }
      return classDate > now && classDate <= in24h;
    });

    if (toNotify.length === 0) return;

    const { sendEmail, isEmailCategoryPaused } = require('./emailService');
    const { wrapEmailTemplate } = require('../email-templates/base');

    // While the waitlist email category is paused, don't process notifications
    // at all — leave entries intact (deletion is coupled to the email send).
    if (isEmailCategoryPaused('waitlist')) {
      console.log(`[Waitlist 24h] Email paused — skipping ${toNotify.length} notification(s); entries left intact`);
      return;
    }

    for (const entry of toNotify) {
      const student = entry.customers;
      const cls = entry.class_instances;
      if (!student?.email || !cls) continue;

      const classDateStr = new Date(cls.class_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const ct = cls.class_type || '';
      const weekMatch = ct.match(/_\w+(\d)\./);
      const courseTitle = ct.startsWith('HB') ? 'Handbuilding'
        : (weekMatch && weekMatch[1] === '7') ? 'Wheelthrowing Intermediate 7 Weeks'
        : 'Wheelthrowing Beginners/Ext 6 Weeks';

      const body = `
        <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
          Class is full — please reschedule
        </h1>
        <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
          Hi ${student.first_name}, unfortunately a spot did not open up for your waitlisted class. The class is confirmed full and you will need to reschedule to another available class.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FFF7E6; border-radius: 8px; margin: 0 0 20px;">
          <tr>
            <td style="padding: 16px 20px;">
              <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E6200; text-transform: uppercase; letter-spacing: 0.05em;">Class Not Available</p>
              <p style="margin: 0 0 2px; font-size: 15px; font-weight: 600; color: #282828;">${courseTitle}</p>
              <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">${classDateStr}</p>
              <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">${cls.start_time} – ${cls.end_time}</p>
              <p style="margin: 0; font-size: 15px; color: #282828;">Instructor: ${cls.instructor}</p>
            </td>
          </tr>
        </table>
        <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #282828;">
          Please log in to reschedule your class to another available session. No credit has been deducted — your class credit is still available.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0;">
          <tr>
            <td align="center">
              <a href="https://club.ves.sg/classes" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                Reschedule Now
              </a>
            </td>
          </tr>
        </table>`;

      await sendEmail({
        to: student.email,
        subject: `VES — Please reschedule your ${classDateStr} class`,
        html: wrapEmailTemplate(body),
      });

      // Mark as notified and delete the waitlist entry
      await supabase
        .from('waitlist')
        .delete()
        .eq('id', entry.id);

      console.log(`[Waitlist 24h] Notified ${student.first_name} ${student.last_name} — class ${cls.class_type} on ${cls.class_date} is full. Waitlist entry removed.`);
    }

    console.log(`[Waitlist 24h] Processed ${toNotify.length} notifications`);
  } catch (err) {
    console.error('[Waitlist 24h] Error:', err);
  }
}

/**
 * Clean up waitlist entries for classes that have already passed
 */
async function cleanupExpiredWaitlist() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: expired, error } = await supabase
      .from('waitlist')
      .select('id, student_id, class_instance_id, class_instances!waitlist_class_instance_id_fkey(class_date, class_type)')
      .eq('claimed', false)
      .lt('class_instances.class_date', today);

    if (error) {
      console.error('[Waitlist Cleanup] Error:', error);
      return;
    }

    // Filter to entries where class_date is actually past (the join filter may return nulls)
    const toDelete = (expired || []).filter(e => e.class_instances?.class_date && e.class_instances.class_date < today);

    if (toDelete.length === 0) return;

    const ids = toDelete.map(e => e.id);
    const { error: delError } = await supabase
      .from('waitlist')
      .delete()
      .in('id', ids);

    if (delError) {
      console.error('[Waitlist Cleanup] Delete error:', delError);
    } else {
      console.log(`[Waitlist Cleanup] Removed ${ids.length} expired waitlist entries`);
    }
  } catch (err) {
    console.error('[Waitlist Cleanup] Error:', err);
  }
}

/**
 * Run the daily anomaly probe and email the digest to admin if findings exist.
 * Idempotent — checks sent_emails for today before sending, so cron restarts
 * or multiple ticks at minute=15 won't double-send.
 */
async function runAnomalyProbeAndAlert() {
  const { runAnomalyProbe } = require('./anomalyProbe');
  const findings = await runAnomalyProbe();
  console.log(`[Anomaly Probe] ${findings.length} finding(s) at ${new Date().toISOString()}`);

  if (findings.length === 0) return;

  // Idempotency: don't re-send if we already emailed a digest today.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data: alreadySent } = await supabase
    .from('sent_emails')
    .select('id')
    .eq('email_type', 'anomaly_digest')
    .gte('sent_at', todayStart.toISOString())
    .limit(1);

  if (alreadySent && alreadySent.length > 0) {
    console.log('[Anomaly Probe] Digest already sent today, skipping email');
    return;
  }

  const { sendAndLogEmail } = require('./emailService');
  const { buildAnomalyDigestEmail } = require('../email-templates/anomaly-digest');

  const baseUrl = publicBaseUrl();
  const html = buildAnomalyDigestEmail({ findings, baseUrl });
  const subject = `[VES] ${findings.length} account anomal${findings.length === 1 ? 'y' : 'ies'} detected`;

  await sendAndLogEmail({
    emailType: 'anomaly_digest',
    courseIdentifier: null,
    subject,
    html,
    recipientEmails: ['info@ves.sg'],
    sentBy: 'anomaly-probe-cron',
  });
}

module.exports = {
  processReadyCohorts,
  autoMarkPastBookingsAsAttended,
  autoRelinkUnlinkedBookings,
  checkCourseEmailReminders,
  checkUnconfirmedCourses,
  checkWeeklyUnconfirmedRecheck,
  checkPieceReminders,
  autoRecycleExpiredBatches,
  cleanupExpiredWaitlist,
  notifyWaitlist24Hours,
  runAnomalyProbeAndAlert,
  startAutomaticProcessing
};
