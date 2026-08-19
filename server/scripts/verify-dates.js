// THE DATE LOCK. Run from server/:  node scripts/verify-dates.js
//
// Date handling has broken repeatedly in this codebase, most recently in the
// guard written to prevent it. This script exists so it cannot happen quietly
// again. It does two things:
//
//   1. Runs the calendar-date assertions under FOUR timezones, in real child
//      processes, and fails if any answer differs. A date test that only runs
//      on a Singapore laptop proves nothing — Railway runs UTC.
//
//   2. Scans date-critical source for runtime-timezone-dependent Date methods
//      (getDay, getDate, getMonth, getFullYear, getHours...). These read the
//      RUNTIME's zone, so they give different answers on different machines.
//      Calendar-date maths must go through utils/sgtDate instead.
//
// Mutates nothing. Touches no database.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ZONES = ['Asia/Singapore', 'UTC', 'America/Los_Angeles', 'Pacific/Kiritimati'];

// Files where a calendar date is computed or displayed. Add to this list rather
// than working around it.
const GUARDED_FILES = [
  'utils/sgtDate.js',
  'utils/packageContinuation.js',
  'utils/continuationOffer.js',
  'utils/continuationSweep.js',
  'utils/cohortCapacity.js',
];

// Banned outside sgtDate.js. Each reads the runtime's local timezone.
const BANNED = /\.(getDay|getDate|getMonth|getFullYear|getHours|getMinutes|setDate|setMonth|setFullYear)\s*\(/g;

let failures = 0;
function assert(cond, label) {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${label}`);
  if (!cond) failures++;
}

// ---------------------------------------------------------------------------
// 1. Same answers in every timezone
// ---------------------------------------------------------------------------
//
// Known-good calendar facts. Verified against a calendar, not against the code.
const PROBE = `
const { weekdayName, isWeekday, addDays, daysUntilWeekday, todaySGT } = require('./utils/sgtDate');
const out = {
  aug28:  weekdayName('2026-08-28'),
  sep10:  weekdayName('2026-09-10'),
  jan01:  weekdayName('2026-01-01'),
  leap:   weekdayName('2024-02-29'),
  isThu:  isWeekday('2026-09-10', 'THURSDAY'),
  notThu: isWeekday('2026-09-09', 'THURSDAY'),
  rollMonth: addDays('2026-08-31', 1),
  rollYear:  addDays('2026-12-31', 1),
  rollBack:  addDays('2026-01-01', -1),
  untilThu:  daysUntilWeekday('2026-09-09', 'THURSDAY'),
  untilSame: daysUntilWeekday('2026-09-10', 'THURSDAY'),
  today:     todaySGT(),
  // A timestamp carrying a time part must not shift the calendar date.
  withTime:  weekdayName('2026-09-10T00:00:00+08:00'),
  utcNoon:   weekdayName('2026-09-10T12:00:00Z'),
};
console.log(JSON.stringify(out));
`;

const EXPECTED = {
  aug28: 'FRIDAY',
  sep10: 'THURSDAY',
  jan01: 'THURSDAY',
  leap: 'THURSDAY',
  isThu: true,
  notThu: false,
  rollMonth: '2026-09-01',
  rollYear: '2027-01-01',
  rollBack: '2025-12-31',
  untilThu: 1,
  untilSame: 0,
  withTime: 'THURSDAY',
  utcNoon: 'THURSDAY',
};

console.log('Calendar-date answers across timezones:\n');
const results = {};
for (const tz of ZONES) {
  const raw = execFileSync(process.execPath, ['-e', PROBE], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, TZ: tz },
    encoding: 'utf8',
  }).trim().split('\n').pop();
  results[tz] = JSON.parse(raw);
  console.log(`  ${tz.padEnd(22)} ${results[tz].aug28} / ${results[tz].sep10} / today ${results[tz].today}`);
}

console.log('');
for (const [key, want] of Object.entries(EXPECTED)) {
  const got = ZONES.map(tz => results[tz][key]);
  const allSame = got.every(v => JSON.stringify(v) === JSON.stringify(got[0]));
  assert(allSame && JSON.stringify(got[0]) === JSON.stringify(want),
    `${key}: ${JSON.stringify(want)} in all ${ZONES.length} zones${allSame ? '' : ` — DIVERGED: ${JSON.stringify(got)}`}`);
}

// todaySGT is the one value that legitimately moves, but it must still agree
// everywhere, because "today in Singapore" does not depend on where you stand.
const todays = ZONES.map(tz => results[tz].today);
assert(todays.every(t => t === todays[0]), `todaySGT agrees across zones (${todays[0]})`);

// ---------------------------------------------------------------------------
// 2. No timezone-dependent Date methods in date-critical code
// ---------------------------------------------------------------------------
console.log('\nTimezone-dependent Date methods in guarded files:');
for (const rel of GUARDED_FILES) {
  const file = path.join(__dirname, '..', rel);
  if (!fs.existsSync(file)) {
    assert(false, `${rel} — MISSING (update GUARDED_FILES if it moved)`);
    continue;
  }
  const src = fs.readFileSync(file, 'utf8');
  const hits = [];
  src.split('\n').forEach((line, i) => {
    if (line.trim().startsWith('*') || line.trim().startsWith('//')) return; // comments
    const m = line.match(BANNED);
    if (m) hits.push(`line ${i + 1}: ${m.join(', ')}`);
  });

  // sgtDate.js is where the timezone-safe primitives live; it is allowed to use
  // UTC accessors, which the pattern above does not match anyway.
  assert(hits.length === 0, `${rel}${hits.length ? ` — ${hits.join('; ')}` : ''}`);
}

console.log(`\n${failures === 0 ? 'PASS — dates are locked' : `FAIL — ${failures} problem(s)`}`);
process.exit(failures === 0 ? 0 : 1);
