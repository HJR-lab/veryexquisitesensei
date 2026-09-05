'use strict';

// The 10-class package pays for exactly two glazing classes: class 6 (its WT
// cohort's own 6.6) and class 10 (the flex glazing that closes it). These tests
// run the real rule out of utils/glazing.js — the same function the booking gate
// in routes/classes.js calls — so a change to one cannot pass while the other
// keeps the old behaviour.

const { test } = require('node:test');
const assert = require('node:assert');

const {
  PACKAGE_COHORT_GLAZING_POSITION,
  packageGlazingPositions,
  isAllowedGlazingPosition,
  isGlazingClass,
} = require('../utils/glazing');

test('GP-1: a 10-class package glazes at class 6 and class 10, nowhere else', () => {
  assert.deepStrictEqual(packageGlazingPositions(10), [6, 10]);

  const allowed = [];
  for (let position = 1; position <= 10; position++) {
    if (isAllowedGlazingPosition(position, 10)) allowed.push(position);
  }
  assert.deepStrictEqual(allowed, [6, 10]);
});

test('GP-2: the flex classes either side of the cohort are refused', () => {
  // 7, 8 and 9 are the ones this rule exists to stop: booking a glazing there
  // fires work that has not been made yet and takes a capped glazing seat.
  for (const position of [7, 8, 9]) {
    assert.strictEqual(isAllowedGlazingPosition(position, 10), false,
      `class ${position} must not be glazing`);
  }
  // ...and so is anything inside the cohort before its final week.
  for (const position of [1, 2, 3, 4, 5]) {
    assert.strictEqual(isAllowedGlazingPosition(position, 10), false,
      `class ${position} must not be glazing`);
  }
});

test('GP-3: the cohort position is 6 and the closing position follows the total', () => {
  assert.strictEqual(PACKAGE_COHORT_GLAZING_POSITION, 6);

  // A package sold at another length still ends on glazing rather than losing
  // the closing position entirely.
  assert.deepStrictEqual(packageGlazingPositions(12), [6, 12]);
  assert.strictEqual(isAllowedGlazingPosition(12, 12), true);
  assert.strictEqual(isAllowedGlazingPosition(10, 12), false);
});

test('GP-4: a package whose total IS the cohort length has one glazing, not a duplicate', () => {
  assert.deepStrictEqual(packageGlazingPositions(6), [6]);
  assert.strictEqual(isAllowedGlazingPosition(6, 6), true);
});

test('GP-5: a missing or nonsense total falls back to a 10-class package', () => {
  // The gate resolves `package_total_classes || number_of_weeks || 10`, but a
  // null slipping through must not widen the rule to every position.
  for (const total of [null, undefined, 0, -3]) {
    assert.deepStrictEqual(packageGlazingPositions(total), [6, 10]);
    assert.strictEqual(isAllowedGlazingPosition(8, total), false);
  }
});

test('GP-6: the gate only fires on classes that really are glazing', () => {
  // Both routes call isGlazingClass first, so anything it calls ordinary is
  // never position-checked at all.
  assert.strictEqual(isGlazingClass({ class_type: 'WT2507AM_DL6.6' }), true);
  assert.strictEqual(isGlazingClass({ class_type: 'HBFRINT_LT', is_glazing: true }), true);
  assert.strictEqual(isGlazingClass({ class_type: 'WT2507AM_DL6.3' }), false);
  assert.strictEqual(isGlazingClass({ class_type: 'HBFRINT_LT' }), false);
});
