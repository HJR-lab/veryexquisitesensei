/**
 * Which dates count as "inside the student's cohort" for a WT reschedule.
 *
 * Two sources: the student's own course dates (course_enrollments start/end)
 * and the admin-managed cohort_periods row that covers the class being moved.
 * Admin periods don't line up exactly with courses — a new course can start
 * before the previous period ends (Cohort 4 ran to 16 Oct; the 11 Oct course
 * started inside it). Looking up only the period by the old class's date then
 * pinned a brand-new student to the previous cohort and refused every class of
 * their own course after 16 Oct.
 *
 * So a date inside the student's own course is always in-window; the admin
 * period can only widen that, never narrow it.
 */

function dayOnly(value) {
  if (!value) return null;
  const s = String(value).split(/[T ]/)[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function within(day, start, end) {
  return !!(day && start && end && day >= start && day <= end);
}

function isWithinCohortWindow({ targetDate, enrollment, period }) {
  const day = dayOnly(targetDate);
  if (within(day, dayOnly(enrollment?.course_start_date), dayOnly(enrollment?.course_end_date))) return true;
  return within(day, dayOnly(period?.start_date), dayOnly(period?.end_date));
}

module.exports = { isWithinCohortWindow };
