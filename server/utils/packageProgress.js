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
    const remainingAfterThis = Math.max(0, Math.min(total - 1, enrollment.package_courses_remaining));
    const current = total - remainingAfterThis;
    // The current course only counts as completed once its own status says so.
    const completed = enrollment.status === 'completed' ? current : current - 1;

    // "Remaining" means courses still to be PLACED. A later course of this same
    // package that already exists is placed, even when it sits in a different
    // slot — Mitchell Chan and Sarah Ong moved course 3 to the Sat AM
    // Intermediate while course 2 ran Sat PM, and their course-2 card kept
    // offering "Enroll in Next Course → WT1010PM_DL6", which would have made a
    // fourth course. current/completed stay tied to THIS row.
    let placedLater = 0;
    if (remainingAfterThis > 0 && enrollment.shopify_order_id && enrollment.course_start_date) {
      const { data: later } = await supabase
        .from('course_enrollments')
        .select('id')
        .eq('student_id', studentId)
        .eq('shopify_order_id', enrollment.shopify_order_id)
        .eq('package_total_courses', total)
        .neq('status', 'cancelled')
        .gt('course_start_date', enrollment.course_start_date);
      placedLater = (later || []).length;
    }
    const remaining = Math.max(0, remainingAfterThis - placedLater);
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
