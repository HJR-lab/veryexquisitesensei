'use strict';

// calendarSync loads the shared Supabase client at require time.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy';

const { test } = require('node:test');
const assert = require('node:assert');
const { summarizeSyncResults } = require('../utils/calendarSync');

test('WR-06: summarizes Promise.allSettled results into a partial-failure report', () => {
  const s = summarizeSyncResults([
    { status: 'fulfilled', value: { status: 'ok', classInstanceId: 1 } },
    { status: 'fulfilled', value: { status: 'failed', classInstanceId: 2, error: 'calendar 500' } },
    { status: 'rejected', reason: new Error('boom') },
    { status: 'fulfilled', value: { status: 'skipped', classInstanceId: 3, reason: 'past_class' } },
  ]);
  assert.equal(s.ok, 1);
  assert.equal(s.failed, 2, 'both an explicit failed result and a rejected promise count as failures');
  assert.equal(s.skipped, 1);
  assert.equal(s.total, 4);
  assert.equal(s.allOk, false);
  assert.equal(s.failures.length, 2);
  assert.equal(s.failures[0].classInstanceId, 2);
});

test('WR-06: all-ok batch reports no failures', () => {
  const s = summarizeSyncResults([
    { status: 'ok', classInstanceId: 1 },
    { status: 'ok', classInstanceId: 2 },
  ]);
  assert.equal(s.ok, 2);
  assert.equal(s.failed, 0);
  assert.equal(s.allOk, true);
  assert.deepEqual(s.failures, []);
});

test('WR-06: empty batch is trivially all-ok', () => {
  const s = summarizeSyncResults([]);
  assert.equal(s.total, 0);
  assert.equal(s.allOk, true);
});
