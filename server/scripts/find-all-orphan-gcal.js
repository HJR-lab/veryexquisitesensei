// Read-only sweep — finds ALL orphan Google Calendar events on the primary
// calendar that look like VES class events but are not pointed to by any
// class_instances.google_calendar_event_id.
//
// Definition of "looks like a class event":
//   summary matches /^(WT|HB)[A-Z0-9_]+\.\d+/  (e.g. WT2805NT_JL6.3, HB1234.2)
//
// Mutates NOTHING. Prints a list and counts.

require('dotenv').config();
const { google } = require('googleapis');
const { supabase } = require('../utils/supabaseDb');

const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
auth.setCredentials({ refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN });
const cal = google.calendar({ version: 'v3', auth });

const CLASS_SUMMARY = /^(WT|HB)[A-Z0-9_]+\.\d+/i;

(async () => {
  // 1. Pull all class_instances and their tracked event IDs
  const { data: cis } = await supabase
    .from('class_instances')
    .select('id, class_type, class_date, google_calendar_event_id')
    .not('google_calendar_event_id', 'is', null);
  const trackedIds = new Set(cis.map(c => c.google_calendar_event_id));
  console.log('class_instances with tracked Google event id: ' + cis.length);

  // 2. List events on the primary calendar in the window we care about.
  const timeMin = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  let pageToken;
  const events = [];
  do {
    const res = await cal.events.list({
      calendarId: 'primary',
      singleEvents: true,
      showDeleted: false,
      timeMin, timeMax,
      maxResults: 2500,
      pageToken
    });
    (res.data.items || []).forEach(e => events.push(e));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  console.log('Calendar events scanned in window: ' + events.length);

  const candidates = events.filter(e => CLASS_SUMMARY.test(e.summary || ''));
  console.log('Class-shaped events: ' + candidates.length);

  const orphans = candidates.filter(e => !trackedIds.has(e.id));
  console.log('ORPHANS (class-shaped events not tracked by any class_instance row): ' + orphans.length);

  // Group orphans by summary prefix (base course id) for easier scanning
  const byBase = {};
  for (const o of orphans) {
    const m = (o.summary || '').match(/^([A-Z0-9_]+)\.\d+/i);
    const base = m ? m[1] : '(unknown)';
    if (!byBase[base]) byBase[base] = [];
    byBase[base].push(o);
  }

  console.log('\nOrphans by base course identifier:');
  for (const base of Object.keys(byBase).sort()) {
    console.log('  ' + base + ' : ' + byBase[base].length + ' orphans');
    for (const o of byBase[base].sort((a, b) => (a.start?.dateTime || '').localeCompare(b.start?.dateTime || ''))) {
      console.log('    ' + o.id + ' | ' + (o.start?.dateTime || o.start?.date) + ' | ' + o.summary + ' | status=' + o.status);
    }
  }

  // Also find DB rows whose google_calendar_event_id points to a missing event
  const presentSet = new Set(events.map(e => e.id));
  const missing = cis.filter(c => !presentSet.has(c.google_calendar_event_id));
  console.log('\nDB rows pointing to a Google event that no longer exists in the window: ' + missing.length);
  for (const c of missing.slice(0, 20)) console.log('  ci=' + c.id + ' (' + c.class_type + ' ' + c.class_date + ') -> ' + c.google_calendar_event_id);

  console.log('\nDone.');
})();
