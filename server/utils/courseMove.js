/**
 * Moving a student from one wheelthrowing cohort to another.
 *
 * The admin "Move to another course" button used to re-label the enrollment and
 * re-book the student, and nothing else. That left the student half-moved:
 *
 *   - the enrollment kept the old cohort's start/end dates and weekday, so
 *     countCohortSignups() still counted them in the old cohort and the
 *     reschedule window still pointed at the old dates;
 *   - the old bookings were hard-deleted, and a make-up that replaced one of
 *     them stayed booked in a third course;
 *   - neither cohort's cached current_enrollment changed;
 *   - a draft target cohort stayed draft even once the move took it past the
 *     opening threshold, and students only see draft classes once the cohort
 *     is active, so the move looked like it hadn't happened at all.
 *
 * planCourseMove() is the pure part: given what is in the database, it decides
 * what has to change. The route in routes/admin.js does the reads and writes.
 */

const { toYmd, weekdayName } = require('./sgtDate');
const { WT_SIGNUP_CAP } = require('../config/capacity');

/**
 * @param {object}   p
 * @param {Array}    p.fromClasses     source cohort class_instances ({id})
 * @param {Array}    p.toClasses       target cohort class_instances ({id, class_date, status})
 * @param {Array}    p.studentBookings the student's bookings ({id, class_instance_id, original_class_instance_id, status})
 * @param {number}   p.targetSignups   distinct students already enrolled in the target, not counting this one
 * @param {object}   [p.targetPeer]    another active enrollment in the target, to copy its dates/time from
 * @param {number}   [p.minToActivate] signups at which a draft cohort opens
 * @param {number}   [p.signupCap]     enrollment seats per cohort
 */
function planCourseMove({
  fromClasses = [], toClasses = [], studentBookings = [], targetSignups = 0,
  targetPeer = null, minToActivate = 4, signupCap = WT_SIGNUP_CAP,
}) {
  if (targetSignups >= signupCap) {
    return { ok: false, reason: 'full', message: `Target course already has ${targetSignups}/${signupCap} enrolled students` };
  }

  const fromIds = new Set(fromClasses.map(c => c.id));
  const toIds = new Set(toClasses.map(c => c.id));

  // Live bookings in the source cohort, plus make-ups booked elsewhere to
  // replace one of its classes: the new cohort gives the student a full set,
  // so those make-ups would be an extra class.
  const cancel = studentBookings.filter(b =>
    b.status === 'booked' && !toIds.has(b.class_instance_id) &&
    (fromIds.has(b.class_instance_id) || fromIds.has(b.original_class_instance_id)));

  const alreadyBooked = new Set(studentBookings
    .filter(b => b.status === 'booked' && toIds.has(b.class_instance_id))
    .map(b => b.class_instance_id));
  const book = toClasses.filter(c => !alreadyBooked.has(c.id)).map(c => c.id);

  const dates = toClasses.map(c => toYmd(c.class_date)).filter(Boolean).sort();
  const first = dates[0] || null;
  const last = dates[dates.length - 1] || null;
  const enrollmentUpdate = {
    course_start_date: targetPeer?.course_start_date || first,
    course_end_date: targetPeer?.course_end_date || last,
    schedule_pattern: targetPeer?.schedule_pattern || weekdayName(first),
  };
  if (targetPeer?.class_time) enrollmentUpdate.class_time = targetPeer.class_time;
  if (targetPeer?.start_date) enrollmentUpdate.start_date = targetPeer.start_date;
  if (targetPeer?.expected_end_date) enrollmentUpdate.expected_end_date = targetPeer.expected_end_date;

  const touchedClassIds = [...new Set([
    ...cancel.map(b => b.class_instance_id), ...book, ...alreadyBooked,
  ])];

  const signupsAfter = targetSignups + 1;
  const activate = signupsAfter >= minToActivate && toClasses.some(c => c.status === 'draft');

  return {
    ok: true,
    cancelBookingIds: cancel.map(b => b.id),
    bookClassIds: book,
    enrollmentUpdate,
    touchedClassIds,
    signupsAfter,
    activate,
  };
}

module.exports = { planCourseMove };
