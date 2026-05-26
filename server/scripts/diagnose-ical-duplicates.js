// Read-only diagnostic for "iCal shows 2 sets of WT2805NT_JL6" and
// "WT3005AM_DL7.1 missing Sarah Cher" symptoms.
// Mutates NOTHING. Prints a table per affected course identifier.
//
// Run from server/:  node scripts/diagnose-ical-duplicates.js
//
// Optional: pass one or more base identifiers as CLI args, e.g.:
//   node scripts/diagnose-ical-duplicates.js WT2805NT_JL6 WT3005AM_DL7

require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');

const BASES = process.argv.slice(2);
if (BASES.length === 0) BASES.push('WT2805NT_JL6', 'WT3005AM_DL7');

function getBase(id) {
  if (!id) return '';
  const i = id.lastIndexOf('.');
  return i > 0 ? id.substring(0, i) : id;
}

async function diagnoseBase(baseId) {
  console.log('\n=== ' + baseId + ' ===');

  const { data: classes, error } = await supabase
    .from('class_instances')
    .select('id, class_type, class_date, start_time, end_time, status, google_calendar_event_id, current_enrollment, created_at')
    .ilike('class_type', baseId + '%')
    .order('class_date', { ascending: true })
    .order('id', { ascending: true });

  if (error) { console.error('  ERROR:', error.message); return; }
  if (!classes || classes.length === 0) { console.log('  (no class_instances found)'); return; }

  // Group by (class_type, class_date, start_time) — duplicates if size > 1
  const groups = {};
  for (const c of classes) {
    const k = c.class_type + '|' + (c.class_date || '').split('T')[0] + '|' + (c.start_time || '');
    if (!groups[k]) groups[k] = [];
    groups[k].push(c);
  }

  const dupKeys = Object.keys(groups).filter(k => groups[k].length > 1);
  console.log('  total class_instance rows: ' + classes.length);
  console.log('  unique (type,date,start_time) slots: ' + Object.keys(groups).length);
  console.log('  DUPLICATE slots (>=2 rows for same slot): ' + dupKeys.length);

  // Pull booking counts per class_instance id
  const ids = classes.map(c => c.id);
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, class_instance_id, student_id, status, course_enrollment_id, customers:student_id(first_name, last_name)')
    .in('class_instance_id', ids);

  const bookingsByCI = {};
  for (const b of (bookings || [])) {
    if (!bookingsByCI[b.class_instance_id]) bookingsByCI[b.class_instance_id] = [];
    bookingsByCI[b.class_instance_id].push(b);
  }

  console.log('\n  Per-row breakdown (id | type | date | time | status | gcal_event | active_bookings | created_at):');
  for (const c of classes) {
    const bs = bookingsByCI[c.id] || [];
    const active = bs.filter(b => ['booked','completed','attended'].includes(b.status)).length;
    const ge = c.google_calendar_event_id ? 'YES('+c.google_calendar_event_id.slice(0,8)+'…)' : 'NO';
    console.log('    ' + [c.id, c.class_type, (c.class_date||'').split('T')[0], c.start_time, c.status, ge, active+'/'+bs.length, c.created_at].join(' | '));
  }

  if (dupKeys.length > 0) {
    console.log('\n  Duplicate slot detail:');
    for (const k of dupKeys) {
      const rows = groups[k];
      console.log('    SLOT ' + k + ' has ' + rows.length + ' class_instance rows:');
      for (const r of rows) {
        const bs = bookingsByCI[r.id] || [];
        const names = bs
          .filter(b => ['booked','completed','attended'].includes(b.status))
          .map(b => ((b.customers?.first_name||'') + ' ' + (b.customers?.last_name||'')).trim())
          .filter(Boolean);
        console.log('      id=' + r.id + ' gcal=' + (r.google_calendar_event_id || 'null') + ' bookings=[' + names.join(', ') + ']');
      }
    }
  }

  // Search for any student name that resembles "Sarah Cher" if base looks like that course
  if (/DL7/i.test(baseId)) {
    const { data: sarah } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email')
      .or('first_name.ilike.%sarah%,last_name.ilike.%cher%')
      .limit(20);
    console.log('\n  Candidate students matching Sarah/Cher: ' + (sarah || []).length);
    for (const s of (sarah || [])) {
      // Check her enrollments + bookings for this base
      const { data: enrs } = await supabase
        .from('course_enrollments')
        .select('id, course_identifier, course_type, course_start_date, status')
        .eq('student_id', s.id);
      const matchingEnr = (enrs || []).filter(e => (e.course_identifier || '').startsWith(baseId));
      console.log('    ' + s.id + ' ' + s.first_name + ' ' + s.last_name + ' (' + s.email + ')');
      if (matchingEnr.length) {
        console.log('      matching enrollments for ' + baseId + ':');
        for (const e of matchingEnr) console.log('        enrollment id=' + e.id + ' identifier=' + e.course_identifier + ' status=' + e.status);
        const enrIds = matchingEnr.map(e => e.id);
        const { data: sbookings } = await supabase
          .from('bookings')
          .select('id, class_instance_id, status, class_instances!bookings_class_instance_id_fkey(class_type, class_date)')
          .in('course_enrollment_id', enrIds);
        for (const b of (sbookings || [])) {
          console.log('        booking id=' + b.id + ' ci=' + b.class_instance_id + ' type=' + b.class_instances?.class_type + ' date=' + b.class_instances?.class_date + ' status=' + b.status);
        }
      }
    }
  }
}

(async () => {
  for (const b of BASES) {
    try { await diagnoseBase(b); }
    catch (e) { console.error('Error diagnosing ' + b + ':', e.message); }
  }
  console.log('\nDone.');
})();
