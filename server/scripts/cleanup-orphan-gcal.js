// Deletes orphan Google Calendar events — class-shaped events on the primary
// calendar that are NOT pointed to by any class_instances.google_calendar_event_id.
// Re-uses the detection logic from find-all-orphan-gcal.js.
//
// Safe by default — prints what it WOULD delete unless --apply is passed.
//
//   node scripts/cleanup-orphan-gcal.js              # dry run
//   node scripts/cleanup-orphan-gcal.js --apply      # actually delete

require('dotenv').config();
const { google } = require('googleapis');
const { supabase } = require('../utils/supabaseDb');

const APPLY = process.argv.includes('--apply');

const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
auth.setCredentials({ refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN });
const cal = google.calendar({ version: 'v3', auth });

const CLASS_SUMMARY = /^(WT|HB)[A-Z0-9_]+\.\d+/i;

async function findOrphans() {
  const { data: cis } = await supabase
    .from('class_instances')
    .select('google_calendar_event_id')
    .not('google_calendar_event_id', 'is', null);
  const trackedIds = new Set(cis.map(c => c.google_calendar_event_id));

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

  return events
    .filter(e => CLASS_SUMMARY.test(e.summary || ''))
    .filter(e => !trackedIds.has(e.id));
}

(async () => {
  const orphans = await findOrphans();
  console.log('Orphans found: ' + orphans.length);
  for (const o of orphans) {
    console.log('  ' + o.id + ' | ' + (o.start?.dateTime || o.start?.date) + ' | ' + o.summary);
  }
  if (orphans.length === 0) { console.log('Nothing to delete.'); return; }

  if (!APPLY) {
    console.log('\n[DRY RUN] pass --apply to actually delete these events.');
    return;
  }

  console.log('\nDeleting ' + orphans.length + ' orphan events…');
  let ok = 0, fail = 0;
  for (const o of orphans) {
    try {
      await cal.events.delete({ calendarId: 'primary', eventId: o.id });
      ok++;
      process.stdout.write('.');
    } catch (e) {
      fail++;
      console.log('\n  FAILED ' + o.id + ': ' + e.message);
    }
  }
  console.log('\nDone. deleted=' + ok + ' failed=' + fail);
})();
