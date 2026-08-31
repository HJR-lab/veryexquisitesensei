/**
 * The handbuilding drop-in timetable — single source of truth.
 *
 * HB is not cohort-based. There is no course to schedule from and no enrolment
 * threshold to trip, so nothing in the WT pipeline ever creates an HB class.
 * From January to August 2026 the HB calendar was instead filled by hand, in
 * four bulk batches, the last of which ran out on 2026-08-31 — leaving 48 open
 * enrolments holding 165 unspent credits with nothing to book against, and no
 * error anywhere to say so. HB credits never expire, so nothing was forfeited;
 * the calendar simply went blank.
 *
 * The slots below are what those batches were creating, read back off the live
 * rows rather than reconstructed from memory. `utils/hbScheduleGenerator.js`
 * keeps the calendar filled to a rolling horizon from this table, so the
 * timetable is now a thing that is declared once and maintained, not a thing
 * somebody has to remember to re-run.
 *
 * To change the timetable, change it HERE and nowhere else. Adding a slot
 * starts filling it from the next matching weekday; removing one stops future
 * fills and leaves every already-created class alone.
 */

// How far ahead the calendar is kept filled. Roughly four months — long enough
// that students can plan a term and that a lapse is noticed with months of
// slack, short enough that a timetable change does not mean unwinding a year of
// rows.
const HB_HORIZON_DAYS = 122;

// One entry per weekly slot. `weekday` and the times are the identity of the
// slot; everything else is the shape of the row it creates.
//
// `room` is null for the evening slots because that is what the live rows hold —
// the studio has never assigned them a room, and writing one now would change
// what the calendar displays. Friday carries 'Studio A' for the same reason.
// Friday's 7pm does not collide with WT there: Studio A's Friday bookings are
// all 9:30 AM.
const HB_SLOTS = [
  {
    classType: 'HBMONNT_LT',
    weekday: 'MONDAY',
    startTime: '7:00pm',
    endTime: '9:00pm',
    instructor: 'Lynette Ting',
    room: null,
    maxCapacity: 8,
  },
  {
    classType: 'HBWEDNT_LT',
    weekday: 'WEDNESDAY',
    startTime: '7:00pm',
    endTime: '9:00pm',
    instructor: 'Lynette Ting',
    room: null,
    maxCapacity: 8,
  },
  {
    classType: 'HBFRINT_LT',
    weekday: 'FRIDAY',
    startTime: '7:00pm',
    endTime: '9:00pm',
    instructor: 'Lynette Ting',
    room: 'Studio A',
    maxCapacity: 8,
  },
  {
    classType: 'HBSATEV_LT',
    weekday: 'SATURDAY',
    startTime: '4:00pm',
    endTime: '6:00pm',
    instructor: 'Lynette Ting',
    room: null,
    maxCapacity: 8,
  },
];

// Dates the studio is shut. A slot falling on one of these is still created —
// as a CANCELLED row, carrying its reason — rather than skipped.
//
// Creating it is the point. A cancelled class shows on the studio calendar as
// 'HBFRINT_LT [CANCELLED]', which tells a student the studio knows about the
// date; a skipped one is indistinguishable from the calendar having run dry
// again, which is the exact failure this module exists to prevent. It also
// pins the date: the generator treats any existing row as taken, so a closure
// written here can never be quietly refilled as an active class.
//
// Add next year's holidays here and they are handled before anyone books them.
const HB_CLOSURES = [
  { date: '2026-12-25', reason: 'Christmas Day — studio closed' },
  { date: '2026-12-26', reason: 'Boxing Day — studio closed' },
  { date: '2026-12-31', reason: "New Year's Eve — studio closed" },
  { date: '2027-01-01', reason: "New Year's Day — studio closed" },
];

/** The closure covering a date, or null. */
function closureOn(ymd) {
  return HB_CLOSURES.find(c => c.date === ymd) || null;
}

module.exports = {
  HB_HORIZON_DAYS,
  HB_SLOTS,
  HB_CLOSURES,
  closureOn,
};
