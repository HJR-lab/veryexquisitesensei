'use strict';

// courseEnrollmentManager pulls in modules that load the Supabase client at require time.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy';

const { test } = require('node:test');
const assert = require('node:assert');

// ---------------------------------------------------------------------------
// In-memory stand-in for the Supabase query builder (reads only — every write
// processCoursePurchase makes here goes through the mocked supabaseDb helpers).
// ---------------------------------------------------------------------------
function makeSupabase(tables) {
  const from = (table) => {
    const filters = [];
    let limit = null;
    const rows = () => {
      let out = tables[table] || [];
      for (const f of filters) {
        if (f.op === 'eq') out = out.filter(r => String(r[f.col]) === String(f.val));
        if (f.op === 'in') out = out.filter(r => f.val.map(String).includes(String(r[f.col])));
      }
      return limit == null ? out : out.slice(0, limit);
    };
    const api = {
      select: () => api,
      order: () => api,
      eq: (c, v) => (filters.push({ op: 'eq', col: c, val: v }), api),
      in: (c, v) => (filters.push({ op: 'in', col: c, val: v }), api),
      limit: (n) => (limit = n, api),
      single: () => Promise.resolve({ data: rows()[0] || null, error: null }),
      maybeSingle: () => Promise.resolve({ data: rows()[0] || null, error: null }),
      then: (res, rej) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
    };
    return api;
  };
  return { from };
}

function load(seed) {
  const tables = JSON.parse(JSON.stringify(seed));
  const created = [];
  const detailRequests = [];
  let nextId = 9000;

  const findCustomerByEmail = async (email) =>
    (tables.customers || []).find(c => c.email === email) || null;

  const dbPath = require.resolve('../utils/supabaseDb');
  const sdrPath = require.resolve('../utils/studentDetailsRequest');
  const cemPath = require.resolve('../utils/courseEnrollmentManager');

  require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: {
      supabase: makeSupabase(tables),
      findCustomerByEmail,
      findCustomerByShopifyId: async () => null,
      createDuplicatePaxCustomer: async ({ paxEmail, firstName, lastName }) => {
        const existing = await findCustomerByEmail(paxEmail);
        if (existing) return existing;
        const row = { id: nextId++, email: paxEmail, first_name: firstName, last_name: lastName };
        tables.customers.push(row);
        return row;
      },
      // Record the enrollment the purchase would create, then stop: everything
      // after it (cohort, bookings, credits) is out of scope for this test.
      createCourseEnrollment: async (data) => {
        created.push(data);
        throw new Error('stop after enrollment');
      },
      findCohortEnrollments: async () => [],
      updateCourseEnrollment: async () => {},
      createClassInstances: async () => [],
      createMultipleBookings: async () => [],
      updateCustomer: async () => {},
      syncStoredCredits: async () => {},
    },
  };
  require.cache[sdrPath] = {
    id: sdrPath, filename: sdrPath, loaded: true,
    exports: { createStudentDetailsRequests: async (r) => { detailRequests.push(r); } },
  };
  delete require.cache[cemPath];
  const cem = require('../utils/courseEnrollmentManager');
  delete require.cache[cemPath];
  return { cem, tables, created, detailRequests };
}

const AMY = { id: 1, email: 'amy@example.com', first_name: 'Amy', last_name: 'Long' };
const VARIANT = 'SATURDAYS • 10 Oct—21 Nov • 1:00pm-3:30pm NO CLASS 7 NOV';

// Amy's first order (#2768) is already enrolled in the 10 Oct cohort.
const firstOrderEnrollment = {
  id: 5526, student_id: 1, shopify_order_id: 'ORDER_2768', shopify_line_item_id: 'LINE_A',
  course_start_date: '2026-10-10', status: 'active', course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
};

const secondOrder = {
  id: 'ORDER_2776',
  createdAt: '2026-10-02T12:41:00Z',
  customer: { email: AMY.email, first_name: 'Amy', last_name: 'Long', shopifyCustomerId: '31242765533342' },
};
const secondLine = { id: 'LINE_B', title: 'Wheelthrowing Beginner/Ext 6 Weeks', variantTitle: VARIANT };

test('a second order for a course the buyer already holds seats a +dup student', async () => {
  const { cem, tables, created, detailRequests } = load({
    customers: [AMY],
    course_enrollments: [firstOrderEnrollment],
  });

  await cem.processCoursePurchase(secondOrder, secondLine);

  const dup = tables.customers.find(c => c.email === 'amy+dup@example.com');
  assert.ok(dup, 'a +dup placeholder is created for the second seat');
  assert.strictEqual(created.length, 1, 'exactly one enrollment is attempted');
  assert.strictEqual(created[0].studentId, dup.id, 'the enrollment belongs to the placeholder, not Amy');
  assert.strictEqual(String(created[0].shopifyOrderId), 'ORDER_2776');
  assert.strictEqual(created[0].shopifyLineItemId, 'LINE_B');
  assert.strictEqual(detailRequests.length, 1, 'the buyer is asked for the second student\'s details');
});

test('skips the next +dup when it already sits in this course', async () => {
  const { cem, tables, created } = load({
    customers: [AMY, { id: 2, email: 'amy+dup@example.com', first_name: 'Amy', last_name: 'Long (2)' }],
    course_enrollments: [
      firstOrderEnrollment,
      { ...firstOrderEnrollment, id: 5527, student_id: 2, shopify_line_item_id: 'LINE_A-2' },
    ],
  });

  await cem.processCoursePurchase(secondOrder, secondLine);

  const dup2 = tables.customers.find(c => c.email === 'amy+dup2@example.com');
  assert.ok(dup2, 'moves on to +dup2');
  assert.strictEqual(created[0].studentId, dup2.id);
});

test('an order already seated by hand creates nothing', async () => {
  // The daughter was enrolled under her own account against order #2776.
  const { cem, tables, created, detailRequests } = load({
    customers: [AMY, { id: 3, email: 'daughter@example.com', first_name: 'Amy', last_name: 'Long (2)' }],
    course_enrollments: [
      firstOrderEnrollment,
      { ...firstOrderEnrollment, id: 5538, student_id: 3, shopify_order_id: 'ORDER_2776', shopify_line_item_id: 'manual-order-2776' },
    ],
  });

  const res = await cem.processCoursePurchase(secondOrder, secondLine);

  assert.strictEqual(res.skipped, true);
  assert.strictEqual(res.reason, 'second_order_already_seated');
  assert.strictEqual(created.length, 0);
  assert.strictEqual(detailRequests.length, 0);
  assert.ok(!tables.customers.some(c => c.email.includes('+dup')));
});

test('the same order seen again is still a plain duplicate', async () => {
  // A legacy manual import with no shopify_order_id keeps the old skip.
  const { cem, created } = load({
    customers: [AMY],
    course_enrollments: [{ ...firstOrderEnrollment, shopify_order_id: null }],
  });

  const res = await cem.processCoursePurchase(secondOrder, secondLine);

  assert.strictEqual(res.reason, 'duplicate_by_date');
  assert.strictEqual(created.length, 0);
});
