'use strict';

// coursePostponement pulls in supabaseDb, which builds the shared client at
// require time.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy';

const { test } = require('node:test');
const assert = require('node:assert');
const { addDays, toYmd, weekdayName } = require('../utils/sgtDate');

/**
 * The postponement itself is a database transaction and is exercised against
 * the real cohort. What is worth pinning here is the arithmetic underneath it,
 * because that is the part that was wrong in the endpoint for as long as the
 * endpoint existed and could only be caught in production.
 */

const THURSDAY_COHORT = [
  '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08', '2026-10-15',
];

test('CP-01: a postponed cohort keeps its weekday in every timezone the studio runs in', () => {
  // Railway is UTC, the studio laptops are SGT. The endpoint used to do
  // `new Date(class_date); setDate(getDate() + 7); toISOString()`, which reads
  // the shifted date back in the RUNTIME's zone: correct on Railway, and a day
  // early on any machine east of UTC. It would have moved this Thursday cohort
  // to a Wednesday.
  const original = process.env.TZ;
  try {
    for (const tz of ['UTC', 'Asia/Singapore', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      for (const date of THURSDAY_COHORT) {
        const moved = addDays(date, 7);
        assert.equal(weekdayName(moved), 'THURSDAY', `${tz}: ${date} + 7d landed on a ${weekdayName(moved)}`);
      }
    }
  } finally {
    process.env.TZ = original;
  }
});

test('CP-02: the buggy arithmetic really does break, so the fix is not cosmetic', () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Singapore';
    const buggy = new Date('2026-09-10T00:00:00');
    buggy.setDate(buggy.getDate() + 7);
    // Documents what was actually shipped: the old line is only right because
    // production happens to run UTC. Nothing enforced that.
    assert.notEqual(buggy.toISOString().split('T')[0], addDays('2026-09-10', 7));
  } finally {
    process.env.TZ = original;
  }
});

test('CP-03: shifting a whole course moves every class by exactly one week', () => {
  const shifted = THURSDAY_COHORT.map(d => addDays(d, 7));
  assert.deepEqual(shifted, [
    '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22',
  ]);
  // The new course_start_date is the old week 2 — which is why the cohort
  // resurfaces in checkUnconfirmedCourses a week later without a separate
  // weekly re-check.
  assert.equal(shifted[0], THURSDAY_COHORT[1]);
});

test('CP-04: a mid-course postponement leaves the earlier weeks alone', () => {
  // Postponing from week 4 onwards: weeks 1-3 keep their dates, so the course's
  // new outer dates have to be read from all six, not just the ones that moved.
  const cutoff = '2026-10-01';
  const after = THURSDAY_COHORT.map(d => (d >= cutoff ? addDays(d, 7) : d));

  assert.deepEqual(after.slice(0, 3), THURSDAY_COHORT.slice(0, 3));
  assert.equal(after.slice().sort()[0], '2026-09-10', 'start date must not move on a mid-course postponement');
  assert.equal(after.slice().sort().pop(), '2026-10-22');
});

test('CP-05: repeated postponement is stable and never drifts off the weekday', () => {
  let date = '2026-09-10';
  for (let round = 1; round <= 4; round++) {
    date = addDays(date, 7);
    assert.equal(weekdayName(date), 'THURSDAY', `round ${round} landed on a ${weekdayName(date)}`);
  }
  assert.equal(date, '2026-10-08');
});

test('CP-06: toYmd accepts every shape class_date comes back in', () => {
  // Supabase returns '2026-09-10T00:00:00' for these rows, the API sometimes
  // carries an offset, and scripts pass bare dates.
  for (const shape of ['2026-09-10', '2026-09-10T00:00:00', '2026-09-10T00:00:00+08:00', '2026-09-10 00:00:00']) {
    assert.equal(toYmd(shape), '2026-09-10', `failed on ${shape}`);
    assert.equal(addDays(shape, 7), '2026-09-17', `failed on ${shape}`);
  }
});
