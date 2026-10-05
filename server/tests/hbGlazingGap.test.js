'use strict';

// A handbuilding student's final class (4/4, 8/8) is their glazing class, so it
// must sit at least GLAZING_DRYING_GAP_DAYS after the class before it — the same
// kiln rule a WT cohort's glazing week follows. These run the real rule out of
// utils/glazing.js, the one the booking, makeup and reschedule gates call.

const { test } = require('node:test');
const assert = require('node:assert');

const {
  GLAZING_DRYING_GAP_DAYS,
  isHandbuildingEnrollment,
  hbEnrollmentTotal,
  hbFinalGlazingGapProblem,
  hbFinalGlazingBlockedRange,
} = require('../utils/glazing');

test('HBG-1: the gap is the same 6 days as wheelthrowing', () => {
  assert.strictEqual(GLAZING_DRYING_GAP_DAYS, 6);
});

test('HBG-2: a 4/4 class 5 days after 3/4 is refused, 6 days is allowed', () => {
  const dates = ['2026-10-01', '2026-10-08', '2026-10-15'];
  const tooClose = hbFinalGlazingGapProblem({ total: 4, dates, target: '2026-10-20' });
  assert.deepStrictEqual(tooClose, { secondLast: '2026-10-15', final: '2026-10-20', gap: 5 });
  assert.strictEqual(hbFinalGlazingGapProblem({ total: 4, dates, target: '2026-10-21' }), null);
});

test('HBG-3: an 8-credit enrollment checks 8/8 against 7/8', () => {
  const dates = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-10'];
  assert.ok(hbFinalGlazingGapProblem({ total: 8, dates, target: '2026-10-13' }));
  assert.strictEqual(hbFinalGlazingGapProblem({ total: 8, dates, target: '2026-10-16' }), null);
});

test('HBG-4: classes before the final one are free to sit close together', () => {
  // 3/4 three days after 2/4 is fine: only the glazing class needs the gap.
  assert.strictEqual(
    hbFinalGlazingGapProblem({ total: 4, dates: ['2026-10-01', '2026-10-08'], target: '2026-10-11' }),
    null);
});

test('HBG-5: booking out of order makes the latest existing class the final one', () => {
  // 1/4..3/4 on 1, 8, 20 Oct; booking 17 Oct turns 20 Oct into the glazing class
  // with only 3 days before it.
  const dates = ['2026-10-01', '2026-10-08', '2026-10-20'];
  const problem = hbFinalGlazingGapProblem({ total: 4, dates, target: '2026-10-17' });
  assert.deepStrictEqual(problem, { secondLast: '2026-10-17', final: '2026-10-20', gap: 3 });
  // Earlier than the second-last existing class: not this booking's pair.
  assert.strictEqual(hbFinalGlazingGapProblem({ total: 4, dates, target: '2026-10-05' }), null);
});

test('HBG-6: the same day as the previous class is a 0-day gap', () => {
  const problem = hbFinalGlazingGapProblem({ total: 4, dates: ['2026-10-01', '2026-10-08', '2026-10-15'], target: '2026-10-15T00:00:00+08:00' });
  assert.strictEqual(problem.gap, 0);
});

test('HBG-7: the blocked range is exactly the set of dates the gate refuses', () => {
  const cases = [
    { total: 4, dates: ['2026-10-01', '2026-10-08', '2026-10-15'] },
    { total: 4, dates: ['2026-10-01', '2026-10-13', '2026-10-15'] }, // prev inside the window
    { total: 4, dates: ['2026-10-01', '2026-10-08'] },               // final not next
    { total: 2, dates: ['2026-10-15'] },
    { total: 8, dates: ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-10'] },
  ];
  for (const { total, dates } of cases) {
    const range = hbFinalGlazingBlockedRange({ total, dates });
    for (let i = 0; i < 40; i++) {
      const d = new Date(Date.UTC(2026, 8, 25 + i)).toISOString().split('T')[0];
      const refused = !!hbFinalGlazingGapProblem({ total, dates, target: d });
      const hidden = !!range && d >= range.from && d <= range.to;
      assert.strictEqual(hidden, refused, `total ${total}, ${dates.join(',')}, target ${d}`);
    }
  }
});

test('HBG-8: only handbuilding enrollments carry the rule, and their size comes from credits', () => {
  assert.strictEqual(isHandbuildingEnrollment({ course_type: 'Handbuilding Beginner', number_of_weeks: 4 }), true);
  assert.strictEqual(isHandbuildingEnrollment({ course_type: 'Wheelthrowing Beginner', number_of_weeks: 6 }), false);
  assert.strictEqual(isHandbuildingEnrollment({ course_type: 'Handbuilding', number_of_weeks: 10 }), false);
  assert.strictEqual(hbEnrollmentTotal({ class_credits_allocated: 8, number_of_weeks: 8 }), 8);
  assert.strictEqual(hbEnrollmentTotal({ class_credits_allocated: null, number_of_weeks: 4 }), 4);
});
