// Beginner → intermediate level lock (owner rule).
//
// Intermediate wheelthrowing classes are the 7-week cohorts (class code ends
// _XX7.n, e.g. WT2410AM_DL7.3). A student may only take one — book it, or
// reschedule a make-up into it — once they have COMPLETED at least 3
// wheelthrowing courses. If they can't take it, it isn't on their calendar.
//
// "Completed" is completed course_enrollments rows (each package course is its
// own row) plus the pre-system customers.historical_completed figure. It is NOT
// customers.course_purchase_count: that counts purchases, the course in
// progress included, and jumps by 3 the moment a 3-course package is bought.
//
// A student already enrolled in an intermediate course is an intermediate
// student, so they may take other intermediate classes (e.g. a make-up) even
// if the system holds fewer than 3 completed courses for them.
//
// The final week (7.7) is a glazing session, not a throwing lesson, so any
// student may join it (owner, 6 Oct 2026).

const { isFinalWeekClassType } = require('./glazing');

const INTERMEDIATE_MIN_COMPLETED_COURSES = 3;
const INTERMEDIATE_LOCK_ERROR = `Intermediate classes require at least ${INTERMEDIATE_MIN_COMPLETED_COURSES} completed wheelthrowing courses. Please continue with beginner classes.`;

// Enrollment statuses that mean the student is (or is about to be) in the course.
const LIVE_ENROLLMENT_STATUSES = ['active', 'pending', 'paused', 'scheduled'];

// Accepts a class_instance row or a bare class_type string.
function isIntermediateWTClass(classInstanceOrType) {
  const type = typeof classInstanceOrType === 'string'
    ? classInstanceOrType
    : (classInstanceOrType?.class_type || '');
  if (!type.startsWith('WT')) return false;
  if (isFinalWeekClassType(type)) return false;
  const m = type.match(/(\d+)\.\d+$/);
  return !!m && parseInt(m[1], 10) === 7;
}

function isIntermediateEnrollment(enrollment) {
  if (!enrollment) return false;
  const type = (enrollment.course_type || '').toLowerCase();
  const ident = enrollment.course_identifier || '';
  if (type.includes('intermediate')) return true;
  if (ident.startsWith('WT') && /7$/.test(ident)) return true;
  return type.startsWith('wheel') && Number(enrollment.number_of_weeks) === 7;
}

// Pure rule, so it can be tested without a database.
function evaluateIntermediateAccess({ completedWTCourses = 0, liveEnrollments = [] }) {
  if (completedWTCourses >= INTERMEDIATE_MIN_COMPLETED_COURSES) return true;
  return liveEnrollments.some(isIntermediateEnrollment);
}

async function countCompletedWTCourses(supabase, studentId) {
  const [{ count }, { data: customer }] = await Promise.all([
    supabase
      .from('course_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('status', 'completed')
      .ilike('course_type', 'wheel%'),
    supabase
      .from('customers')
      .select('historical_completed')
      .eq('id', studentId)
      .maybeSingle(),
  ]);
  return (count || 0) + (customer?.historical_completed || 0);
}

async function canTakeIntermediate(supabase, studentId) {
  const [completedWTCourses, { data: liveEnrollments }] = await Promise.all([
    countCompletedWTCourses(supabase, studentId),
    supabase
      .from('course_enrollments')
      .select('course_type, course_identifier, number_of_weeks')
      .eq('student_id', studentId)
      .in('status', LIVE_ENROLLMENT_STATUSES),
  ]);
  return evaluateIntermediateAccess({ completedWTCourses, liveEnrollments: liveEnrollments || [] });
}

// Reschedule rule: moving INTO an intermediate class from anything that isn't
// already an intermediate class (a beginner class, a glazing week, an HB class
// on a 10-class package) needs intermediate access.
function rescheduleNeedsIntermediateAccess(oldClassType, newClassType) {
  return isIntermediateWTClass(newClassType) && !isIntermediateWTClass(oldClassType);
}

module.exports = {
  INTERMEDIATE_MIN_COMPLETED_COURSES,
  INTERMEDIATE_LOCK_ERROR,
  isIntermediateWTClass,
  isIntermediateEnrollment,
  evaluateIntermediateAccess,
  countCompletedWTCourses,
  canTakeIntermediate,
  rescheduleNeedsIntermediateAccess,
};
