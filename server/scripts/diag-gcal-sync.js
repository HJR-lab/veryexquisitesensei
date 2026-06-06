// READ-ONLY diagnostic for the Google Calendar sync.
// Mutates NOTHING. Verifies: token validity, which account/calendar the token
// controls, and whether stored google_calendar_event_id values resolve to live
// events with current data.
//
// Run from server/:  node scripts/diag-gcal-sync.js
require('dotenv').config();
const { google } = require('googleapis');
const { supabase } = require('../utils/supabaseDb');

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);
const REFRESH_TOKEN = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
if (REFRESH_TOKEN) auth.setCredentials({ refresh_token: REFRESH_TOKEN });
const cal = google.calendar({ version: 'v3', auth });

(async () => {
  console.log('REFRESH_TOKEN present:', !!REFRESH_TOKEN);
  console.log('CLIENT_ID present:', !!process.env.GOOGLE_CLIENT_ID);
  if (!REFRESH_TOKEN) { console.log('Sync DISABLED — no refresh token.'); return; }

  // Reconcile mode: compare every future class_instance's DB date/time to its
  // calendar event. Read-only. Reports mismatches.
  if (process.argv[2] === 'reconcile') {
    const { data: classes } = await supabase
      .from('class_instances')
      .select('id, class_type, class_date, start_time, status, google_calendar_event_id')
      .gte('class_date', new Date().toISOString().split('T')[0])
      .not('google_calendar_event_id', 'is', null)
      .order('class_date', { ascending: true });
    let mismatches = 0, missing = 0, ok = 0;
    for (const ci of (classes || [])) {
      const dbDate = (ci.class_date || '').split(/[T ]/)[0];
      try {
        const ev = await cal.events.get({ calendarId: 'primary', eventId: ci.google_calendar_event_id });
        const calDate = (ev.data.start?.dateTime || ev.data.start?.date || '').split('T')[0];
        if (ev.data.status === 'cancelled') { console.log(`  GONE  ci#${ci.id} ${ci.class_type} db=${dbDate} (calendar event deleted)`); missing++; }
        else if (calDate !== dbDate) { console.log(`  DRIFT ci#${ci.id} ${ci.class_type} db=${dbDate} cal=${calDate}`); mismatches++; }
        else ok++;
      } catch (e) {
        console.log(`  MISS  ci#${ci.id} ${ci.class_type} db=${dbDate} -> ${e.code || e.response?.status}`);
        missing++;
      }
    }
    console.log(`\nReconcile: ${ok} OK, ${mismatches} date-drift, ${missing} missing/deleted, of ${(classes||[]).length} future synced classes.`);
    return;
  }

  // If event IDs are passed as args, probe just those and exit.
  const ARG_IDS = process.argv.slice(2);
  if (ARG_IDS.length) {
    for (const id of ARG_IDS) {
      try {
        const ev = await cal.events.get({ calendarId: 'primary', eventId: id });
        console.log(`  ${id}: status=${ev.data.status} summary="${ev.data.summary}" start=${ev.data.start?.dateTime || ev.data.start?.date}`);
      } catch (e) {
        console.log(`  ${id}: ${e.code || e.response?.status} ${e.message}`);
      }
    }
    return;
  }

  // 1) Can we get a token at all? Which account does it belong to?
  try {
    const { token } = await auth.getAccessToken();
    console.log('Access token obtained:', !!token);
  } catch (e) {
    console.log('!! getAccessToken FAILED:', e.message);
    console.log('   -> refresh token is invalid/revoked. This breaks ALL sync.');
    return;
  }

  // 2) Which calendars can this account see? 'primary' = the token account itself.
  try {
    const list = await cal.calendarList.list();
    console.log('\nCalendars visible to this token account:');
    (list.data.items || []).forEach(c => {
      console.log(`  ${c.primary ? '* PRIMARY' : '        '}  ${c.id}  (access: ${c.accessRole})`);
    });
  } catch (e) {
    console.log('!! calendarList.list FAILED:', e.message);
  }

  // 3) Probe stored event ids against calendarId='primary' (what sync uses).
  const { data: classes } = await supabase
    .from('class_instances')
    .select('id, class_type, class_date, start_time, status, google_calendar_event_id')
    .gte('class_date', new Date().toISOString().split('T')[0])
    .not('google_calendar_event_id', 'is', null)
    .order('class_date', { ascending: true })
    .limit(8);

  console.log('\nProbing stored event ids on calendarId="primary":');
  for (const ci of (classes || [])) {
    try {
      const ev = await cal.events.get({ calendarId: 'primary', eventId: ci.google_calendar_event_id });
      const start = ev.data.start?.dateTime || ev.data.start?.date;
      console.log(`  OK   ci#${ci.id} ${ci.class_type} db=${(ci.class_date||'').split('T')[0]} ${ci.start_time}`);
      console.log(`       gcal: status=${ev.data.status} summary="${ev.data.summary}" start=${start}`);
    } catch (e) {
      const code = e.code || e.response?.status;
      console.log(`  FAIL ci#${ci.id} ${ci.class_type} eventId=${ci.google_calendar_event_id} -> ${code} ${e.message}`);
    }
  }

  // 4) What does the calendar actually contain in the next 30 days?
  try {
    const now = new Date();
    const in30 = new Date(Date.now() + 30 * 86400000);
    const ev = await cal.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: in30.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20,
    });
    console.log(`\nNext-30-day events actually on primary (${(ev.data.items||[]).length} shown):`);
    (ev.data.items || []).forEach(e => {
      console.log(`  ${(e.start?.dateTime||e.start?.date)}  ${e.summary}`);
    });
  } catch (e) {
    console.log('!! events.list FAILED:', e.message);
  }
})();
