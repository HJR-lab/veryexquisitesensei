/**
 * Re-sync and then READ BACK the Google Calendar events for WT1009AM_JL6, so
 * the roster/date/time on the studio calendar is verified against the DB
 * rather than assumed from a resolved promise.
 *
 * Run from server/:  node scripts/verify-gcal-wt1009am.js [--sync]
 */
require('dotenv').config({ path: __dirname + '/../.env' });

const { google } = require('googleapis');
const { supabase } = require('../utils/supabaseDb');
const calendarSync = require('../utils/calendarSync');
const { toYmd, weekdayName } = require('../utils/sgtDate');

const COURSE = 'WT1009AM_JL6';
const SYNC = process.argv.includes('--sync');

const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
auth.setCredentials({ refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN });
const cal = google.calendar({ version: 'v3', auth });

(async () => {
  console.log(`calendar sync enabled: ${calendarSync.isEnabled()}`);
  if (!calendarSync.isEnabled()) throw new Error('GOOGLE_CALENDAR_REFRESH_TOKEN not set — cannot sync');

  const { data: classes, error } = await supabase
    .from('class_instances')
    .select('id, class_type, class_date, start_time, end_time, status, instructor, google_calendar_event_id')
    .like('class_type', `${COURSE}.%`)
    .order('class_date');
  if (error) throw error;

  if (SYNC) {
    console.log('\n=== syncClassInstance results (real status objects) ===');
    for (const c of classes) {
      const r = await calendarSync.syncClassInstance(c.id);
      console.log(`  #${c.id} ${c.class_type}: ${JSON.stringify(r)}`);
      if (r.status === 'failed') process.exitCode = 1;
    }
  }

  // Re-read: syncClassInstance may have written a new event id.
  const { data: after } = await supabase
    .from('class_instances')
    .select('id, class_type, class_date, start_time, end_time, status, instructor, google_calendar_event_id')
    .like('class_type', `${COURSE}.%`)
    .order('class_date');

  console.log('\n=== live Google Calendar events ===');
  const problems = [];
  for (const c of after) {
    if (!c.google_calendar_event_id) { problems.push(`#${c.id} ${c.class_type} has no google_calendar_event_id`); continue; }
    let ev;
    try {
      ({ data: ev } = await cal.events.get({ calendarId: 'primary', eventId: c.google_calendar_event_id }));
    } catch (e) {
      problems.push(`#${c.id} ${c.class_type} event ${c.google_calendar_event_id} unreadable: ${e.message}`);
      continue;
    }

    const expectDate = toYmd(c.class_date);
    const gotDate = (ev.start?.dateTime || ev.start?.date || '').split('T')[0];
    const gotTime = (ev.start?.dateTime || '').split('T')[1] || '';
    const names = (ev.description || '').split('\n').filter(l => /^\d+\./.test(l)).map(l => l.trim());

    console.log(`\n  #${c.id} ${c.class_type}  ${ev.summary}`);
    console.log(`    gcal   : ${gotDate} ${gotTime} (${ev.start?.timeZone})  eventStatus=${ev.status}`);
    console.log(`    db     : ${expectDate} ${c.start_time}-${c.end_time} ${weekdayName(c.class_date).slice(0,3)} classStatus=${c.status}`);
    console.log(`    roster : ${names.join(' | ') || '(none)'}`);

    if (gotDate !== expectDate) problems.push(`#${c.id} gcal date ${gotDate} != db ${expectDate}`);
    if (!gotTime.startsWith('09:30')) problems.push(`#${c.id} gcal start ${gotTime} is not 09:30`);
    if (ev.status === 'cancelled') problems.push(`#${c.id} gcal event is cancelled`);
    if (ev.summary !== c.class_type) problems.push(`#${c.id} gcal summary "${ev.summary}" != class_type "${c.class_type}"`);
    // Both cohort students must be on every roster. The headcount itself is NOT
    // asserted: now that the cohort is active its classes are bookable on
    // /book-makeup, so makeup students legitimately join a roster at any time.
    if (names.length < 2) problems.push(`#${c.id} gcal roster lists ${names.length} student(s), expected at least 2`);
    if (!/Vernicia Neo/.test(ev.description || '')) problems.push(`#${c.id} Vernicia Neo missing from gcal roster`);
    if (!/Cynthia Ong/.test(ev.description || '')) problems.push(`#${c.id} Cynthia Ong missing from gcal roster`);
    if (!/Instructor: Joyce Lim/.test(ev.description || '')) problems.push(`#${c.id} instructor not Joyce Lim on gcal`);
  }

  console.log('\n=== VERIFY ===');
  if (problems.length) { problems.forEach(p => console.log(`  ✗ ${p}`)); process.exitCode = 1; }
  else console.log('  ✓ all 6 events live on the studio calendar, Thursdays 09:30 SGT, both students on every roster');
})().catch(err => { console.error('\nFAILED:', err.message); process.exit(1); });
