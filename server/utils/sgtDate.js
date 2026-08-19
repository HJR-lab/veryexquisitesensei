/**
 * Calendar-date helpers that do not depend on the runtime's timezone.
 *
 * The studio thinks in Singapore calendar dates: "the Thursday cohort starts on
 * 2026-09-10". That is a calendar fact, not an instant, and its weekday is a
 * pure function of the date — no timezone involved.
 *
 * The trap: `new Date('2026-09-10T00:00:00+08:00').getDay()` looks careful but
 * is not. It parses the instant correctly and then reads the weekday in the
 * RUNTIME's zone. On a Singapore laptop that gives Thursday; on Railway, which
 * runs UTC, the same instant is 16:00 on the 9th and it gives Wednesday. That
 * shipped, and turned the display guard into something that rejected correct
 * dates in production while passing every test locally.
 *
 * Everything here works on YYYY-MM-DD strings via UTC arithmetic, so it gives
 * the same answer on every machine.
 */

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** Strip any time part: '2026-09-10T00:00:00+08:00' → '2026-09-10'. */
function toYmd(value) {
  if (!value) return null;
  const s = String(value).split(/[T ]/)[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Weekday index 0-6 (Sunday = 0) for a calendar date. Timezone-independent. */
function weekdayIndex(value) {
  const ymd = toYmd(value);
  if (!ymd) return -1;
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 'THURSDAY' for a calendar date, or null. */
function weekdayName(value) {
  const i = weekdayIndex(value);
  return i < 0 ? null : DAY_NAMES[i];
}

/** Whether a calendar date falls on a named day, e.g. ('2026-09-10','THURSDAY'). */
function isWeekday(value, name) {
  const want = DAY_NAMES.indexOf(String(name || '').toUpperCase());
  return want >= 0 && weekdayIndex(value) === want;
}

/** Add whole days to a calendar date, returning YYYY-MM-DD. */
function addDays(value, n) {
  const ymd = toYmd(value);
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().split('T')[0];
}

/**
 * Days to move forward from a date to reach the next occurrence of a weekday.
 * 0 when it already falls on that day.
 */
function daysUntilWeekday(value, name) {
  const want = DAY_NAMES.indexOf(String(name || '').toUpperCase());
  const have = weekdayIndex(value);
  if (want < 0 || have < 0) return 0;
  return (want - have + 7) % 7;
}

/** Today's calendar date in Singapore, whatever the runtime's timezone. */
function todaySGT() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
}

module.exports = {
  DAY_NAMES,
  toYmd,
  weekdayIndex,
  weekdayName,
  isWeekday,
  addDays,
  daysUntilWeekday,
  todaySGT,
};
