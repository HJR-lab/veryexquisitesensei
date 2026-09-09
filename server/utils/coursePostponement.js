/**
 * Postponing a cohort.
 *
 * A wheelthrowing cohort that has not reached its minimum by the time it is due
 * to start gets pushed back a week, on the same weekday and at the same time,
 * and keeps being pushed until enough students buy in. Two callers do this: the
 * admin does it by hand from AdminClasses, and cohortAutoProcessor does it three
 * days out. They used to be unrelated — the admin endpoint moved dates and sent
 * nothing, the auto path sent mail and moved nothing — so the email promised a
 * postponement that only happened if someone remembered to perform it. Both go
 * through postponeCourse() now.
 *
 * Three things have to move together or the cohort comes apart:
 *
 *   class_instances.class_date   the classes themselves
 *   course_enrollments dates     what the student's dashboard and the T-3 check read
 *   Google Calendar              what the studio and the instructor read
 *
 * course_start_date is what checkUnconfirmedCourses() keys on, so leaving it
 * behind means the cohort is examined once and never again — it would be pushed
 * to the 17th and then silently forgotten. Moving it costs something, though:
 * the Shopify variant still advertises the ORIGINAL date, so a later buyer
 * arrives holding 10 Sep and no longer matches the cohort that now says 17 Sep.
 * The original date is preserved in course_enrollments.start_date (an unused
 * column) for exactly that lookup — see findCohortEnrollmentsFlexible.
 */

const { supabase } = require('./supabaseDb');
const { toYmd, addDays } = require('./sgtDate');

/**
 * Every class instance belonging to a course, oldest first.
 * class_type is `${courseIdentifier}.${weekNumber}`, e.g. WT1009AM_JL6.3.
 */
async function getCourseClasses(courseIdentifier) {
  const { data, error } = await supabase
    .from('class_instances')
    .select('*')
    .like('class_type', `${courseIdentifier}.%`)
    .order('class_date', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Push a course's classes back by whole weeks, from one class onwards.
 *
 * @param {string}  courseIdentifier e.g. 'WT1009AM_JL6'
 * @param {number} [fromClassId]     shift this class and everything after it
 * @param {string} [fromDate]        ...or shift from this calendar date onwards
 *                                   (defaults to the whole course)
 * @param {number} [weeks=1]
 * @returns {Promise<{courseIdentifier, weeks, movedClasses, newStartDate, newEndDate, originalStartDate}>}
 */
async function postponeCourse({ courseIdentifier, fromClassId = null, fromDate = null, weeks = 1 }) {
  const shiftWeeks = Number(weeks) || 1;
  if (shiftWeeks < 1) throw new Error('weeks must be at least 1');

  const allClasses = await getCourseClasses(courseIdentifier);
  if (allClasses.length === 0) {
    throw new Error(`No class instances found for ${courseIdentifier}`);
  }

  // Where to start shifting from. An explicit class wins; otherwise a date;
  // otherwise the whole course moves.
  let cutoff;
  if (fromClassId != null) {
    const fromClass = allClasses.find(c => c.id === Number(fromClassId));
    if (!fromClass) throw new Error(`fromClassId ${fromClassId} is not part of ${courseIdentifier}`);
    cutoff = toYmd(fromClass.class_date);
  } else if (fromDate) {
    cutoff = toYmd(fromDate);
  } else {
    cutoff = toYmd(allClasses[0].class_date);
  }

  const toMove = allClasses.filter(c => toYmd(c.class_date) >= cutoff);
  if (toMove.length === 0) {
    throw new Error(`No classes on or after ${cutoff} in ${courseIdentifier}`);
  }

  // (class_date, start_time, room) is unique, and a cohort keeps its weekday and
  // room, so shifting week 2 onto week 3's slot collides with week 3 while week 3
  // still sits there. Moving the latest class first keeps every intermediate
  // state legal.
  const ordered = [...toMove].sort((a, b) => toYmd(b.class_date).localeCompare(toYmd(a.class_date)));

  const days = shiftWeeks * 7;
  const movedClasses = [];

  for (const cls of ordered) {
    const oldDate = toYmd(cls.class_date);
    // addDays works on YYYY-MM-DD via UTC arithmetic. The obvious
    // `new Date(class_date); setDate(+7); toISOString()` reads the date back in
    // the RUNTIME's zone and lands a day early on any machine east of UTC — the
    // trap sgtDate.js exists to close.
    const newDate = addDays(oldDate, days);

    const { error } = await supabase
      .from('class_instances')
      .update({ class_date: newDate, updated_at: new Date().toISOString() })
      .eq('id', cls.id);

    if (error) throw new Error(`Failed to move class ${cls.id}: ${error.message}`);

    movedClasses.push({ id: cls.id, class_type: cls.class_type, old_date: oldDate, new_date: newDate });
  }

  // The course's new outer dates, read from every class the course has now —
  // not just the ones that moved, since a mid-course postponement leaves the
  // earlier weeks where they were.
  const remaining = allClasses.map(c => {
    const moved = movedClasses.find(m => m.id === c.id);
    return moved ? moved.new_date : toYmd(c.class_date);
  });
  const newStartDate = remaining.slice().sort()[0];
  const newEndDate = remaining.slice().sort().pop();

  const { data: enrollments, error: enrErr } = await supabase
    .from('course_enrollments')
    .select('id, course_start_date, start_date')
    .eq('course_identifier', courseIdentifier);

  if (enrErr) throw new Error(`Failed to read enrollments for ${courseIdentifier}: ${enrErr.message}`);

  let originalStartDate = null;

  for (const enrollment of enrollments || []) {
    // Stamp the purchased start date once, the first time this cohort is ever
    // postponed. On later rounds it already holds the true original and must
    // not be overwritten with the intermediate one.
    const original = toYmd(enrollment.start_date) || toYmd(enrollment.course_start_date);
    originalStartDate = originalStartDate || original;

    const { error } = await supabase
      .from('course_enrollments')
      .update({
        start_date: original,
        course_start_date: newStartDate,
        course_end_date: newEndDate,
        expected_end_date: newEndDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', enrollment.id);

    if (error) throw new Error(`Failed to move enrollment ${enrollment.id}: ${error.message}`);
  }

  // Fire-and-forget: syncClassInstance re-reads the row by id, so it picks up
  // the date we just wrote. A calendar that fails to move is a cosmetic problem;
  // failing the whole postponement over it is not an improvement.
  try {
    const calendarSync = require('./calendarSync');
    for (const m of movedClasses) {
      calendarSync.syncClassInstance(m.id).catch(() => {});
    }
  } catch (e) { /* calendar unavailable — dates are already correct in the DB */ }

  console.log(
    `[Postpone] ${courseIdentifier}: moved ${movedClasses.length} class(es) by ${shiftWeeks} week(s) ` +
    `→ ${newStartDate}..${newEndDate} (${(enrollments || []).length} enrollment(s) updated)`
  );

  return {
    courseIdentifier,
    weeks: shiftWeeks,
    movedClasses,
    newStartDate,
    newEndDate,
    originalStartDate,
    enrollmentsUpdated: (enrollments || []).length,
  };
}

module.exports = { postponeCourse, getCourseClasses };
