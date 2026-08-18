/**
 * Cohort capacity rules — single source of truth.
 *
 * Two different numbers govern a wheelthrowing cohort, and conflating them is
 * what let a 9th student into WT2908PM_DL6 unnoticed:
 *
 *   SIGNUP cap (here)                  — how many students may ENROL in a cohort.
 *   class_instances.max_capacity (10)  — how many may BE IN THE ROOM on the day,
 *                                        i.e. signups plus make-ups. Read it
 *                                        through roomCapacity(), which knows
 *                                        the weeks that hold one more.
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

// Throwing students a timeslot may hold, counted across every class_instance
// that shares it.
//
// The studio has 12 wheels, not 10. This ceiling is about how many people one
// instructor can actually teach at once, not about hardware — so it is a policy
// number that happens to sit below the wheel count, and raising it is a
// deliberate decision rather than a matter of buying a wheel.
const STUDIO_WHEELS = 10;

// Room cap for an ordinary WT class instance: 8 signups + 2 make-ups.
const WT_ROOM_CAP = 10;

// Make-up seats in an ordinary week — the gap between the signup cap and the
// room cap, named so it stops being an unexplained "2" in three files.
const WT_MAKEUP_SEATS = 2;

// Weeks 4 and 5 of a 6-week WT course take a THIRD make-up: 8 + 3 = 11.
//
// Those two weeks are trimming. Trimming needs far less instructor attention
// than throwing does, so an eleventh student fits the teaching load even though
// the general ceiling is 10 — and the studio has the wheel for them either way.
// The allowance is read off the class being seated, so it belongs to the 6.4 and
// 6.5 classes alone: another class sharing that timeslot is still bound by
// STUDIO_WHEELS.
//
// 11 is a trial. If it holds, the next step is 12 (the real wheel count), which
// is a change to WT_EXTRA_ROOM_CAP here and nowhere else.
const WT_EXTRA_MAKEUP_WEEKS = Object.freeze({ 6: [4, 5] });
const WT_EXTRA_MAKEUP_SEATS = 3;
const WT_EXTRA_ROOM_CAP = 11;

/**
 * Read the week indicator off a class code.
 * WT0507AM_DL6.4 → { total: 6, week: 4 }. Non-WT or unnumbered codes → null.
 * @param {string} classType
 * @returns {{total: number, week: number}|null}
 */
function parseWtWeek(classType) {
  const code = String(classType || '');
  if (!/^WT/i.test(code)) return null;
  const m = code.match(/(\d+)\.(\d+)$/);
  if (!m) return null;
  return { total: parseInt(m[1], 10), week: parseInt(m[2], 10) };
}

/**
 * Does this class carry the third make-up seat?
 * @param {object|string} classInstance  a class_instances row, or its class_type
 */
function hasExtraMakeupSeat(classInstance) {
  const classType = typeof classInstance === 'string' ? classInstance : classInstance?.class_type;
  const wk = parseWtWeek(classType);
  if (!wk) return false;
  return (WT_EXTRA_MAKEUP_WEEKS[wk.total] || []).includes(wk.week);
}

/**
 * How many make-up seats this class holds — 3 on a 6-week WT's weeks 4 and 5,
 * 2 everywhere else.
 */
function makeupSeats(classInstance) {
  return hasExtraMakeupSeat(classInstance) ? WT_EXTRA_MAKEUP_SEATS : WT_MAKEUP_SEATS;
}

/**
 * The authoritative room cap for a class instance.
 *
 * Absolute, not additive, so it is safe to call on a row whose max_capacity has
 * already been widened to 11 — and a class an admin deliberately opened wider
 * still keeps its own number.
 *
 * @param {object} classInstance  needs class_type and max_capacity
 */
function roomCapacity(classInstance) {
  const stored = Number.isInteger(classInstance?.max_capacity) ? classInstance.max_capacity : null;
  if (hasExtraMakeupSeat(classInstance)) return Math.max(stored || 0, WT_EXTRA_ROOM_CAP);
  return stored || WT_ROOM_CAP;
}

/**
 * The wheel ceiling that applies when seating someone in THIS class.
 *
 * Weeks 4 and 5 of a 6-week WT run one over the wheel count on purpose. The
 * allowance is read off the class being booked, so a make-up into a 6.4 gets
 * the 11th place while an ordinary class in the same timeslot does not.
 */
function wheelCapFor(classInstance) {
  return hasExtraMakeupSeat(classInstance) ? WT_EXTRA_ROOM_CAP : STUDIO_WHEELS;
}

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
  STUDIO_WHEELS,
  WT_ROOM_CAP,
  WT_MAKEUP_SEATS,
  WT_EXTRA_MAKEUP_WEEKS,
  WT_EXTRA_MAKEUP_SEATS,
  WT_EXTRA_ROOM_CAP,
  parseWtWeek,
  hasExtraMakeupSeat,
  makeupSeats,
  roomCapacity,
  wheelCapFor,
};
