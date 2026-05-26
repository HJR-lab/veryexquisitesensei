// Read-only — checks Sarah Cher's enrollment & booking timestamps vs the
// Google Calendar event's updated timestamp, plus the WT0206NT_JL6 cohort state.

require('dotenv').config();
const { google } = require('googleapis');
const { supabase } = require('../utils/supabaseDb');

const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
auth.setCredentials({ refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN });
const cal = google.calendar({ version: 'v3', auth });

(async () => {
  console.log('--- Sarah Cher enrollment + booking timestamps ---');
  const sarahId = 1197;
  const { data: enrs } = await supabase
    .from('course_enrollments')
    .select('id, course_identifier, course_type, status, created_at, updated_at')
    .eq('student_id', sarahId)
    .ilike('course_identifier', 'WT3005AM_DL7%');
  console.log('Enrollments:');
  console.log(enrs);

  const { data: bs } = await supabase
    .from('bookings')
    .select('id, class_instance_id, status, booking_date, created_at, updated_at')
    .in('course_enrollment_id', (enrs || []).map(e => e.id))
    .order('class_instance_id', { ascending: true });
  console.log('Bookings:');
  console.log(bs);

  // What does the DB say about peer cohort enrollments?
  console.log('\n--- Peer enrollments in DL7 cohort ---');
  const { data: peers } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_identifier, status, created_at, customers:student_id(first_name,last_name)')
    .ilike('course_identifier', 'WT3005AM_DL7%')
    .order('created_at', { ascending: true });
  console.log(peers);

  // When was the calendar event last updated?
  console.log('\n--- WT3005AM_DL7.1 calendar event timestamps ---');
  const ev = await cal.events.get({ calendarId: 'primary', eventId: 'rbt276tm15085pdill2cbll2r8' });
  console.log({ created: ev.data.created, updated: ev.data.updated, status: ev.data.status });

  // WT0206NT_JL6 cohort state
  console.log('\n--- WT0206NT_JL6 cohort state in DB ---');
  const { data: cis } = await supabase
    .from('class_instances')
    .select('id, class_type, class_date, status, google_calendar_event_id')
    .ilike('class_type', 'WT0206NT_JL6%');
  console.log(cis);

  console.log('\nDone.');
})();
