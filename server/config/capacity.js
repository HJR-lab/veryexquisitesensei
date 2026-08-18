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

// Room cap for an ordinary WT class instance. It usually fills as 8 signups plus
// 2 make-ups, but that split is DESCRIPTIVE, not a rule: make-ups have no
// allowance of their own and compete for the same seats as everyone else. The
// only question a booking asks is whether the room is under its cap.
const WT_ROOM_CAP = 10;

// Weeks 4 and 5 of a 6-week WT course hold 11 instead.
//
// Those two weeks are trimming, which needs far less instructor attention than
// throwing does, so an eleventh student fits the teaching load even though the
// general ceiling is 10 — and the studio has the wheel for them either way.
//
// The extra place is not earmarked for a make-up. 6 signups and 5 make-ups is
// as valid as 8 and 3; 11 in the room is the whole rule.
//
// It is read off the class being seated, so it belongs to the 6.4 and 6.5
// classes alone: another class sharing that timeslot is still bound by
// STUDIO_WHEELS.
//
// 11 is a trial. If it holds, the next step is 12 (the real wheel count), which
// is a change to WT_WIDE_ROOM_CAP here and nowhere else.
const WT_WIDE_WEEKS = Object.freeze({ 6: [4, 5] });
const WT_WIDE_ROOM_CAP = 11;

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
 * Is this one of the weeks that holds the wider room?
 * @param {object|string} classInstance  a class_instances row, or its class_type
 */
function hasWideRoom(classInstance) {
  const classType = typeof classInstance === 'string' ? classInstance : classInstance?.class_type;
  const wk = parseWtWeek(classType);
  if (!wk) return false;
  return (WT_WIDE_WEEKS[wk.total] || []).includes(wk.week);
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
  if (hasWideRoom(classInstance)) return Math.max(stored || 0, WT_WIDE_ROOM_CAP);
  return stored || WT_ROOM_CAP;
}

/**
 * The timeslot ceiling that applies when seating someone in THIS class.
 *
 * Weeks 4 and 5 of a 6-week WT run one over the general ceiling on purpose. It
 * is read off the class being booked, so whoever takes the 11th place in a 6.4
 * gets it — signup or make-up, the gate does not distinguish — while an
 * ordinary class in the same timeslot is still held to 10.
 */
function wheelCapFor(classInstance) {
  return hasWideRoom(classInstance) ? WT_WIDE_ROOM_CAP : STUDIO_WHEELS;
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
  WT_WIDE_WEEKS,
  WT_WIDE_ROOM_CAP,
  parseWtWeek,
  hasWideRoom,
  roomCapacity,
  wheelCapFor,
};
