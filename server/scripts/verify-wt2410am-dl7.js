// Read-only check that WT2410AM is a 7-week Intermediate cohort holding four
// students, and that nothing about it has been activated.
//
// Companion to scripts/transfer-wt2410am-dl7.js. Writes nothing.
//
//   node scripts/verify-wt2410am-dl7.js

require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');

const BASE = 'WT2410AM_DL7';
const START = '2026-10-24';
const TIME = '9:30 AM - 12:00 PM';

const problems = [];
function check(ok, msg) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) problems.push(msg);
}

async function main() {
  // ---- classes ----
  const { data: stale } = await supabase.from('class_instances').select('id').like('class_type', 'WT2410AM_DL6.%');
  check((stale || []).length === 0, `no WT2410AM_DL6.* rows left (found ${(stale || []).length})`);

  const { data: classes } = await supabase.from('class_instances').select('*').like('class_type', `${BASE}.%`).order('class_date');
  check((classes || []).length === 7, `${BASE} has 7 class instances (found ${(classes || []).length})`);

  const expected = ['2026-10-24', '2026-10-31', '2026-11-14', '2026-11-21', '2026-11-28', '2026-12-05', '2026-12-12'];
  const actual = (classes || []).map(c => String(c.class_date).slice(0, 10));
  check(JSON.stringify(actual) === JSON.stringify(expected), `class dates ${actual.join(', ')} (7 Nov skipped, 12 Dec present)`);

  check((classes || []).every(c => c.status === 'draft'), 'every class is still draft');
  check((classes || []).every(c => !c.google_calendar_event_id), 'no class carries a Google Calendar event id');
  check((classes || []).every(c => c.room === 'Studio B' && c.start_time === '9:30 AM'), 'every class is Studio B 9:30 AM');

  // ---- enrollments ----
  const { data: enrollments } = await supabase.from('course_enrollments').select('*')
    .eq('course_start_date', START).eq('class_time', TIME).neq('status', 'cancelled').order('id');
  check((enrollments || []).length === 4, `4 active enrollments in the cohort (found ${(enrollments || []).length})`);
  check((enrollments || []).every(e => e.course_identifier === BASE), `every enrollment carries course_identifier ${BASE}`);
  check((enrollments || []).every(e => e.total_weeks === 7), 'every enrollment has total_weeks = 7');
  check((enrollments || []).every(e => e.course_end_date === '2026-12-12'), 'every enrollment ends 2026-12-12');

  // ---- bookings: 7 per student, all linked to their enrollment ----
  const classIds = (classes || []).map(c => c.id);
  for (const e of enrollments || []) {
    const { data: customer } = await supabase.from('customers').select('first_name, last_name').eq('id', e.student_id).single();
    const name = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim();
    const { data: booked } = await supabase.from('bookings').select('id, class_instance_id, course_enrollment_id')
      .eq('student_id', e.student_id).in('class_instance_id', classIds).eq('status', 'booked');
    const weeks = new Set((booked || []).map(b => b.class_instance_id));
    check((booked || []).length === 7 && weeks.size === 7, `${name} (enr #${e.id}): 7 bookings, one per week (found ${(booked || []).length})`);
    check((booked || []).every(b => b.course_enrollment_id === e.id), `${name}: every booking links to enrollment #${e.id}`);
  }

  // ---- the two package students land here as course 3 of 3 ----
  for (const studentId of [1116, 2228]) {
    const rows = (enrollments || []).filter(e => e.student_id === studentId);
    check(rows.length === 1, `student ${studentId} has exactly one enrollment in this cohort (found ${rows.length})`);
    if (rows.length === 1) {
      check(rows[0].package_courses_remaining === 0, `student ${studentId} enr #${rows[0].id}: package_courses_remaining = 0 (found ${rows[0].package_courses_remaining})`);
    }
    const { data: pending } = await supabase.from('continuation_offers').select('id').eq('student_id', studentId).eq('status', 'pending');
    check((pending || []).length === 0, `student ${studentId} holds no pending continuation offer (found ${(pending || []).length})`);
  }

  // ---- current_enrollment matches reality ----
  for (const c of classes || []) {
    const { data: b } = await supabase.from('bookings').select('id').eq('class_instance_id', c.id).eq('status', 'booked');
    check(c.current_enrollment === (b || []).length, `${c.class_type}: current_enrollment ${c.current_enrollment} matches ${(b || []).length} booked`);
  }

  console.log(problems.length ? `\n${problems.length} PROBLEM(S)` : '\nAll checks passed.');
  process.exitCode = problems.length ? 1 : 0;
}

main().catch(e => { console.error(e); process.exit(1); });
