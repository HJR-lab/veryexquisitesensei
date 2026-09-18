const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateRestrictedCreditBooking } = require('../utils/restrictedClassCredits');

test('refuses an ordinary class when every remaining credit is glazing-only', () => {
  assert.deepEqual(
    evaluateRestrictedCreditBooking({
      remaining: 1,
      glazingOnly: 1,
      classInstance: { class_type: 'WT1709AM_DL6.2', is_glazing: false },
    }),
    { allowed: false, consumeGlazingOnly: false, unrestricted: 0 }
  );
});

test('allows 6.6 and consumes a glazing-only credit', () => {
  assert.deepEqual(
    evaluateRestrictedCreditBooking({
      remaining: 1,
      glazingOnly: 1,
      classInstance: { class_type: 'WT1709AM_DL6.6', is_glazing: false },
    }),
    { allowed: true, consumeGlazingOnly: true, unrestricted: 0 }
  );
});

test('allows 7.7 and consumes a glazing-only credit', () => {
  assert.equal(evaluateRestrictedCreditBooking({
    remaining: 1,
    glazingOnly: 1,
    classInstance: { class_type: 'WT1709AM_DL7.7', is_glazing: false },
  }).consumeGlazingOnly, true);
});

test('allows an explicitly marked HB glazing class', () => {
  assert.equal(evaluateRestrictedCreditBooking({
    remaining: 1,
    glazingOnly: 1,
    classInstance: { class_type: 'HBFRINT_LT', is_glazing: true },
  }).consumeGlazingOnly, true);
});

test('allows an ordinary class when an unrestricted credit remains', () => {
  assert.deepEqual(
    evaluateRestrictedCreditBooking({
      remaining: 2,
      glazingOnly: 1,
      classInstance: { class_type: 'WT1709AM_DL6.2', is_glazing: false },
    }),
    { allowed: true, consumeGlazingOnly: false, unrestricted: 1 }
  );
});

test('uses a glazing-only credit before an unrestricted credit on glazing classes', () => {
  assert.equal(evaluateRestrictedCreditBooking({
    remaining: 2,
    glazingOnly: 1,
    classInstance: { class_type: 'WT1709AM_DL6.6', is_glazing: false },
  }).consumeGlazingOnly, true);
});
