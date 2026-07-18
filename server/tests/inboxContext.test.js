'use strict';

// Loading inboxProcessor pulls in the shared Supabase client, which requires env
// to construct (we inject a fake client into getStudentContext, so the real one
// is never used).
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy';

const { test } = require('node:test');
const assert = require('node:assert');
const { getStudentContext } = require('../utils/inboxProcessor');

// Fake Supabase client: configurable per-table responses; records the filters
// used so tests can assert the correct columns were queried.
function makeClient(responses) {
  const calls = { piece_batches: [], bookings: [], course_enrollments: [], memberships: [], customers: [] };
  class Q {
    constructor(table) { this.table = table; this.eqs = {}; this.ins = {}; this._single = null; }
    select() { return this; }
    eq(c, v) { this.eqs[c] = v; return this; }
    neq(c, v) { (this.neqs = this.neqs || {})[c] = v; return this; }
    in(c, v) { this.ins[c] = v; return this; }
    maybeSingle() { this._single = 'maybe'; return this._exec(); }
    then(res, rej) { return this._exec().then(res, rej); }
    async _exec() {
      if (calls[this.table]) calls[this.table].push({ eqs: { ...this.eqs }, ins: { ...this.ins } });
      const r = responses[this.table] || { data: null, error: null };
      return typeof r === 'function' ? r() : r;
    }
  }
  return { calls, from(t) { return new Q(t); } };
}

const CUSTOMER = { id: 5, first_name: 'Ada', last_name: 'L', email: 'ada@example.com' };

test('WR-02: a failed bookings query throws instead of reporting zero bookings', async () => {
  const client = makeClient({
    customers: { data: CUSTOMER, error: null },
    course_enrollments: { data: [], error: null },
    bookings: { data: null, error: { message: 'bookings boom' } },
    piece_batches: { data: [], error: null },
    memberships: { data: null, error: null },
  });
  await assert.rejects(() => getStudentContext('ada@example.com', client), (err) => /bookings boom/.test(err.message));
});

test('WR-02: a failed pieces query throws instead of reporting no pieces', async () => {
  const client = makeClient({
    customers: { data: CUSTOMER, error: null },
    course_enrollments: { data: [], error: null },
    bookings: { data: [], error: null },
    piece_batches: { data: null, error: { message: 'pieces boom' } },
    memberships: { data: null, error: null },
  });
  await assert.rejects(() => getStudentContext('ada@example.com', client), (err) => /pieces boom/.test(err.message));
});

test('WR-02: counts only future bookings (via joined class_instances) and queries pieces by customer_id', async () => {
  const future = new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0];
  const past = new Date(Date.now() - 7 * 864e5).toISOString().split('T')[0];
  const client = makeClient({
    customers: { data: CUSTOMER, error: null },
    course_enrollments: { data: [], error: null },
    bookings: {
      data: [
        { id: 1, class_instances: { class_date: future } },
        { id: 2, class_instances: { class_date: past } },
        { id: 3, class_instances: null },
      ],
      error: null,
    },
    piece_batches: { data: [{ status: 'logged', piece_count: 3, ready_at: null }], error: null },
    memberships: { data: null, error: null },
  });

  const ctx = await getStudentContext('ada@example.com', client);
  assert.equal(ctx.upcomingBookingsCount, 1, 'only the future-dated booking counts');
  assert.equal(ctx.pieces.length, 1);
  // Active pieces come from piece_batches, filtered by customer_id.
  assert.equal(client.calls.piece_batches[0].eqs.customer_id, 5);
  assert.equal(client.calls.piece_batches[0].eqs.student_id, undefined);
});
