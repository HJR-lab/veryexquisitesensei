'use strict';

/**
 * Keeps the handbuilding drop-in calendar filled to a rolling horizon.
 *
 * Wheelthrowing classes are created as a side effect of enrolment: four
 * students buy the same timeslot, cohortAutoProcessor trips, and the six weeks
 * appear. Handbuilding has no equivalent — it is credit-based drop-in, so there
 * is no cohort to trigger on and nothing in the codebase has ever created an HB
 * class. The calendar was filled by hand instead, and on 2026-08-31 the last
 * hand-made batch ran out. Nothing broke and nothing logged; the class list
 * just came back empty while 48 open enrolments held 165 unspent credits.
 *
 * This module closes that gap. It reads the timetable from config/hbSchedule.js
 * and creates whatever is missing between tomorrow and the horizon.
 *
 * Two properties matter more than anything else here:
 *
 *   It is idempotent. A slot is "already there" if ANY row exists for that
 *   (class_date, class_type) — including a cancelled one. Running it twice
 *   creates nothing the second time.
 *
 *   It never overrules the studio. A class the studio cancelled stays
 *   cancelled, because the cancelled row still occupies its date. The one thing
 *   that WOULD be undone is a class removed by DELETE rather than by
 *   cancelling; cancel is the supported way to take an HB class off the
 *   calendar, and it is also the one the admin UI uses.
 *
 * It never touches the past, so a lapse is filled forward and history is left
 * exactly as it happened.
 */

const supabaseDb = require('./supabaseDb');
const calendarSync = require('./calendarSync');
const { HB_SLOTS, HB_HORIZON_DAYS, HB_CLOSURES, closureOn } = require('../config/hbSchedule');
const { toYmd, addDays, daysUntilWeekday, todaySGT } = require('./sgtDate');

/**
 * Every date a slot should run on within a window, inclusive of both ends.
 *
 * Pure and timezone-independent — all the arithmetic goes through sgtDate,
 * which works on YYYY-MM-DD strings. Railway runs UTC and the studio's laptops
 * run SGT; a Date-based version of this would put Monday's class on Sunday in
 * production and pass every test locally.
 *
 * @param {Object} slot - an entry from HB_SLOTS
 * @param {string} firstDate - first date to consider, YYYY-MM-DD
 * @param {string} lastDate - last date to consider, YYYY-MM-DD
 * @returns {string[]} class dates, ascending
 */
function plannedDates(slot, firstDate, lastDate) {
  const from = toYmd(firstDate);
  const to = toYmd(lastDate);
  if (!from || !to || from > to) return [];

  const dates = [];
  let cursor = addDays(from, daysUntilWeekday(from, slot.weekday));
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return dates;
}

/**
 * The row a slot creates on a given date.
 *
 * On a studio closure the class is still created, but cancelled — see the note
 * beside HB_CLOSURES for why it is written rather than skipped.
 */
function buildInstance(slot, classDate) {
  const closure = closureOn(classDate);
  return {
    class_date: classDate,
    start_time: slot.startTime,
    end_time: slot.endTime,
    class_type: slot.classType,
    instructor: slot.instructor,
    room: slot.room,
    max_capacity: slot.maxCapacity,
    current_enrollment: 0,
    status: closure ? 'cancelled' : 'active',
    cancellation_reason: closure ? closure.reason : null,
    is_glazing: false,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Work out which HB classes are missing between `from` and the horizon.
 *
 * Split out from the write so the decision can be inspected — the backfill
 * script prints it before touching anything.
 *
 * @param {Object} [options]
 * @param {string} [options.from] - first date to fill; defaults to tomorrow SGT
 * @param {number} [options.horizonDays] - days past `from` to fill
 * @param {string} [options.until] - explicit last date, overrides horizonDays
 * @returns {Promise<{from: string, until: string, missing: Object[], existing: number}>}
 */
async function planHbTopUp(options = {}) {
  const from = toYmd(options.from) || addDays(todaySGT(), 1);
  const until = toYmd(options.until) || addDays(from, options.horizonDays ?? HB_HORIZON_DAYS);

  const classTypes = HB_SLOTS.map(s => s.classType);
  const { data, error } = await supabaseDb.supabase
    .from('class_instances')
    .select('class_date, class_type')
    .in('class_type', classTypes)
    .gte('class_date', from)
    .lte('class_date', `${until}T23:59:59`);

  if (error) throw new Error(`[HB Schedule] could not read existing classes: ${error.message}`);

  // A cancelled row counts as taken — see the note at the top of this file.
  const taken = new Set((data || []).map(r => `${toYmd(r.class_date)}|${r.class_type}`));

  const missing = [];
  for (const slot of HB_SLOTS) {
    for (const date of plannedDates(slot, from, until)) {
      if (!taken.has(`${date}|${slot.classType}`)) missing.push(buildInstance(slot, date));
    }
  }
  missing.sort((a, b) => (a.class_date < b.class_date ? -1 : a.class_date > b.class_date ? 1 : 0));

  return { from, until, missing, existing: taken.size };
}

/**
 * Cancel any HB class still standing on a studio closure date.
 *
 * buildInstance() creates closures cancelled, so this only has work to do for
 * classes that already existed when a closure was added to the timetable —
 * which is how the December holidays were handled, the calendar having been
 * backfilled before anyone thought about Christmas.
 *
 * It only ever touches the HB slots in this timetable, and only ever cancels;
 * a class the studio cancelled for its own reasons keeps that reason.
 *
 * @returns {Promise<{cancelled: number, classes: string[]}>}
 */
async function closeHolidayClasses(options = {}) {
  const dates = HB_CLOSURES.map(c => c.date).filter(d => d >= (toYmd(options.from) || todaySGT()));
  if (dates.length === 0) return { cancelled: 0, classes: [] };

  const { data, error } = await supabaseDb.supabase
    .from('class_instances')
    .select('id, class_date, class_type, status')
    .in('class_type', HB_SLOTS.map(s => s.classType))
    .in('class_date', dates)
    .eq('status', 'active');

  if (error) throw new Error(`[HB Schedule] could not read closure dates: ${error.message}`);
  if (!data || data.length === 0) return { cancelled: 0, classes: [] };

  const classes = [];
  for (const row of data) {
    const closure = closureOn(toYmd(row.class_date));
    if (!closure) continue;
    const { error: updateError } = await supabaseDb.supabase
      .from('class_instances')
      .update({
        status: 'cancelled',
        cancellation_reason: closure.reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (updateError) {
      console.error(`[HB Schedule] could not cancel ${row.id}: ${updateError.message}`);
      continue;
    }
    // Retitles the calendar event to '<class_type> [CANCELLED]'.
    await calendarSync.syncClassInstance(row.id);
    classes.push(`${toYmd(row.class_date)} ${row.class_type} — ${closure.reason}`);
  }

  if (classes.length > 0) {
    console.log(`[HB Schedule] cancelled ${classes.length} classes falling on studio closures`);
  }
  return { cancelled: classes.length, classes };
}

/**
 * Fill the HB calendar forward, and put the new classes on the studio calendar.
 *
 * @param {Object} [options] - as planHbTopUp, plus:
 * @param {boolean} [options.dryRun] - work out what is missing and stop
 * @returns {Promise<{created: number, from: string, until: string, dryRun: boolean, dates: string[]}>}
 */
async function topUpHbSchedule(options = {}) {
  const { from, until, missing, existing } = await planHbTopUp(options);

  // Bring any class already standing on a closure date into line first, so a
  // dry run still reports the calendar honestly rather than describing a
  // holiday as open.
  const closed = options.dryRun ? { cancelled: 0, classes: [] } : await closeHolidayClasses({ from });

  if (missing.length === 0) {
    return { created: 0, from, until, dryRun: !!options.dryRun, dates: [], existing, closed };
  }

  const dates = missing.map(m => `${m.class_date} ${m.class_type}`);

  if (options.dryRun) {
    return { created: 0, from, until, dryRun: true, dates, existing, closed };
  }

  const { data, error } = await supabaseDb.supabase
    .from('class_instances')
    .insert(missing)
    .select('id');

  if (error) throw new Error(`[HB Schedule] insert failed: ${error.message}`);

  const created = (data || []).length;
  console.log(`[HB Schedule] created ${created} handbuilding classes between ${from} and ${until}`);

  // Put them on the studio calendar now rather than waiting for the nightly
  // resync, so a class created by a backfill is visible the same day.
  // syncClassInstance swallows its own errors and takes a per-instance lock, so
  // this is sequential on purpose.
  for (const row of (data || [])) {
    await calendarSync.syncClassInstance(row.id);
  }

  return { created, from, until, dryRun: false, dates, existing, closed };
}

module.exports = {
  plannedDates,
  buildInstance,
  planHbTopUp,
  topUpHbSchedule,
  closeHolidayClasses,
};
