'use strict';

// hbScheduleGenerator pulls in supabaseDb, which builds the shared client at
// require time.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'dummy';

const { test } = require('node:test');
const assert = require('node:assert');
const { plannedDates, buildInstance } = require('../utils/hbScheduleGenerator');
const { HB_SLOTS, HB_HORIZON_DAYS, HB_CLOSURES, closureOn } = require('../config/hbSchedule');
const { weekdayName, addDays, toYmd, DAY_NAMES } = require('../utils/sgtDate');

const slotFor = (classType) => HB_SLOTS.find(s => s.classType === classType);

test('HB-01: a slot only ever lands on its own weekday', () => {
  for (const slot of HB_SLOTS) {
    const dates = plannedDates(slot, '2026-09-01', '2026-12-31');
    assert.ok(dates.length > 0, `${slot.classType} planned nothing`);
    for (const d of dates) {
      assert.equal(weekdayName(d), slot.weekday, `${slot.classType} put a class on ${d}, a ${weekdayName(d)}`);
    }
  }
});

test('HB-02: the weekday is the same in every timezone the studio runs in', () => {
  // Railway is UTC, the studio laptops are SGT. A Date-based implementation
  // passes in Singapore and moves Monday's class to Sunday in production — the
  // exact failure the date lock exists to prevent.
  const original = process.env.TZ;
  const monday = slotFor('HBMONNT_LT');
  const seen = new Set();
  for (const tz of ['Asia/Singapore', 'UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    process.env.TZ = tz;
    seen.add(plannedDates(monday, '2026-09-01', '2026-09-30').join(','));
  }
  process.env.TZ = original;
  assert.equal(seen.size, 1, 'planned dates differed between timezones');
});

test('HB-03: a window starting on the slot weekday includes that day', () => {
  // 2026-09-07 is a Monday. Filling "from today" must not skip today.
  const dates = plannedDates(slotFor('HBMONNT_LT'), '2026-09-07', '2026-09-21');
  assert.deepEqual(dates, ['2026-09-07', '2026-09-14', '2026-09-21']);
});

test('HB-04: the window is inclusive at both ends and steps by exactly a week', () => {
  const dates = plannedDates(slotFor('HBSATEV_LT'), '2026-09-01', '2026-09-26');
  // Saturdays: 5, 12, 19, 26 — the 26th is the last day of the window.
  assert.deepEqual(dates, ['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26']);
});

test('HB-05: an empty or inverted window plans nothing', () => {
  const slot = slotFor('HBWEDNT_LT');
  assert.deepEqual(plannedDates(slot, '2026-09-10', '2026-09-01'), [], 'inverted window');
  assert.deepEqual(plannedDates(slot, '2026-09-03', '2026-09-08'), [], 'window holds no Wednesday');
  assert.deepEqual(plannedDates(slot, null, '2026-09-30'), [], 'missing start');
});

test('HB-06: the horizon covers every slot at least a dozen times over', () => {
  // If someone shortens the horizon to the point where a weekly slot barely
  // gets scheduled, the calendar is one missed run away from empty again.
  for (const slot of HB_SLOTS) {
    const dates = plannedDates(slot, '2026-09-01', addDays('2026-09-01', HB_HORIZON_DAYS));
    assert.ok(dates.length >= 12, `${slot.classType} only gets ${dates.length} classes inside the horizon`);
  }
});

test('HB-07: the timetable has no duplicate slots', () => {
  const keys = HB_SLOTS.map(s => `${s.weekday} ${s.startTime}`);
  assert.equal(new Set(keys).size, keys.length, 'two slots share a weekday and start time');
  const types = HB_SLOTS.map(s => s.classType);
  assert.equal(new Set(types).size, types.length, 'two slots share a class_type');
});

test('HB-08: every slot is fully specified', () => {
  for (const slot of HB_SLOTS) {
    assert.match(slot.classType, /^HB[A-Z]+_[A-Z]{2}$/, `${slot.classType} is not an HB slot code`);
    assert.ok(DAY_NAMES.includes(slot.weekday), `${slot.classType} has weekday ${slot.weekday}`);
    assert.ok(slot.startTime && slot.endTime, `${slot.classType} is missing a time`);
    assert.ok(slot.instructor, `${slot.classType} has no instructor`);
    assert.ok(Number.isInteger(slot.maxCapacity) && slot.maxCapacity > 0, `${slot.classType} has a bad capacity`);
  }
});

test('HB-09: a class on a studio closure is created cancelled, with its reason', () => {
  // Christmas Day 2026 is a Friday, so the Friday slot lands on it.
  const dates = plannedDates(slotFor('HBFRINT_LT'), '2026-12-21', '2026-12-27');
  assert.deepEqual(dates, ['2026-12-25'], 'the Friday slot should land on Christmas Day');

  const row = buildInstance(slotFor('HBFRINT_LT'), '2026-12-25');
  assert.equal(row.status, 'cancelled');
  assert.match(row.cancellation_reason, /Christmas/);
});

test('HB-10: an ordinary date is created active with no cancellation reason', () => {
  const row = buildInstance(slotFor('HBMONNT_LT'), '2026-09-07');
  assert.equal(row.status, 'active');
  assert.equal(row.cancellation_reason, null);
});

test('HB-11: a closure still plans its date — it is cancelled, never skipped', () => {
  // Skipping would leave a hole indistinguishable from the calendar running
  // dry, which is the failure this module exists to prevent.
  const dates = plannedDates(slotFor('HBSATEV_LT'), '2026-12-20', '2026-12-27');
  assert.ok(dates.includes('2026-12-26'), 'Boxing Day should still be planned');
});

test('HB-12: every closure names a real date and a reason', () => {
  for (const c of HB_CLOSURES) {
    assert.match(c.date, /^\d{4}-\d{2}-\d{2}$/, `${c.date} is not a calendar date`);
    assert.equal(toYmd(c.date), c.date, `${c.date} does not round-trip`);
    assert.ok(c.reason && c.reason.trim().length > 0, `${c.date} has no reason`);
  }
  const dates = HB_CLOSURES.map(c => c.date);
  assert.equal(new Set(dates).size, dates.length, 'a date is listed as closed twice');
});

test('HB-13: closureOn matches only the exact date', () => {
  assert.ok(closureOn('2026-12-25'), 'Christmas Day should be a closure');
  assert.equal(closureOn('2026-12-24'), null, 'Christmas Eve is not listed');
  assert.equal(closureOn('2026-12-25T00:00:00'), null, 'closureOn takes a bare YYYY-MM-DD');
});
