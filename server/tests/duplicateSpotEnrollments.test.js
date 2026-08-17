'use strict';

// anomalyProbe loads the shared Supabase client at require time.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy';

const { test } = require('node:test');
const assert = require('node:assert');
const { findDuplicateSpots } = require('../utils/anomalyProbe');

const enr = (id, over) => ({
  id,
  student_id: 1,
  shopify_order_id: 'ORDER1',
  shopify_line_item_id: 'LINE1',
  course_identifier: 'WT0101AM_DL6',
  customers: { first_name: 'Test', last_name: 'Student' },
  ...over,
});

const counts = pairs => new Map(pairs);

test('flags the phantom re-created spot even when the keys look unrelated', () => {
  // The real April case: a hand-repaired spot keyed 'MANUAL-DUP', then a deep
  // re-sync creating the same spot again under the per-unit key it expected.
  const rows = [
    enr(5292, { shopify_line_item_id: 'MANUAL-DUP', course_identifier: 'WT1604NT_JL6' }),
    enr(5318, { shopify_line_item_id: '15271763345566-2', course_identifier: null }),
  ];
  const findings = findDuplicateSpots(rows, counts([[5292, 6]]));

  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].enrollment_id, 5318);
  assert.strictEqual(findings[0].type, 'duplicate_spot_enrollment');
});

test('ignores a 3 Course Package — distinct cohorts, each with bookings', () => {
  const rows = [
    enr(5096, { shopify_line_item_id: '15131202125982', course_identifier: 'WT2802PM_DL6' }),
    enr(5272, { shopify_line_item_id: '15131202125982-C2', course_identifier: 'WT1104PM_DL6' }),
    enr(5350, { shopify_line_item_id: '15131202125982-C2-C3', course_identifier: 'WT2305PM_DL6' }),
  ];
  const findings = findDuplicateSpots(rows, counts([[5096, 6], [5272, 6], [5350, 6]]));
  assert.deepStrictEqual(findings, []);
});

test('ignores two different products bought on one order', () => {
  const rows = [
    enr(1, { shopify_line_item_id: 'LINE1', course_identifier: 'WT0101AM_DL6' }),
    enr(2, { shopify_line_item_id: 'LINE2', course_identifier: 'HB0101AM_DL4' }),
  ];
  assert.deepStrictEqual(findDuplicateSpots(rows, counts([[1, 6], [2, 4]])), []);
});

test('flags two enrollments sitting in the same cohort', () => {
  const rows = [
    enr(4770, { shopify_line_item_id: '14992255385758-2' }),
    enr(4801, { shopify_line_item_id: '14992255385758' }),
  ];
  const findings = findDuplicateSpots(rows, counts([[4770, 6], [4801, 6]]));
  assert.strictEqual(findings.length, 2);
  assert.ok(findings.every(f => /same cohort|twice/.test(f.details)));
});

test('does not flag the two spots of a qty-2 order — different students', () => {
  const rows = [
    enr(5450, { student_id: 3114, shopify_line_item_id: '15668268662942' }),
    enr(5451, { student_id: 3119, shopify_line_item_id: '15668268662942-2' }),
  ];
  assert.deepStrictEqual(findDuplicateSpots(rows, counts([[5450, 6], [5451, 6]])), []);
});

test('a lone unassigned enrollment is not a duplicate', () => {
  const rows = [enr(9, { course_identifier: null })];
  assert.deepStrictEqual(findDuplicateSpots(rows, counts([])), []);
});
