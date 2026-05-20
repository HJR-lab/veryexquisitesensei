// Read-only verification probe for the "ended active course" classification fix.
// Replicates the NEW classification logic from
// GET /api/admin/students/:id/enrollment (server/routes/admin.js) WITHOUT
// performing any database writes. Mutates NOTHING.
//
// Run from the server/ directory:  node scripts/verify-ended-course-fix.js

require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');
const supabaseDb = require('../utils/supabaseDb');

const todayStr = new Date().toISOString().split('T')[0];

// Mirror of isActiveEnrollmentEnded() in routes/admin.js (read-only).
async function isActiveEnrollmentEnded(enrollment) {
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, class_instances!bookings_class_instance_id_fkey(class_date)')
    .eq('course_enrollment_id', enrollment.id)
    .in('status', ['booked', 'completed', 'attended']);

  if (!bookings || bookings.length === 0) return { ended: false, reason: 'no bookings' };

  const allPast = bookings.every(b => {
    const d = b.class_instances?.class_date?.split(/[T ]/)[0];
    return d && d < todayStr;
  });

  if (!allPast) return { ended: false, reason: 'has future/today booking' };

  const credits = await supabaseDb.getEnrollmentCredits(enrollment.id);

  const isHB = enrollment.course_type && enrollment.course_type.toLowerCase().includes('handbuilding');
  if (isHB && credits.remaining > 0) {
    return { ended: false, reason: `HB with ${credits.remaining} credits remaining` };
  }

  const is10ClassPackage = enrollment.number_of_weeks === 10 && (enrollment.total_weeks === 6 || bookings.length === 6);
  if (is10ClassPackage && !enrollment.class_credits_allocated) {
    return { ended: false, reason: '10-class package owed flex credits' };
  }

  if (credits.remaining > 0) {
    return { ended: false, reason: `${credits.remaining} credits remaining` };
  }

  return { ended: true, reason: `all ${bookings.length} bookings past, 0 credits remaining` };
}

// Classify an enrollment exactly as the endpoint now would.
async function classify(enrollment) {
  if (enrollment.status === 'paused') {
    return { label: 'ACTIVE (paused, unchanged)', detail: 'paused — left as-is' };
  }
  if (enrollment.status === 'completed') {
    return { label: 'ENDED→history (already completed)', detail: 'status=completed' };
  }
  if (enrollment.status === 'active') {
    const r = await isActiveEnrollmentEnded(enrollment);
    if (r.ended) {
      return { label: 'ENDED→history', detail: r.reason };
    }
    const isUpcoming = enrollment.course_start_date && enrollment.course_start_date > todayStr;
    return { label: isUpcoming ? 'UPCOMING' : 'ACTIVE', detail: r.reason };
  }
  return { label: `OTHER (status=${enrollment.status})`, detail: 'not active/paused/completed' };
}

async function dumpStudent(studentId, heading) {
  console.log(`\n=== ${heading} (student ${studentId}) ===`);
  const { data: enrollments, error } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', studentId)
    .order('course_start_date', { ascending: false });

  if (error) {
    console.log('  ERROR:', error.message);
    return [];
  }
  if (!enrollments || enrollments.length === 0) {
    console.log('  (no enrollments)');
    return [];
  }

  const results = [];
  for (const e of enrollments) {
    const c = await classify(e);
    results.push({ enrollment: e, classification: c });
    console.log(
      `  id=${e.id} | ${e.course_identifier || '(no id)'} | status=${e.status} | ` +
      `start=${e.course_start_date || 'n/a'} | nweeks=${e.number_of_weeks} ` +
      `=> ${c.label}  [${c.detail}]`
    );
  }
  return results;
}

async function main() {
  console.log(`Today (UTC date) = ${todayStr}`);
  console.log('READ-ONLY probe — no writes performed.');

  // 1. Charmaine Ng — student 2658
  const charmaine = await dumpStudent(2658, 'Charmaine Ng');

  const e5293 = charmaine.find(r => r.enrollment.id === 5293);
  const e5345 = charmaine.find(r => r.enrollment.id === 5345);

  console.log('\n--- Charmaine assertions ---');
  if (e5293) {
    const ok = e5293.classification.label === 'ENDED→history';
    console.log(`  5293 (${e5293.enrollment.course_identifier}) -> ${e5293.classification.label}  ${ok ? 'PASS (expected ENDED→history)' : 'FAIL (expected ENDED→history)'}`);
  } else {
    console.log('  5293 NOT FOUND — FAIL');
  }
  if (e5345) {
    const lbl = e5345.classification.label;
    const ok = lbl === 'UPCOMING' || lbl === 'ACTIVE';
    console.log(`  5345 (${e5345.enrollment.course_identifier}) -> ${lbl}  ${ok ? 'PASS (still visible — UPCOMING/ACTIVE)' : 'FAIL (should remain visible)'}`);
  } else {
    console.log('  5345 NOT FOUND — FAIL');
  }

  // 2. CONTROL — find a student with a genuinely current active enrollment
  //    (status=active, at least one booking dated today or later).
  console.log('\n=== CONTROL: searching for a genuinely-current active enrollment ===');
  const { data: candidates } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_identifier, status, course_start_date, course_type, number_of_weeks, total_weeks, class_credits_allocated')
    .eq('status', 'active')
    .order('id', { ascending: false })
    .limit(400);

  let control = null;          // any active enrollment with a future booking
  let runningControl = null;   // active course already started (past start) but with a future session
  for (const enr of candidates || []) {
    if (enr.student_id === 2658) continue; // not Charmaine
    const { data: bks } = await supabase
      .from('bookings')
      .select('id, class_instances!bookings_class_instance_id_fkey(class_date)')
      .eq('course_enrollment_id', enr.id)
      .in('status', ['booked', 'completed', 'attended']);
    if (!bks || bks.length === 0) continue;
    const dates = bks.map(b => b.class_instances?.class_date?.split(/[T ]/)[0]).filter(Boolean);
    const hasFuture = dates.some(d => d >= todayStr);
    const hasPast = dates.some(d => d < todayStr);
    if (hasFuture) {
      if (!control) control = enr;
      // Prefer a course that is mid-flight (some sessions done, some upcoming)
      if (!runningControl && hasPast && enr.course_start_date && enr.course_start_date <= todayStr) {
        runningControl = enr;
      }
    }
    if (control && runningControl) break;
  }

  const reportControl = async (enr, kind) => {
    if (!enr) { console.log(`  No ${kind} candidate found.`); return; }
    console.log(`  [${kind}] student ${enr.student_id}, enrollment ${enr.id} (${enr.course_identifier}), start=${enr.course_start_date}`);
    const c = await classify(enr);
    const ok = c.label === 'ACTIVE' || c.label === 'UPCOMING';
    console.log(`  Classified as: ${c.label}  [${c.detail}]  ${ok ? 'PASS (NOT hidden — still active/upcoming)' : 'FAIL (was hidden — BUG)'}`);
  };

  await reportControl(control, 'control: active w/ future booking');
  await reportControl(runningControl, 'control: mid-flight running course (past start, future session)');

  console.log('\nDone. No database modifications were made.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
