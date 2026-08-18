/**
 * Cohort capacity rules — single source of truth.
 *
 * Two different numbers govern a wheelthrowing cohort, and conflating them is
 * what let a 9th student into WT2908PM_DL6 unnoticed:
 *
 *   SIGNUP cap (here)                  — how many students may ENROL in a cohort.
 *   class_instances.max_capacity (10)  — how many may BE IN THE ROOM on the day,
 *                                        i.e. signups plus make-ups, one per wheel.
 *
 * The booking-level cap has always existed and is enforced by
 * `checkSeatAvailability()` in utils/bookingDb.js. The signup cap did not exist
 * anywhere in the database — every WT class instance is created at
 * max_capacity 10 — so nothing could tell a 9th signup apart from a legitimate
 * make-up using the 9th wheel.
 *
 * Do NOT "fix" that by lowering max_capacity to 8. The 9th and 10th wheels
 * belong to make-ups; taking them away would break rescheduling.
 *
 * If a capacity changes, change it HERE and nowhere else.
 */

// Students who may enrol in a WT cohort. The studio lists this many seats for
// sale (less any withheld for continuing package students), so exceeding it
// means a seat was sold or granted that was never meant to exist.
const WT_SIGNUP_CAP = 8;

// A cohort that has slipped to this many signups is still workable — 9 signups
// plus 1 make-up still fits the 10 wheels — but it should never have happened,
// so it is reported rather than tolerated silently.
const WT_SIGNUP_TOLERATED = 9;

// At this point every wheel is committed to a signup and the cohort can no
// longer absorb a single make-up.
const WT_SIGNUP_CRITICAL = 10;

/**
 * Severity of a cohort's signup count, for reporting.
 * @param {number} signups
 * @returns {'ok'|'over'|'critical'}
 */
function signupSeverity(signups) {
  if (signups >= WT_SIGNUP_CRITICAL) return 'critical';
  if (signups > WT_SIGNUP_CAP) return 'over';
  return 'ok';
}

module.exports = {
  WT_SIGNUP_CAP,
  WT_SIGNUP_TOLERATED,
  WT_SIGNUP_CRITICAL,
  signupSeverity,
};
