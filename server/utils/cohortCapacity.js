/**
 * Cohort signup capacity — the gate that was missing.
 *
 * `checkSeatAvailability()` in bookingDb.js gates BOOKINGS against a class
 * instance's max_capacity (10 wheels: 8 signups + 2 make-ups). That gate works,
 * but it cannot see the difference between a 9th signup and a make-up student
 * using the 9th wheel, because nothing ever recorded the signup limit.
 *
 * This module counts signups at the enrollment level instead. Make-ups are
 * bookings, never enrollments, so they fall out of the count for free.
 *
 * A cohort is keyed the same way the continuation lookup keys it — start date
 * plus day plus time — because that tuple is what identifies "the Saturday 1pm
 * course starting 29 Aug" across enrollments that may disagree on identifier.
 */

const { supabase } = require('./supabaseDb');
const { WT_SIGNUP_CAP, signupSeverity } = require('../config/capacity');

/**
 * Distinct students enrolled in a cohort.
 *
 * Counts students, not enrollment rows: a duplicate-spot enrollment is a data
 * fault, and counting it twice would block a cohort that has a free chair.
 * Cancelled enrollments release their seat and are excluded.
 *
 * @param {object} key
 * @param {string} key.courseStartDate  YYYY-MM-DD
 * @param {string} key.schedulePattern  e.g. 'SATURDAY'
 * @param {string} key.classTime        e.g. '1:00 PM - 3:30 PM'
 * @returns {Promise<{count: number, studentIds: number[]}>}
 */
async function countCohortSignups({ courseStartDate, schedulePattern, classTime }) {
  if (!courseStartDate || !schedulePattern || !classTime) {
    return { count: 0, studentIds: [] };
  }

  const { data, error } = await supabase
    .from('course_enrollments')
    .select('student_id, status')
    .eq('course_start_date', courseStartDate)
    .eq('schedule_pattern', schedulePattern)
    .eq('class_time', classTime);

  if (error) {
    // Never guess a count. A caller that cannot read the roster must not be
    // allowed to conclude the cohort has room.
    throw new Error(`Could not count cohort signups: ${error.message}`);
  }

  const studentIds = [...new Set(
    (data || [])
      .filter(e => e.status !== 'cancelled')
      .map(e => e.student_id)
  )];

  return { count: studentIds.length, studentIds };
}

/**
 * A live, unused capacity grant for this student anywhere in this cohort.
 *
 * Grants are bound to a class instance, so a grant on any week of the cohort is
 * read as "an admin has deliberately seated this named person here" — the same
 * meaning bookingDb.js gives it, and the only sanctioned way past the cap.
 *
 * @param {number} studentId
 * @param {string} courseIdentifier  base identifier, e.g. 'WT2908PM_DL6'
 */
async function findCohortCapacityOverride(studentId, courseIdentifier) {
  if (!studentId || !courseIdentifier) return null;

  const base = String(courseIdentifier).split('.')[0];
  const { data: instances, error: ciErr } = await supabase
    .from('class_instances')
    .select('id')
    .like('class_type', `${base}.%`);

  if (ciErr || !instances || instances.length === 0) return null;

  const { data, error } = await supabase
    .from('capacity_overrides')
    .select('*')
    .in('class_instance_id', instances.map(c => c.id))
    .eq('student_id', studentId)
    .is('revoked_at', null)
    .is('consumed_at', null)
    .limit(1);

  // A missing table (feature not migrated yet) must not block enrollment.
  if (error && error.code !== 'PGRST116') {
    console.error('cohort capacity_overrides lookup failed:', error.message);
    return null;
  }
  return (data && data[0]) || null;
}

/**
 * Whether one more student may be ENROLLED into a cohort.
 *
 * Only for discretionary paths — the Continue button, manual admin placement —
 * where a refusal is a real choice. Order-driven enrollments must never be run
 * through this: the customer has already paid, and refusing them strands a
 * paying student. Those are reported after the fact instead.
 *
 * Existing over-cap cohorts are tolerated, not unwound. This gate only ever
 * stops the NEXT signup.
 *
 * @param {object} key      as countCohortSignups, plus courseIdentifier
 * @param {number} studentId
 * @returns {Promise<{allowed: boolean, reason: string|null, signups: number, cap: number, severity: string, override: object|null}>}
 */
async function checkCohortSignupCapacity(key, studentId) {
  const { count, studentIds } = await countCohortSignups(key);
  const cap = WT_SIGNUP_CAP;

  // Already in the cohort — this is not a new signup, so the cap does not apply.
  // (Callers still reject duplicates separately; this just avoids a confusing
  // "cohort full" when the real answer is "already enrolled".)
  if (studentIds.includes(studentId)) {
    return { allowed: true, reason: null, signups: count, cap, severity: signupSeverity(count), override: null };
  }

  if (count < cap) {
    return { allowed: true, reason: null, signups: count, cap, severity: signupSeverity(count), override: null };
  }

  const override = await findCohortCapacityOverride(studentId, key.courseIdentifier);
  if (override) {
    return { allowed: true, reason: null, signups: count, cap, severity: signupSeverity(count), override };
  }

  return {
    allowed: false,
    reason: 'COHORT_SIGNUP_CAP',
    signups: count,
    cap,
    severity: signupSeverity(count),
    override: null,
  };
}

module.exports = {
  countCohortSignups,
  findCohortCapacityOverride,
  checkCohortSignupCapacity,
};
