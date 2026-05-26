// Read-only diagnostic for Google Calendar events.
// Lists all events with a given title prefix on the primary calendar of the
// authenticated VES account, plus the description of specific class_instance IDs.
// Mutates NOTHING.
//
// Run from server/:
//   node scripts/diagnose-gcal-events.js
//   node scripts/diagnose-gcal-events.js WT2805NT_JL6 WT3005AM_DL7

require('dotenv').config();
const { google } = require('googleapis');
const { supabase } = require('../utils/supabaseDb');

const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
auth.setCredentials({ refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN });
const cal = google.calendar({ version: 'v3', auth });
const CALENDAR_ID = 'primary';

const BASES = process.argv.slice(2);
if (BASES.length === 0) BASES.push('WT2805NT_JL6', 'WT3005AM_DL7');

async function listEvents(prefix) {
  console.log('\n=== Google Calendar events with q="' + prefix + '" ===');
  const timeMin = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString();

  let pageToken;
  const all = [];
  do {
    const res = await cal.events.list({
      calendarId: CALENDAR_ID,
      q: prefix,
      singleEvents: true,
      timeMin, timeMax,
      maxResults: 250,
      pageToken
    });
    (res.data.items || []).forEach(e => all.push(e));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  console.log('  Total matching events on primary calendar: ' + all.length);

  // Pull DB class_instances for this prefix
  const { data: rows } = await supabase
    .from('class_instances')
    .select('id, class_type, class_date, start_time, google_calendar_event_id')
    .ilike('class_type', prefix + '%');
  const dbEventIds = new Set((rows || []).map(r => r.google_calendar_event_id).filter(Boolean));
  const dbByEventId = Object.fromEntries((rows || []).filter(r => r.google_calendar_event_id).map(r => [r.google_calendar_event_id, r]));

  const orphaned = [];
  const tracked = [];
  for (const e of all) {
    const start = e.start?.dateTime || e.start?.date;
    const summary = e.summary || '(no title)';
    if (dbEventIds.has(e.id)) {
      tracked.push({ id: e.id, start, summary });
    } else {
      orphaned.push({ id: e.id, start, summary, status: e.status });
    }
  }
  console.log('  Tracked by DB (good): ' + tracked.length);
  console.log('  ORPHANED (in Google Calendar but no class_instances row points to them): ' + orphaned.length);
  if (orphaned.length > 0) {
    console.log('\n  Orphan list (these are the ghost duplicates likely showing in iCal):');
    for (const o of orphaned) {
      console.log('    ' + o.id + ' | ' + o.start + ' | ' + o.summary + ' | status=' + o.status);
    }
  }
  // Also surface DB rows whose google_calendar_event_id is no longer present in Google Calendar
  const presentSet = new Set(all.map(e => e.id));
  const missingFromGoogle = (rows || []).filter(r => r.google_calendar_event_id && !presentSet.has(r.google_calendar_event_id));
  if (missingFromGoogle.length > 0) {
    console.log('\n  DB references to deleted Google events (will re-create on next sync):');
    for (const r of missingFromGoogle) {
      console.log('    ci=' + r.id + ' (' + r.class_type + ') -> event ' + r.google_calendar_event_id);
    }
  }

  // For each TRACKED event, dump description so we can see if students are listed
  console.log('\n  Tracked event descriptions:');
  for (const t of tracked.sort((a, b) => (a.start || '').localeCompare(b.start || ''))) {
    try {
      const r = await cal.events.get({ calendarId: CALENDAR_ID, eventId: t.id });
      const ci = dbByEventId[t.id];
      const desc = r.data.description || '';
      const firstLines = desc.split('\n').slice(0, 30).join('\n');
      console.log('\n    ---- event ' + t.id + ' [' + r.data.summary + '] start=' + (r.data.start?.dateTime || r.data.start?.date) + ' ci=' + ci?.id + ' (' + ci?.class_type + ')');
      console.log(firstLines.split('\n').map(l => '      ' + l).join('\n'));
    } catch (e) {
      console.log('      (failed to fetch event ' + t.id + ': ' + e.message + ')');
    }
  }
}

(async () => {
  for (const p of BASES) {
    try { await listEvents(p); } catch (e) { console.error('Error listing ' + p + ':', e.message); }
  }
  console.log('\nDone.');
})();
