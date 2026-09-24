'use strict';

// "Remaining" on a package enrollment means courses still to be PLACED. A later
// course of the same package that already exists counts as placed wherever it
// sits — otherwise the course-2 card offers "Enroll in Next Course" to a
// student whose course 3 is booked in another slot, and clicking it makes a
// fourth course (Mitchell Chan / Sarah Ong, 24/09/26).

const { test } = require('node:test');
const assert = require('node:assert');
const { getPackageProgress } = require('../utils/packageProgress');

// Minimal stand-in for the supabase query builder: records filters and
// resolves to whatever rows match them.
function fakeSupabase(rows) {
  return {
    from() {
      const filters = [];
      const q = {
        select() { return q; },
        eq(col, val) { filters.push(r => r[col] === val); return q; },
        neq(col, val) { filters.push(r => r[col] !== val); return q; },
        gt(col, val) { filters.push(r => r[col] > val); return q; },
        ilike() { return q; },
        then(resolve) { resolve({ data: rows.filter(r => filters.every(f => f(r))) }); },
      };
      return q;
    },
  };
}

const course2 = {
  id: 2, student_id: 7, shopify_order_id: 'O1', package_total_courses: 3,
  package_courses_remaining: 1, status: 'active', course_start_date: '2026-08-29',
};

test('PP-1: course 2 with nothing placed after it still has 1 remaining', async () => {
  const p = await getPackageProgress(fakeSupabase([course2]), 7, course2);
  assert.deepStrictEqual(p, { total: 3, current: 2, completed: 1, remaining: 1 });
});

test('PP-2: course 3 already placed (any slot) leaves course 2 with 0 remaining', async () => {
  const course3 = { ...course2, id: 3, package_courses_remaining: 0, course_start_date: '2026-10-24' };
  const p = await getPackageProgress(fakeSupabase([course2, course3]), 7, course2);
  assert.strictEqual(p.remaining, 0);
  assert.strictEqual(p.current, 2, 'position stays tied to the row itself');
});

test('PP-3: a cancelled later row or another order does not count as placed', async () => {
  const cancelled = { ...course2, id: 3, status: 'cancelled', course_start_date: '2026-10-24' };
  const otherOrder = { ...course2, id: 4, shopify_order_id: 'O2', course_start_date: '2026-10-24' };
  const p = await getPackageProgress(fakeSupabase([course2, cancelled, otherOrder]), 7, course2);
  assert.strictEqual(p.remaining, 1);
});
