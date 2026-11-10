const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isIntermediateWTClass,
  isIntermediateEnrollment,
  evaluateIntermediateAccess,
  rescheduleNeedsIntermediateAccess,
  canTakeIntermediate,
} = require('../utils/intermediateLevel');

test('7-week WT weeks 7.1-7.6 are intermediate', () => {
  assert.equal(isIntermediateWTClass('WT2410AM_DL7.1'), true);
  assert.equal(isIntermediateWTClass({ class_type: 'WT2410AM_DL7.6' }), true);
});

test('7.7 is glazing, open to everyone', () => {
  assert.equal(isIntermediateWTClass('WT2410AM_DL7.7'), false);
});

test('6-week WT and HB classes are not intermediate', () => {
  assert.equal(isIntermediateWTClass('WT2810AM_JL6.3'), false);
  assert.equal(isIntermediateWTClass('HBFRINT_LT'), false);
  assert.equal(isIntermediateWTClass(''), false);
  assert.equal(isIntermediateWTClass(null), false);
});

test('a student with fewer than 3 completed courses and no intermediate course is locked out', () => {
  assert.equal(evaluateIntermediateAccess({ completedWTCourses: 2, liveEnrollments: [] }), false);
  assert.equal(evaluateIntermediateAccess({
    completedWTCourses: 0,
    liveEnrollments: [{ course_type: 'Wheelthrowing', course_identifier: 'WT2810AM_JL6', number_of_weeks: 6 }],
  }), false);
});

test('3 completed wheelthrowing courses unlocks intermediate', () => {
  assert.equal(evaluateIntermediateAccess({ completedWTCourses: 3 }), true);
});

test('a student already in an intermediate course may take intermediate make-ups', () => {
  assert.equal(evaluateIntermediateAccess({
    completedWTCourses: 1,
    liveEnrollments: [{ course_type: 'Wheelthrowing Intermediate', course_identifier: 'WT2410AM_DL7', number_of_weeks: 7 }],
  }), true);
  assert.equal(isIntermediateEnrollment({ course_type: 'Wheelthrowing', course_identifier: 'WT2410AM_DL7' }), true);
  assert.equal(isIntermediateEnrollment({ course_type: 'Handbuilding', course_identifier: 'HB4W', number_of_weeks: 4 }), false);
});

test('reschedule into intermediate needs access from a beginner, glazing or HB class', () => {
  assert.equal(rescheduleNeedsIntermediateAccess('WT2810AM_JL6.2', 'WT2410AM_DL7.3'), true);
  assert.equal(rescheduleNeedsIntermediateAccess('WT2810AM_JL6.6', 'WT2410AM_DL7.3'), true);
  assert.equal(rescheduleNeedsIntermediateAccess('HBFRINT_LT', 'WT2410AM_DL7.3'), true);
});

test('reschedule within intermediate, or into 7.7 glazing, needs no extra access', () => {
  assert.equal(rescheduleNeedsIntermediateAccess('WT2410AM_DL7.2', 'WT2410PM_DL7.2'), false);
  assert.equal(rescheduleNeedsIntermediateAccess('WT2810AM_JL6.6', 'WT2410AM_DL7.7'), false);
});

// Minimal fake of the supabase query builder for canTakeIntermediate.
function fakeSupabase({ completed = 0, historical = 0, live = [] }) {
  return {
    from(table) {
      const filters = {};
      const q = {
        select() { return q; },
        eq(k, v) { filters[k] = v; return q; },
        ilike() { return q; },
        in(k, v) { filters[k] = v; return Promise.resolve({ data: live }); },
        maybeSingle() { return Promise.resolve({ data: { historical_completed: historical } }); },
        then(resolve) { return resolve({ count: completed }); },
      };
      return q;
    },
  };
}

test('canTakeIntermediate adds historical completed courses', async () => {
  assert.equal(await canTakeIntermediate(fakeSupabase({ completed: 1, historical: 2 }), 's1'), true);
  assert.equal(await canTakeIntermediate(fakeSupabase({ completed: 1, historical: 1 }), 's1'), false);
});

test('canTakeIntermediate lets a current intermediate student through', async () => {
  assert.equal(await canTakeIntermediate(fakeSupabase({
    live: [{ course_type: 'Wheelthrowing Intermediate', course_identifier: 'WT2410AM_DL7', number_of_weeks: 7 }],
  }), 's1'), true);
});
