'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { isWithinCohortWindow } = require('../utils/cohortWindow');

// Joanne's case (Oct 2026): course 11 Oct – 22 Nov, but admin Cohort 4 runs
// 29 Aug – 16 Oct and so covers her first class.
const enrollment = { course_start_date: '2026-10-11', course_end_date: '2026-11-22' };
const cohort4 = { name: 'Cohort 4', start_date: '2026-08-29', end_date: '2026-10-16' };

test('a class inside the student\'s own course is in-window even when an older cohort period covers the old class', () => {
  assert.equal(isWithinCohortWindow({ targetDate: '2026-10-29T00:00:00', enrollment, period: cohort4 }), true);
  assert.equal(isWithinCohortWindow({ targetDate: '2026-10-31', enrollment, period: cohort4 }), true);
  assert.equal(isWithinCohortWindow({ targetDate: '2026-11-22', enrollment, period: cohort4 }), true);
});

test('the admin cohort period still widens the window', () => {
  assert.equal(isWithinCohortWindow({ targetDate: '2026-10-01', enrollment, period: cohort4 }), true);
});

test('a class outside both the course and the period is out of window', () => {
  assert.equal(isWithinCohortWindow({ targetDate: '2026-11-29', enrollment, period: cohort4 }), false);
  assert.equal(isWithinCohortWindow({ targetDate: '2026-08-01', enrollment, period: null }), false);
});

test('no period falls back to the course dates', () => {
  assert.equal(isWithinCohortWindow({ targetDate: '2026-11-01', enrollment, period: null }), true);
});
