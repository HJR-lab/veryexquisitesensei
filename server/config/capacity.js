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

// Glazing is defined once, in utils/glazing.js — the marked flag or a WT cohort's
// final week. Required here so the ceiling below can read it; glazing.js has no
// dependency back on this file.
const { isGlazingClass } = require('../utils/glazing');

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

// Per-instructor room sizes, by course length and week.
//
// The numbers above are the studio's general rules. An instructor whose classes
// run at a different number gets it here, and here only — one entry per week
// that differs from what the general rules would give.
//
// DL runs the trimming weeks at the ordinary 10 rather than taking the wide
// room's 11, and closes at 12 rather than the glazing default of 14.
//
// This is the number a NEW class is CREATED at — initialRoomCapacity(). It is
// deliberately not applied to class_instances that already exist: a cohort part
// way through was sold and staffed at the number stored on its rows, and
// shrinking a room a student is already booked into is not a config change. So
// roomCapacity() keeps reading the stored value, and mid-run cohorts finish on
// the numbers they started with while the next cohort starts on these.
//
// A week not listed here follows the general rules untouched, and 7-week
// intermediate courses are excluded exactly as they are from WT_WIDE_WEEKS.
const INSTRUCTOR_WEEK_CAPS = Object.freeze({
  DL: Object.freeze({ 6: Object.freeze({ 4: 10, 5: 10, 6: 12 }) }),
});

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
 * The instructor code carried by a class code.
 * WT0507AM_DL6.4 → 'DL'. Anything unnumbered or non-WT → null.
 * @param {string} classType
 * @returns {string|null}
 */
function parseInstructorCode(classType) {
  const m = String(classType || '').match(/_([A-Za-z]+)\d+\.\d+$/);
  return m ? m[1].toUpperCase() : null;
}

/**
 * The room size this instructor runs this week at, if it differs from the
 * general rules. Read off the class code, so it answers for a row that does not
 * exist yet.
 * @param {object|string} classInstance  a class_instances row, or its class_type
 * @returns {number|null} null when the general rules apply
 */
function instructorRoomCap(classInstance) {
  const classType = typeof classInstance === 'string' ? classInstance : classInstance?.class_type;
  const wk = parseWtWeek(classType);
  if (!wk) return null;
  const code = parseInstructorCode(classType);
  const cap = code && INSTRUCTOR_WEEK_CAPS[code]?.[wk.total]?.[wk.week];
  return Number.isInteger(cap) ? cap : null;
}

/**
 * Is this one of the weeks that holds the wider room?
 * @param {object|string} classInstance  a class_instances row, or its class_type
 */
function hasWideRoom(classInstance) {
  const classType = typeof classInstance === 'string' ? classInstance : classInstance?.class_type;
  const wk = parseWtWeek(classType);
  if (!wk) return false;
  // An instructor with their own number for this week is not on the wide-room
  // rule at all — otherwise a DL 6.4 created at 10 would be widened straight
  // back to 11 by the very function that is meant to leave it alone.
  if (instructorRoomCap(classType) !== null) return false;
  return (WT_WIDE_WEEKS[wk.total] || []).includes(wk.week);
}

/**
 * The authoritative room cap for a class instance.
 *
 * Absolute, not additive, so it is safe to call on a row whose max_capacity has
 * already been widened to 11 — and a class an admin deliberately opened wider
 * still keeps its own number.
 *
 * A class whose instructor has their own number for the week is read straight
 * off its stored value and never adjusted — that number was decided when the
 * class was created (see initialRoomCapacity), and a cohort already running
 * keeps the room it was sold.
 *
 * @param {object} classInstance  needs class_type and max_capacity
 */
function roomCapacity(classInstance) {
  const stored = Number.isInteger(classInstance?.max_capacity) ? classInstance.max_capacity : null;
  const instructorCap = instructorRoomCap(classInstance);
  if (instructorCap !== null) return stored ?? instructorCap;
  if (hasWideRoom(classInstance)) return Math.max(stored || 0, WT_WIDE_ROOM_CAP);
  return stored || WT_ROOM_CAP;
}

/**
 * The max_capacity a class should be CREATED at.
 *
 * The only place INSTRUCTOR_WEEK_CAPS actually bites. Every other reader — the
 * booking gate, the roster, the calendar — goes through roomCapacity() and sees
 * whatever was stored here, so changing a number below moves the next cohort
 * without touching one that is already running.
 *
 * @param {string} classType  e.g. 'WT1209AM_DL6.6'
 * @param {number} proposed   what the caller would otherwise have stored
 */
function initialRoomCapacity(classType, proposed) {
  const instructorCap = instructorRoomCap(classType);
  if (instructorCap !== null) {
    return Number.isInteger(proposed) ? Math.min(proposed, instructorCap) : instructorCap;
  }
  return roomCapacity({ class_type: classType, max_capacity: proposed });
}

/**
 * The timeslot ceiling that applies when seating someone in THIS class.
 *
 * Weeks 4 and 5 of a 6-week WT run one over the general ceiling on purpose. It
 * is read off the class being booked, so whoever takes the 11th place in a 6.4
 * gets it — signup or make-up, the gate does not distinguish — while an
 * ordinary class in the same timeslot is still held to 10.
 *
 * A glazing class is not held to it at all. Nobody throws at a glazing class, so
 * neither the wheel count nor the throwing teaching load it stands for applies —
 * which is why every 6.6 instance is created at max_capacity 14. Until now the
 * ceiling overrode that 14 silently: the booking page showed the seats (it reads
 * max_capacity) while the server refused them with STUDIO_FULL, and a student
 * whose glazing sat in a slot with 10 booked could not move it anywhere. The
 * class's own capacity is the only gate a glazing class has ever wanted.
 */
function wheelCapFor(classInstance) {
  if (isGlazingClass(classInstance)) return roomCapacity(classInstance);
  // An instructor running their own room size is never blocked by the general
  // ceiling from filling it — the same relationship the wide weeks already have
  // with STUDIO_WHEELS. It cannot lower the ceiling below 10 either, so a DL
  // class sharing a timeslot is still counted like any other.
  if (instructorRoomCap(classInstance) !== null) {
    return Math.max(STUDIO_WHEELS, roomCapacity(classInstance));
  }
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
  INSTRUCTOR_WEEK_CAPS,
  parseWtWeek,
  parseInstructorCode,
  instructorRoomCap,
  initialRoomCapacity,
  hasWideRoom,
  roomCapacity,
  wheelCapFor,
};
