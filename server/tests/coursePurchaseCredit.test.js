'use strict';

// creditManager loads the shared Supabase client at require time.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// ---------------------------------------------------------------------------
// A tiny in-memory stand-in for the Supabase query builder, so these tests run
// the real creditManager against real query shapes without touching the ledger.
// ---------------------------------------------------------------------------
function makeSupabase(seed) {
  const tables = JSON.parse(JSON.stringify(seed));
  let nextId = 9000;

  const from = (table) => {
    const filters = [];
    let limit = null;
    let pendingInsert = null;

    const rows = () => {
      let out = tables[table] || [];
      for (const f of filters) {
        if (f.op === 'eq') out = out.filter(r => String(r[f.col]) === String(f.val));
        if (f.op === 'in') out = out.filter(r => f.val.map(String).includes(String(r[f.col])));
        if (f.op === 'gt') out = out.filter(r => r[f.col] > f.val);
      }
      return limit == null ? out : out.slice(0, limit);
    };

    const run = () => {
      if (pendingInsert) {
        const inserted = pendingInsert.map(r => ({ id: nextId++, ...r }));
        (tables[table] = tables[table] || []).push(...inserted);
        pendingInsert = null;
        return Promise.resolve({ data: inserted, error: null });
      }
      return Promise.resolve({ data: rows(), error: null });
    };
    const first = () => run().then(({ data, error }) => ({
      data: Array.isArray(data) ? (data[0] || null) : data,
      error,
    }));

    const api = {
      select: () => api,
      order: () => api,
      eq: (c, v) => (filters.push({ op: 'eq', col: c, val: v }), api),
      in: (c, v) => (filters.push({ op: 'in', col: c, val: v }), api),
      gt: (c, v) => (filters.push({ op: 'gt', col: c, val: v }), api),
      limit: (n) => (limit = n, api),
      insert: (r) => (pendingInsert = Array.isArray(r) ? r : [r], api),
      single: first,
      maybeSingle: first,
      then: (res, rej) => run().then(res, rej),
    };
    return api;
  };

  return { client: { from }, tables };
}

// Fresh creditManager per test, wired to a fresh fake DB.
function load(seed, { emailPaused = true, sendEmail } = {}) {
  const dbPath = require.resolve('../utils/supabaseDb');
  const mailPath = require.resolve('../utils/emailService');
  const cmPath = require.resolve('../utils/creditManager');
  const { client, tables } = makeSupabase(seed);
  const sent = [];

  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { supabase: client } };
  require.cache[mailPath] = {
    id: mailPath, filename: mailPath, loaded: true,
    exports: {
      isEmailCategoryPaused: () => emailPaused,
      sendEmail: sendEmail || (async (m) => { sent.push(m); }),
    },
  };
  delete require.cache[cmPath];
  const creditManager = require('../utils/creditManager');
  delete require.cache[cmPath];
  return { creditManager, tables, sent };
}

// created_at ascends with id, so a lower id is always the earlier purchase.
// The helper needs it: "returning" means they had a course before THIS order.
const enr = (id, over = {}) => ({
  id,
  student_id: 1,
  shopify_order_id: '600001',
  shopify_line_item_id: `line-${id}`,
  status: 'active',
  created_at: new Date(Date.UTC(2026, 0, 1) + id * 86400000).toISOString(),
  course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
  ...over,
});

const seedFor = (enrollments, txns = []) => ({
  course_enrollments: enrollments,
  credit_transactions: txns,
  customers: [{ id: 1, email: 'student@example.com', first_name: 'Test' }],
});

const purchaseCredits = (tables) =>
  (tables.credit_transactions || []).filter(t => t.source === 'course_purchase');

// ---------------------------------------------------------------------------

test('a returning student earns $20 on a plain second order', async () => {
  const { creditManager, tables } = load(seedFor([
    enr(1, { shopify_order_id: '500000', status: 'completed' }),
    enr(2, { shopify_order_id: '600001' }),
  ]));

  const res = await creditManager.awardCoursePurchaseCredit({
    customerId: 1, enrollmentId: 2, courseTitle: 'WT 6 Weeks',
  });

  assert.strictEqual(res.granted, true);
  const txns = purchaseCredits(tables);
  assert.strictEqual(txns.length, 1);
  assert.strictEqual(txns[0].amount, 20);
  assert.strictEqual(txns[0].reference_id, '2');
  assert.strictEqual(txns[0].type, 'earn');
});

test('calling twice for the same enrollment grants once', async () => {
  const { creditManager, tables } = load(seedFor([
    enr(1, { shopify_order_id: '500000', status: 'completed' }),
    enr(2, { shopify_order_id: '600001' }),
  ]));

  await creditManager.awardCoursePurchaseCredit({ customerId: 1, enrollmentId: 2 });
  const again = await creditManager.awardCoursePurchaseCredit({ customerId: 1, enrollmentId: 2 });

  assert.strictEqual(again.granted, false);
  assert.strictEqual(again.reason, 'already_credited');
  assert.strictEqual(purchaseCredits(tables).length, 1);
});

test('a 3 Course Package earns $20 once, not once per course', async () => {
  // Customer 1186's real shape: one order, one base line item, three enrollment
  // rows created months apart as each course is redeemed.
  const { creditManager, tables } = load(seedFor([
    enr(4771, { shopify_order_id: '6467117514910', status: 'completed' }),
    enr(5096, { shopify_order_id: '6565498126494', shopify_line_item_id: '15131202125982', status: 'completed' }),
    enr(5272, { shopify_order_id: '6565498126494', shopify_line_item_id: '15131202125982-C2', status: 'completed' }),
    enr(5350, { shopify_order_id: '6565498126494', shopify_line_item_id: '15131202125982-C2-C3', status: 'completed' }),
  ]));

  for (const id of [5096, 5272, 5350]) {
    await creditManager.awardCoursePurchaseCredit({ customerId: 1, enrollmentId: id });
  }

  const txns = purchaseCredits(tables);
  assert.strictEqual(txns.length, 1, `expected one $20 for the package, got ${txns.length}`);
  assert.strictEqual(txns[0].amount, 20);
});

test('a first-time buyer earns nothing on a 3 Course Package', async () => {
  // The trap in the old row-counting rule: by the second row of their own first
  // order the customer has "more than one enrollment" and looks returning.
  const { creditManager, tables } = load(seedFor([
    enr(10, { shopify_order_id: '700001', shopify_line_item_id: 'pkg' }),
    enr(11, { shopify_order_id: '700001', shopify_line_item_id: 'pkg-C2' }),
    enr(12, { shopify_order_id: '700001', shopify_line_item_id: 'pkg-C2-C3' }),
  ]));

  const reasons = [];
  for (const id of [10, 11, 12]) {
    reasons.push((await creditManager.awardCoursePurchaseCredit({ customerId: 1, enrollmentId: id })).reason);
  }

  assert.deepStrictEqual(reasons, ['first_time_student', 'first_time_student', 'first_time_student']);
  assert.strictEqual(purchaseCredits(tables).length, 0);
});

test('a first-time buyer earns nothing on a single-course order', async () => {
  const { creditManager, tables } = load(seedFor([enr(10, { shopify_order_id: '700001' })]));
  const res = await creditManager.awardCoursePurchaseCredit({ customerId: 1, enrollmentId: 10 });
  assert.strictEqual(res.granted, false);
  assert.strictEqual(res.reason, 'first_time_student');
  assert.strictEqual(purchaseCredits(tables).length, 0);
});

test('two different courses on one order still earn $20 in total', async () => {
  const { creditManager, tables } = load(seedFor([
    enr(1, { shopify_order_id: '500000', status: 'completed' }),
    enr(20, { shopify_order_id: '600001', shopify_line_item_id: 'a' }),
    enr(21, { shopify_order_id: '600001', shopify_line_item_id: 'b' }),
  ]));

  await creditManager.awardCoursePurchaseCredit({ customerId: 1, enrollmentId: 20 });
  await creditManager.awardCoursePurchaseCredit({ customerId: 1, enrollmentId: 21 });

  assert.strictEqual(purchaseCredits(tables).length, 1);
});

test('two students on one order each earn their own $20', async () => {
  const seed = seedFor([
    enr(1, { student_id: 1, shopify_order_id: '500000', status: 'completed' }),
    enr(2, { student_id: 2, shopify_order_id: '500009', status: 'completed' }),
    enr(30, { student_id: 1, shopify_order_id: '600001' }),
    enr(31, { student_id: 2, shopify_order_id: '600001' }),
  ]);
  seed.customers.push({ id: 2, email: 'partner@example.com', first_name: 'Partner' });
  const { creditManager, tables } = load(seed);

  await creditManager.awardCoursePurchaseCredit({ customerId: 1, enrollmentId: 30 });
  await creditManager.awardCoursePurchaseCredit({ customerId: 2, enrollmentId: 31 });

  const txns = purchaseCredits(tables);
  assert.strictEqual(txns.length, 2);
  assert.deepStrictEqual(txns.map(t => t.reference_id).sort(), ['30', '31']);
});

test('a cancelled enrollment earns nothing', async () => {
  const { creditManager, tables } = load(seedFor([
    enr(1, { shopify_order_id: '500000', status: 'completed' }),
    enr(2, { shopify_order_id: '600001', status: 'cancelled' }),
  ]));

  const res = await creditManager.awardCoursePurchaseCredit({ customerId: 1, enrollmentId: 2 });
  assert.strictEqual(res.granted, false);
  assert.strictEqual(res.reason, 'enrollment_not_creditable');
  assert.strictEqual(purchaseCredits(tables).length, 0);
});

test('non-numeric order ids do not group unrelated purchases', async () => {
  // 'MANUAL', 'VOUCHER-4' and null all appear in course_enrollments and none of
  // them identify one purchase, so each such row is settled on its own.
  const { creditManager, tables } = load(seedFor([
    enr(1, { shopify_order_id: '500000', status: 'completed' }),
    enr(2, { shopify_order_id: 'MANUAL' }),
    enr(3, { shopify_order_id: null }),
  ]));

  await creditManager.awardCoursePurchaseCredit({ customerId: 1, enrollmentId: 2 });
  await creditManager.awardCoursePurchaseCredit({ customerId: 1, enrollmentId: 3 });

  assert.strictEqual(purchaseCredits(tables).length, 2);
});

test('the grant stands even if the credit email throws', async () => {
  const { creditManager, tables } = load(seedFor([
    enr(1, { shopify_order_id: '500000', status: 'completed' }),
    enr(2, { shopify_order_id: '600001' }),
  ]), { emailPaused: false, sendEmail: async () => { throw new Error('smtp down'); } });

  const res = await creditManager.awardCoursePurchaseCredit({ customerId: 1, enrollmentId: 2 });
  assert.strictEqual(res.granted, true);
  assert.strictEqual(purchaseCredits(tables).length, 1);
});

test('no email goes out while the credits category is paused', async () => {
  const { creditManager, sent } = load(seedFor([
    enr(1, { shopify_order_id: '500000', status: 'completed' }),
    enr(2, { shopify_order_id: '600001' }),
  ]), { emailPaused: true });

  await creditManager.awardCoursePurchaseCredit({ customerId: 1, enrollmentId: 2 });
  assert.deepStrictEqual(sent, []);
});

test('missing ids are refused rather than guessed at', async () => {
  const { creditManager, tables } = load(seedFor([enr(2)]));
  assert.strictEqual((await creditManager.awardCoursePurchaseCredit({ customerId: 1 })).reason, 'missing_ids');
  assert.strictEqual((await creditManager.awardCoursePurchaseCredit({ enrollmentId: 2 })).reason, 'missing_ids');
  assert.strictEqual(purchaseCredits(tables).length, 0);
});

test('a first course does not earn just because a later course was bought', async () => {
  // The backfill trap: sweeping an old cohort today, the student now has two
  // orders and looks returning — but on their first order they were not.
  const { creditManager, tables } = load(seedFor([
    enr(40, { shopify_order_id: '700001', status: 'completed' }),
    enr(41, { shopify_order_id: '800002' }),
  ]));

  const first = await creditManager.awardCoursePurchaseCredit({ customerId: 1, enrollmentId: 40 });
  assert.strictEqual(first.granted, false);
  assert.strictEqual(first.reason, 'first_time_student');

  const second = await creditManager.awardCoursePurchaseCredit({ customerId: 1, enrollmentId: 41 });
  assert.strictEqual(second.granted, true);

  const txns = purchaseCredits(tables);
  assert.strictEqual(txns.length, 1);
  assert.strictEqual(txns[0].reference_id, '41');
});

test('dryRun reports what would happen and writes nothing', async () => {
  const { creditManager, tables } = load(seedFor([
    enr(1, { shopify_order_id: '500000', status: 'completed' }),
    enr(2, { shopify_order_id: '600001' }),
  ]));

  const would = await creditManager.awardCoursePurchaseCredit({ customerId: 1, enrollmentId: 2, dryRun: true });
  assert.strictEqual(would.granted, true);
  assert.strictEqual(would.dryRun, true);
  assert.strictEqual(purchaseCredits(tables).length, 0);

  const refused = await creditManager.awardCoursePurchaseCredit({ customerId: 1, enrollmentId: 1, dryRun: true });
  assert.strictEqual(refused.granted, false);
  assert.strictEqual(purchaseCredits(tables).length, 0);
});
