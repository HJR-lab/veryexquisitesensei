'use strict';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy';

const { test } = require('node:test');
const assert = require('node:assert');

// ---------------------------------------------------------------------------
// In-memory stand-in for the Supabase query builder, enough for the seat gate
// and the class listing: eq/in/gte filters, count-only selects, ranges.
// ---------------------------------------------------------------------------
function makeSupabase(tables) {
  const from = (table) => {
    const filters = [];
    let countOnly = false;
    const rows = () => {
      let out = tables[table] || [];
      for (const f of filters) {
        if (f.op === 'eq') out = out.filter(r => String(r[f.col]) === String(f.val));
        if (f.op === 'in') out = out.filter(r => f.val.map(String).includes(String(r[f.col])));
        if (f.op === 'gte') out = out.filter(r => String(r[f.col]) >= String(f.val));
      }
      return out;
    };
    const result = () => (countOnly
      ? { data: null, count: rows().length, error: null }
      : { data: rows(), error: null });
    const api = {
      select: (_cols, opts) => { if (opts && opts.count) countOnly = true; return api; },
      order: () => api,
      range: () => api,
      limit: () => api,
      is: () => api,
      eq: (c, v) => (filters.push({ op: 'eq', col: c, val: v }), api),
      in: (c, v) => (filters.push({ op: 'in', col: c, val: v }), api),
      gte: (c, v) => (filters.push({ op: 'gte', col: c, val: v }), api),
      single: () => Promise.resolve({ data: rows()[0] || null, error: null }),
      maybeSingle: () => Promise.resolve({ data: rows()[0] || null, error: null }),
      then: (res, rej) => Promise.resolve(result()).then(res, rej),
    };
    return api;
  };
  return { from };
}

function load(seed) {
  const tables = JSON.parse(JSON.stringify(seed));
  const supabase = makeSupabase(tables);
  const clientPath = require.resolve('../utils/supabaseClient');
  const bdbPath = require.resolve('../utils/bookingDb');
  require.cache[clientPath] = {
    id: clientPath, filename: clientPath, loaded: true,
    exports: { supabase, fetchAllRows: async (page) => (await page(0, 999)).data || [] },
  };
  delete require.cache[bdbPath];
  const bookingDb = require('../utils/bookingDb');
  delete require.cache[bdbPath];
  return bookingDb;
}

// A Saturday cohort that went live at 4 signups; week 2 holds 10.
const CLASS = {
  id: 100, class_type: 'WT1010PM_DL6.2', class_date: '2099-10-17', start_time: '1:00 PM',
  max_capacity: 10, status: 'active',
};
const signups = (n) => Array.from({ length: n }, (_, i) => ({
  id: i + 1, student_id: i + 1, course_identifier: 'WT1010PM_DL6', status: 'active',
}));
const booked = (studentIds) => studentIds.map((sid, i) => ({
  id: 500 + i, student_id: sid, class_instance_id: CLASS.id, status: 'booked', booking_type: 'regular',
}));

test('an outsider only gets the make-up seats while the cohort is still selling', async () => {
  // 4 signups booked + 2 outsiders = 6 of 10, but 4 seats are held for unsold signups.
  const db = load({
    class_instances: [CLASS],
    course_enrollments: signups(4),
    bookings: booked([1, 2, 3, 4, 901, 902]),
    capacity_overrides: [],
  });

  const seat = await db.checkSeatAvailability(CLASS, 903);
  assert.strictEqual(seat.allowed, false);
  assert.strictEqual(seat.reason, 'SIGNUP_SEATS_HELD');
  assert.strictEqual(seat.counts.held, 4);
});

test('an outsider can still take a make-up seat when one is free', async () => {
  const db = load({
    class_instances: [CLASS],
    course_enrollments: signups(4),
    bookings: booked([1, 2, 3, 4, 901]),
    capacity_overrides: [],
  });

  const seat = await db.checkSeatAvailability(CLASS, 903);
  assert.strictEqual(seat.allowed, true);
});

test('the cohort\'s own student is never held back', async () => {
  const db = load({
    class_instances: [CLASS],
    course_enrollments: signups(4),
    bookings: booked([1, 2, 3, 901, 902, 903]),
    capacity_overrides: [],
  });

  const seat = await db.checkSeatAvailability(CLASS, 4);
  assert.strictEqual(seat.allowed, true);
});

test('nothing is held once all 8 places are sold', async () => {
  const db = load({
    class_instances: [CLASS],
    course_enrollments: signups(8),
    bookings: booked([1, 2, 3, 4, 5, 6, 7, 8, 901]),
    capacity_overrides: [],
  });

  const seat = await db.checkSeatAvailability(CLASS, 903);
  assert.strictEqual(seat.allowed, true);
  assert.strictEqual(seat.counts.held, 0);
});

test('an admin capacity grant still seats an outsider past held seats', async () => {
  const db = load({
    class_instances: [CLASS],
    course_enrollments: signups(4),
    bookings: booked([1, 2, 3, 4, 901, 902]),
    capacity_overrides: [{ id: 1, class_instance_id: CLASS.id, student_id: 903 }],
  });

  const seat = await db.checkSeatAvailability(CLASS, 903);
  assert.strictEqual(seat.allowed, true);
  assert.ok(seat.override);
});

test('handbuilding classes hold nothing', async () => {
  const hb = { ...CLASS, id: 200, class_type: 'HBTHUAM_LT', max_capacity: 8 };
  const db = load({
    class_instances: [hb],
    course_enrollments: [],
    bookings: [],
    capacity_overrides: [],
  });

  const seat = await db.checkSeatAvailability(hb, 903);
  assert.strictEqual(seat.allowed, true);
  assert.strictEqual(seat.counts.held, 0);
});

test('the class listing offers outsiders only what the gate would give them', async () => {
  const db = load({
    class_instances: [CLASS],
    course_enrollments: signups(4),
    bookings: booked([1, 2, 3, 4, 901]),
    waitlist: [],
    capacity_overrides: [],
  });

  const [cls] = await db.getAvailableClasses();
  assert.strictEqual(cls.signupSeatsHeld, 4);
  assert.strictEqual(cls.spotsAvailable, 1);
  assert.strictEqual(cls.makeupSpotsAvailable, 1);
  assert.strictEqual(cls.isCompletelyFull, false);
});
