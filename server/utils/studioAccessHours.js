const supabaseDb = require('./supabaseDb');

const SETTING_KEY = 'studio_access_hours';

// Bookable window for PAID studio access (enrolled students). Deliberately
// narrower than the studio's operating hours in membershipSettings.js — those
// govern member walk-ins, these are carved around class times.
// null = no bookable access that day.
const DEFAULT_STUDIO_ACCESS_HOURS = {
  weekly: {
    0: { open: '12:00', close: '19:00' },  // Sunday
    1: { open: '11:00', close: '18:00' },  // Monday
    2: { open: '11:00', close: '18:00' },  // Tuesday
    3: { open: '11:00', close: '18:00' },  // Wednesday
    4: { open: '11:00', close: '18:00' },  // Thursday
    5: { open: '12:00', close: '19:00' },  // Friday
    6: null,                               // Saturday
  },
  overrides: {},
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function isTime(v) {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

function isDateKey(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// '11:00' → '11am', '18:30' → '6:30pm'
function fmt24to12(t) {
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const suffix = h >= 12 ? 'pm' : 'am';
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${display}${suffix}` : `${display}:${mStr}${suffix}`;
}

function isOpen(window) {
  return !!window && !window.closed;
}

function labelFor(window) {
  if (!isOpen(window)) return 'Closed';
  return `${fmt24to12(window.open)} – ${fmt24to12(window.close)}`;
}

// Accepts anything; returns one of:
//   null                        — closed, nothing more to say
//   { closed: true, note }      — closed, with a reason to show students
//   { open, close, note? }      — bookable
function normaliseWindow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null;
  if (raw.closed === true) return note ? { closed: true, note } : null;
  if (!isTime(raw.open) || !isTime(raw.close)) return null;
  if (raw.close <= raw.open) return null;
  const window = { open: raw.open, close: raw.close };
  if (note) window.note = note;
  return window;
}

function normaliseSettings(raw) {
  const weekly = {};
  for (let d = 0; d < 7; d++) {
    const fallback = DEFAULT_STUDIO_ACCESS_HOURS.weekly[d];
    // An explicit null means closed; a missing key falls back to the default.
    const hasKey = raw && raw.weekly && Object.prototype.hasOwnProperty.call(raw.weekly, String(d));
    weekly[d] = hasKey ? normaliseWindow(raw.weekly[String(d)]) : (fallback ? { ...fallback } : null);
  }

  const overrides = {};
  if (raw && raw.overrides && typeof raw.overrides === 'object') {
    for (const [date, value] of Object.entries(raw.overrides)) {
      if (!isDateKey(date)) continue;
      // null is meaningful here — it closes the date.
      overrides[date] = value === null ? null : normaliseWindow(value);
    }
  }

  return { weekly, overrides };
}

async function readStudioAccessHours() {
  const { data, error } = await supabaseDb.supabase
    .from('admin_settings')
    .select('setting_value')
    .eq('setting_key', SETTING_KEY)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) return normaliseSettings(DEFAULT_STUDIO_ACCESS_HOURS);
  try {
    return normaliseSettings(JSON.parse(data.setting_value));
  } catch {
    return normaliseSettings(DEFAULT_STUDIO_ACCESS_HOURS);
  }
}

async function writeStudioAccessHours(settings) {
  const value = JSON.stringify(normaliseSettings(settings));
  const now = new Date().toISOString();

  const { data: existing } = await supabaseDb.supabase
    .from('admin_settings')
    .select('id')
    .eq('setting_key', SETTING_KEY)
    .single();

  if (existing) {
    const { error } = await supabaseDb.supabase
      .from('admin_settings')
      .update({ setting_value: value, updated_at: now })
      .eq('setting_key', SETTING_KEY);
    if (error) throw error;
  } else {
    const { error } = await supabaseDb.supabase
      .from('admin_settings')
      .insert({
        setting_key: SETTING_KEY,
        setting_value: value,
        description: 'Bookable window for paid studio access — weekly baseline plus date overrides',
        updated_at: now,
      });
    if (error) throw error;
  }
}

// dateStr is 'YYYY-MM-DD'. Noon avoids the UTC-vs-SGT date slip.
function weekdayOf(dateStr) {
  return new Date(dateStr + 'T12:00:00').getDay();
}

// The single answer to "can studio access be booked on this date, and when?".
// A date override always beats the weekly baseline.
function resolveHoursForDate(dateStr, settings) {
  const overridden = Object.prototype.hasOwnProperty.call(settings.overrides, dateStr);
  const window = overridden ? settings.overrides[dateStr] : settings.weekly[weekdayOf(dateStr)];
  const open = isOpen(window);
  return {
    closed: !open,
    open: open ? window.open : null,
    close: open ? window.close : null,
    label: labelFor(window),
    note: window && window.note ? window.note : null,
    isOverride: overridden,
  };
}

// Compact human summary of the weekly baseline, grouping days that share hours.
// → 'Mon–Thu 11am – 6pm · Fri & Sun 12pm – 7pm · Sat Closed'
function weeklySummary(settings) {
  const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Week reads Mon-first, so Sunday sorts last.
  const order = [1, 2, 3, 4, 5, 6, 0];

  const groups = [];
  for (const d of order) {
    const label = labelFor(settings.weekly[d]);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.days.push(d);
    else groups.push({ label, days: [d] });
  }

  return groups.map(g => {
    const names = g.days.map(d => SHORT[d]);
    const span = names.length >= 3
      ? `${names[0]}–${names[names.length - 1]}`
      : names.join(' & ');
    return `${span} ${g.label}`;
  }).join(' · ');
}

module.exports = {
  DEFAULT_STUDIO_ACCESS_HOURS,
  isOpen,
  DAY_NAMES,
  readStudioAccessHours,
  writeStudioAccessHours,
  resolveHoursForDate,
  weeklySummary,
  labelFor,
  normaliseSettings,
};
