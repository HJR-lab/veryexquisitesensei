/**
 * Report: 10-class package students holding classes they have never booked.
 *
 * These are the students the email never told to book their flex classes, and
 * whom the /classes banner skipped (number_of_weeks === 10 was excluded). Read
 * only — writes nothing, sends nothing.
 *
 * Counted the way the app counts: a booking in any state that occupies a seat
 * (booked/attended/completed/rescheduled/absent/forfeited) is spent, so unbooked
 * = number_of_weeks - those. Cancelled enrollments are ignored.
 *
 * Run from server/:  node scripts/list-unbooked-package-credits.js
 */
require('dotenv').config();

const { supabase } = require('../utils/supabaseDb');

const SPENT = ['booked', 'attended', 'completed', 'rescheduled', 'absent', 'forfeited'];

(async () => {
  const { data: enrollments, error } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_identifier, course_title, number_of_weeks, status, created_at, customers(first_name, last_name, email)')
    .eq('number_of_weeks', 10)
    .neq('status', 'cancelled');

  if (error) {
    console.error('query failed:', error.message);
    process.exit(1);
  }

  const rows = [];
  for (const e of enrollments || []) {
    // The FK must be named explicitly: bookings has TWO references to
    // class_instances (class_instance_id and original_class_instance_id), so a
    // bare class_instances(...) embed errors as ambiguous. Left unchecked that
    // error returns no rows, which reads as "this student booked nothing" —
    // every enrollment then looks completely unbooked.
    const { data: bookings, error: bookingError } = await supabase
      .from('bookings')
      .select('id, status, class_instances!bookings_class_instance_id_fkey(class_date)')
      .eq('course_enrollment_id', e.id);

    if (bookingError) {
      console.error(`bookings query failed for enrollment ${e.id}: ${bookingError.message}`);
      process.exit(1);
    }

    const spent = (bookings || []).filter(b => SPENT.includes(b.status)).length;
    const unbooked = (e.number_of_weeks || 10) - spent;
    if (unbooked <= 0) continue;

    const dates = (bookings || [])
      .map(b => b.class_instances?.class_date)
      .filter(Boolean)
      .sort();

    rows.push({
      name: `${e.customers?.first_name || ''} ${e.customers?.last_name || ''}`.trim() || '(no name)',
      email: e.customers?.email || '(no email)',
      cohort: e.course_identifier || '—',
      status: e.status,
      booked: spent,
      unbooked,
      lastClass: dates.length ? String(dates[dates.length - 1]).split('T')[0] : '—',
      purchased: e.created_at ? String(e.created_at).split('T')[0] : '—',
    });
  }

  rows.sort((a, b) => b.unbooked - a.unbooked || a.name.localeCompare(b.name));

  console.log(`\n${rows.length} package enrollment(s) with classes still unbooked\n`);
  console.log('unbooked  booked  status     cohort              last class   purchased    student');
  console.log('─'.repeat(112));
  for (const r of rows) {
    console.log(
      `${String(r.unbooked).padStart(5)}     ${String(r.booked).padStart(4)}    ` +
      `${r.status.padEnd(10)} ${r.cohort.padEnd(19)} ${r.lastClass.padEnd(12)} ${r.purchased.padEnd(12)} ` +
      `${r.name} <${r.email}>`
    );
  }

  const totalClasses = rows.reduce((n, r) => n + r.unbooked, 0);
  const finished = rows.filter(r => r.status === 'completed').length;
  console.log('─'.repeat(112));
  console.log(`${totalClasses} unbooked classes across ${rows.length} students · ${finished} on enrollments already marked completed\n`);

  process.exit(0);
})();
