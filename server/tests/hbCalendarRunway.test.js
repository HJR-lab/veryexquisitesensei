'use strict';

// anomalyProbe builds the shared Supabase client at require time.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy';

const { test } = require('node:test');
const assert = require('node:assert');
const { hbRunwayFinding } = require('../utils/anomalyProbe');

const TODAY = '2026-08-31';

test('HB-14: an empty handbuilding calendar is a high-severity finding', () => {
  // This is the state the studio was actually in on 2026-09-01, silently.
  const f = hbRunwayFinding(null, TODAY);
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'high');
  assert.equal(f[0].type, 'hb_calendar_runway');
  assert.match(f[0].details, /NO handbuilding classes/);
});

test('HB-15: a calendar filled to the horizon says nothing', () => {
  assert.deepEqual(hbRunwayFinding('2026-12-30', TODAY), []);
});

test('HB-16: the threshold fires at two weeks, not after the calendar is empty', () => {
  // The point of the check is to complain while there is still time to fix it.
  assert.equal(hbRunwayFinding('2026-09-07', TODAY).length, 1, 'a week of runway must alert');
  assert.equal(hbRunwayFinding('2026-09-14', TODAY).length, 1, 'exactly 14 days is still too short');
  assert.equal(hbRunwayFinding('2026-09-15', TODAY).length, 0, '15 days is enough runway');
});

test('HB-17: a calendar whose last class is already past still alerts', () => {
  // A stale calendar is worse than a short one, not better.
  const f = hbRunwayFinding('2026-08-31', TODAY);
  assert.equal(f.length, 1);
  const g = hbRunwayFinding('2026-06-01', TODAY);
  assert.equal(g.length, 1);
});

test('HB-18: the finding tells the reader how to fix it', () => {
  for (const last of [null, '2026-09-05']) {
    assert.match(hbRunwayFinding(last, TODAY)[0].details, /backfill-hb-schedule\.js/);
  }
});
