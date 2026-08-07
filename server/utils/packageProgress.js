// Package progress for multi-course packages (e.g. WT 6-week × 3 Course Package).
//
// A student can buy the SAME package more than once. Counting every package
// enrollment the student has ever held therefore overflows on the second
// purchase ("Course 4 of 3"). Position inside a package is instead read off the
// enrollment row itself: `package_courses_remaining` is written at creation time
// and means "courses left in this package AFTER this one", so
//
//   current course = package_total_courses - package_courses_remaining
//
// which restarts at 1 for each newly-purchased package. The lifetime count is
// kept only as a fallback for legacy rows written before that column existed.
const PACKAGE_TITLE_PATTERN = '%3 Course Package%';

/**
 * Compute package position for one enrollment.
 * Returns null when the enrollment is not part of a multi-course package.
 *
 * @param {object} supabase   Supabase client
 * @param {number} studentId
 * @param {object} enrollment Full course_enrollments row
 * @returns {Promise<{total:number,current:number,completed:number,remaining:number}|null>}
 */
async function getPackageProgress(supabase, studentId, enrollment) {
  const total = enrollment.package_total_courses;
  if (!total || total <= 1) return null;

  if (enrollment.package_courses_remaining != null) {
    const remaining = Math.max(0, Math.min(total - 1, enrollment.package_courses_remaining));
    const current = total - remaining;
    // The current course only counts as completed once its own status says so.
    const completed = enrollment.status === 'completed' ? current : current - 1;
    return { total, current, completed, remaining };
  }

  // Legacy fallback: rows predating package_courses_remaining. Counts every
  // package enrollment the student holds — correct only for a single package.
  const { data: pkgEnrollments } = await supabase
    .from('course_enrollments')
    .select('id, status')
    .eq('student_id', studentId)
    .ilike('course_title', PACKAGE_TITLE_PATTERN);

  const completed = (pkgEnrollments || []).filter(e => e.status === 'completed').length;
  const active = (pkgEnrollments || []).filter(e => e.status === 'active').length;
  const current = Math.min(total, completed + active);
  return { total, current, completed: Math.min(completed, total), remaining: Math.max(0, total - current) };
}

module.exports = { getPackageProgress, PACKAGE_TITLE_PATTERN };
