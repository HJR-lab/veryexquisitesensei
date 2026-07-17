/**
 * Studio fee schedule — single source of truth.
 *
 * All amounts in SGD. These are the authoritative values enforced by the
 * backend (server/routes/classes.js, server/routes/credits.js) and exposed to
 * the frontend via `GET /api/policy/fees`, so the policy a student is shown and
 * the amount they are actually charged can never drift apart.
 *
 * If a fee changes, change it HERE and nowhere else.
 */
module.exports = {
  // $40 make-up class booked outside the student's cohort schedule
  // (final glazing classes are excluded).
  RESCHEDULE_OUT_OF_COHORT: 40,

  // $20 fee for missing a rescheduled make-up class — the slot could have
  // gone to another student.
  NO_SHOW: 20,

  // $40 per remaining class when a student pauses a course.
  PAUSE_PER_CLASS: 40,

  // $10 delivery order fee.
  DELIVERY: 10,
};
