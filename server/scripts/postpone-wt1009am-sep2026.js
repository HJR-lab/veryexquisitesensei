/**
 * One-off: postpone WT1009AM_JL6 by one week and tell its two students.
 *
 * The Thursday 9:30am cohort reached 09/09/26 with 2 of the 4 students it needs
 * and its first class the next morning. The automatic notice that should have
 * caught this on 07/09 has been admin-only since 43ce3eea, so neither student
 * was ever told — and both had been explicitly promised they would hear from
 * the studio if the minimum was not met.
 *
 * Run:
 *   node scripts/postpone-wt1009am-sep2026.js              # dry run + email preview
 *   node scripts/postpone-wt1009am-sep2026.js --execute    # move the dates, then send
 *
 * Run from server/.
 */

require('dotenv').config({ path: __dirname + '/../.env' });

const fs = require('fs');
const path = require('path');
const { supabase } = require('../utils/supabaseDb');
const { postponeCourse, getCourseClasses } = require('../utils/coursePostponement');
const { generateCourseUnconfirmedEmail } = require('../email-templates/course-unconfirmed');
const { toYmd, addDays, weekdayName } = require('../utils/sgtDate');

const COURSE_IDENTIFIER = 'WT1009AM_JL6';
const EXECUTE = process.argv.includes('--execute');

const fmt = (ymd) => new Date(`${ymd}T12:00:00Z`)
  .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

async function loadEnrollments() {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_type, class_time, schedule_pattern, course_start_date, start_date, course_end_date, status, customers:student_id(first_name, last_name, email)')
    .eq('course_identifier', COURSE_IDENTIFIER);
  if (error) throw error;
  return data || [];
}

(async () => {
  const classes = await getCourseClasses(COURSE_IDENTIFIER);
  const enrollments = await loadEnrollments();

  if (classes.length === 0) throw new Error(`No classes for ${COURSE_IDENTIFIER}`);

  const oldStart = toYmd(classes[0].class_date);
  const projectedStart = addDays(oldStart, 7);
  const projectedEnd = addDays(toYmd(classes[classes.length - 1].class_date), 7);

  console.log(`=== ${COURSE_IDENTIFIER} ===`);
  console.log(`classes : ${classes.length}, all status=${[...new Set(classes.map(c => c.status))].join('/')}`);
  console.log(`dates   : ${oldStart} .. ${toYmd(classes[classes.length - 1].class_date)}`);
  console.log(`becomes : ${projectedStart} .. ${projectedEnd}  (${weekdayName(projectedStart)})`);
  console.log(`students: ${enrollments.length}`);
  for (const e of enrollments) {
    console.log(`  #${e.id} ${e.customers?.first_name} ${e.customers?.last_name} <${e.customers?.email}> status=${e.status}`);
  }

  if (classes.some(c => c.status === 'active')) {
    throw new Error('Refusing: some classes are already active — this cohort was confirmed by hand.');
  }

  const first = enrollments[0];
  const dayOfWeek = weekdayName(oldStart).charAt(0) + weekdayName(oldStart).slice(1).toLowerCase();

  const preview = generateCourseUnconfirmedEmail({
    courseType: first?.course_type || 'Wheelthrowing',
    dayOfWeek,
    startDate: fmt(oldStart),
    newStartDate: fmt(projectedStart),
    timeSlot: first?.class_time || '9:30 AM - 12:00 PM',
  });

  const previewPath = path.join(__dirname, '_preview-wt1009am.html');
  fs.writeFileSync(previewPath, preview.html);
  console.log(`\nSUBJECT : ${preview.subject}`);
  console.log(`PREVIEW : ${previewPath}`);

  if (!EXECUTE) {
    console.log('\nDRY RUN — nothing written, nothing sent. Re-run with --execute.');
    return;
  }

  // ── 1. Move the dates ──────────────────────────────────────────────────────
  const result = await postponeCourse({ courseIdentifier: COURSE_IDENTIFIER, weeks: 1 });
  console.log('\n=== POSTPONED ===');
  for (const m of result.movedClasses.slice().reverse()) {
    console.log(`  ${m.class_type}  ${m.old_date} -> ${m.new_date}`);
  }
  console.log(`  new range: ${result.newStartDate} .. ${result.newEndDate}`);

  // ── 2. Verify before telling anyone ────────────────────────────────────────
  const after = await getCourseClasses(COURSE_IDENTIFIER);
  const afterEnr = await loadEnrollments();
  const badDay = after.filter(c => weekdayName(c.class_date) !== 'THURSDAY');
  if (badDay.length > 0) {
    throw new Error(`Aborting before send: ${badDay.length} class(es) are no longer on a Thursday`);
  }
  if (toYmd(after[0].class_date) !== projectedStart) {
    throw new Error(`Aborting before send: expected first class ${projectedStart}, got ${toYmd(after[0].class_date)}`);
  }
  for (const e of afterEnr) {
    if (toYmd(e.course_start_date) !== projectedStart) throw new Error(`Enrollment ${e.id} start_date did not move`);
    if (toYmd(e.start_date) !== oldStart) throw new Error(`Enrollment ${e.id} lost its original start date`);
  }
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, class_instance_id')
    .in('class_instance_id', after.map(c => c.id));
  console.log(`  verified: ${after.length} classes all Thursday, ${afterEnr.length} enrollments updated, ${bookings?.length || 0} bookings intact`);

  // ── 3. Tell the students ───────────────────────────────────────────────────
  const { sendAndLogEmail } = require('../utils/emailService');
  const recipients = afterEnr.map(e => e.customers?.email).filter(Boolean);

  const { subject, html } = generateCourseUnconfirmedEmail({
    courseType: first?.course_type || 'Wheelthrowing',
    dayOfWeek,
    startDate: fmt(oldStart),
    newStartDate: fmt(result.newStartDate),
    timeSlot: first?.class_time || '9:30 AM - 12:00 PM',
  });

  const sendResult = await sendAndLogEmail({
    emailType: 'course_unconfirmed',
    courseIdentifier: COURSE_IDENTIFIER,
    subject,
    html,
    recipientEmails: recipients,
    sentBy: 'info@ves.sg',
    perRecipient: true,
  });

  console.log('\n=== EMAIL ===');
  console.log(`  to      : ${recipients.join(', ')}`);
  console.log(`  sent    : ${sendResult.sentCount || 0}/${recipients.length}`);
  if (sendResult.failedRecipients?.length) console.log(`  FAILED  : ${JSON.stringify(sendResult.failedRecipients)}`);
  console.log(`  message : ${sendResult.messageId || '(none)'}`);

  console.log('\nDone. Google Calendar sync was fired in the background.');
})().catch(err => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
