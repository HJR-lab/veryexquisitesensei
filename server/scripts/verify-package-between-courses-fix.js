// OBSOLETE (06/08/26): assertions snapshot Ivy Tan's March data (course 2 of 3,
// 1 remaining); she has since completed course 3, so those now fail correctly.
// This script also inlines its own copy of the OLD lifetime-count enrichment —
// see scripts/verify-package-position-fix.js for the current shared-helper check.
//
// READ-ONLY verification of the package-between-courses enrichment fix.
// Replicates GET /api/admin/students/:id/enrollment POST-FIX flow exactly.
// Mutates NOTHING. Run from server/: node scripts/verify-package-between-courses-fix.js
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');
const supabaseDb = require('../utils/supabaseDb');

const todayStr = new Date().toISOString().split('T')[0];

// --- exact mirrors of the endpoint helpers (post-fix) ---
async function isActiveEnrollmentEnded(enrollment) {
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, class_instances!bookings_class_instance_id_fkey(class_date)')
    .eq('course_enrollment_id', enrollment.id)
    .in('status', ['booked', 'completed', 'attended']);
  if (!bookings || bookings.length === 0) return false;
  const allPast = bookings.every(b => {
    const d = b.class_instances?.class_date?.split(/[T ]/)[0];
    return d && d < todayStr;
  });
  if (!allPast) return false;
  const credits = await supabaseDb.getEnrollmentCredits(enrollment.id);
  const isHB = enrollment.course_type && enrollment.course_type.toLowerCase().includes('handbuilding');
  if (isHB && credits.remaining > 0) return false;
  const is10 = enrollment.number_of_weeks === 10 && (enrollment.total_weeks === 6 || bookings.length === 6);
  if (is10 && !enrollment.class_credits_allocated) return false;
  if (credits.remaining > 0) return false;
  return true;
}

function makeEnrichPackageProgress(studentId) {
  return async (enrollment) => {
    if (!enrollment.package_total_courses || enrollment.package_total_courses <= 1) return enrollment;
    const { data: pkg } = await supabase
      .from('course_enrollments')
      .select('id, status')
      .eq('student_id', studentId)
      .ilike('course_title', '%3 Course Package%');
    const completedInPackage = (pkg || []).filter(e => e.status === 'completed').length;
    const activeInPackage = (pkg || []).filter(e => e.status === 'active').length;
    return {
      ...enrollment,
      package_courses_completed: completedInPackage,
      package_current_course: completedInPackage + activeInPackage,
      package_courses_remaining: enrollment.package_total_courses - completedInPackage - activeInPackage,
    };
  };
}

// Full post-fix endpoint replication → returns currentEnrollment payload
async function runEndpoint(studentId) {
  const { data: enrollments } = await supabase
    .from('course_enrollments').select('*')
    .eq('student_id', studentId)
    .order('course_start_date', { ascending: false });
  if (!enrollments || enrollments.length === 0) return null;

  const enrichPackageProgress = makeEnrichPackageProgress(studentId);

  const completedEnrollments = enrollments.filter(e => e.status === 'completed');
  const activeEnrollments = [];
  const endedActiveEnrollments = [];
  for (const e of enrollments) {
    if (e.status === 'paused') activeEnrollments.push(e);
    else if (e.status === 'active') {
      if (await isActiveEnrollmentEnded(e)) endedActiveEnrollments.push(e);
      else activeEnrollments.push(e);
    }
  }

  const enrichedEnrollments = [];
  for (let enrollment of activeEnrollments) {
    enrollment = await enrichPackageProgress(enrollment);
    const isUpcoming = enrollment.course_start_date && enrollment.course_start_date > todayStr;
    enrollment = { ...enrollment, display_status: isUpcoming ? 'upcoming' : enrollment.status };
    enrichedEnrollments.push(enrollment);
  }
  enrichedEnrollments.sort((a, b) => {
    if (a.display_status === 'upcoming' && b.display_status !== 'upcoming') return 1;
    if (a.display_status !== 'upcoming' && b.display_status === 'upcoming') return -1;
    return 0;
  });

  const completedHistorySorted = [
    ...endedActiveEnrollments.map(e => ({ ...e, display_status: 'completed' })),
    ...completedEnrollments.map(e => ({ ...e, display_status: 'completed' })),
  ].sort((a, b) => String(b.course_start_date || '').localeCompare(String(a.course_start_date || '')));
  const completedHistoryAll = await Promise.all(completedHistorySorted.map(e => enrichPackageProgress(e)));

  if (enrichedEnrollments.length === 0 && completedHistoryAll.length > 0) {
    enrichedEnrollments.push(completedHistoryAll[0]);
  }
  const currentEnrollment = enrichedEnrollments[0] || null;
  if (!currentEnrollment) return null;
  const history = completedHistoryAll.filter(e => e.id !== currentEnrollment.id);
  return { ...currentEnrollment, completed_history: history, all_enrollments: enrichedEnrollments };
}

function assert(cond, msg) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  return cond;
}

async function main() {
  console.log(`Today=${todayStr}  READ-ONLY (no writes)\n`);

  // ===== Ivy Tan (1186) — package student between courses =====
  console.log('=== Ivy Tan (student 1186) — post-fix endpoint payload ===');
  const ivy = await runEndpoint(1186);
  console.log(`  currentEnrollment.id=${ivy?.id} identifier=${ivy?.course_identifier}`);
  console.log(`  package_total_courses=${ivy?.package_total_courses}`);
  console.log(`  package_courses_completed=${ivy?.package_courses_completed}`);
  console.log(`  package_current_course=${ivy?.package_current_course}`);
  console.log(`  package_courses_remaining=${ivy?.package_courses_remaining}`);
  let ok = true;
  ok &= assert(ivy?.id === 5272, 'currentEnrollment is latest package course (5272)');
  ok &= assert(ivy?.package_total_courses === 3, 'package_total_courses === 3');
  ok &= assert(ivy?.package_courses_completed === 2, 'package_courses_completed === 2 (was undefined pre-fix)');
  ok &= assert(ivy?.package_current_course === 2, 'package_current_course === 2 (was undefined pre-fix)');
  ok &= assert(ivy?.package_courses_remaining === 1, 'package_courses_remaining === 1');

  // Frontend gate (AdminStudentDetail.jsx:370) + next-package-course
  const gate = ivy?.package_total_courses > 1 && ivy?.package_courses_remaining > 0;
  ok &= assert(gate, 'frontend will call next-package-course (gate true)');

  // next-package-course replication for enrollmentId = currentEnrollment.id
  const enr = ivy;
  const { data: pkgAll } = await supabase.from('course_enrollments')
    .select('id, status').eq('student_id', 1186).ilike('course_title', '%3 Course Package%');
  const remaining = enr.package_total_courses
    - (pkgAll || []).filter(e => e.status === 'completed').length
    - (pkgAll || []).filter(e => e.status === 'active').length;
  let endDate = enr.course_end_date;
  const { data: future } = await supabase.from('course_enrollments')
    .select('course_start_date, course_identifier')
    .eq('schedule_pattern', enr.schedule_pattern)
    .eq('class_time', enr.class_time)
    .gt('course_start_date', endDate)
    .not('course_start_date', 'is', null)
    .order('course_start_date', { ascending: true });
  const seen = new Set();
  const uniq = (future || []).filter(c => { if (seen.has(c.course_start_date)) return false; seen.add(c.course_start_date); return true; });
  const next = uniq[0];
  console.log(`  next-package-course → remaining=${remaining} next=${next?.course_identifier} start=${next?.course_start_date}`);
  ok &= assert(remaining === 1, 'next-package-course remaining === 1');
  ok &= assert(next?.course_identifier === 'WT2305PM_DL6', "next course identifier === 'WT2305PM_DL6'");
  ok &= assert(next?.course_start_date === '2026-05-22', "next course start === 2026-05-22 (Sat 23 May cohort)");

  console.log(`\n  IVY OVERALL: ${ok ? 'PASS ✅' : 'FAIL ❌'}`);

  // ===== Regression control: a genuinely-active package/non-package student =====
  console.log('\n=== Regression control: active enrollment student unaffected ===');
  const { data: cands } = await supabase.from('course_enrollments')
    .select('id, student_id').eq('status', 'active').order('id', { ascending: false }).limit(300);
  let controlStudent = null;
  for (const c of cands || []) {
    if (c.student_id === 1186) continue;
    const { data: bks } = await supabase.from('bookings')
      .select('class_instances!bookings_class_instance_id_fkey(class_date)')
      .eq('course_enrollment_id', c.id).in('status', ['booked', 'completed', 'attended']);
    const dates = (bks || []).map(b => b.class_instances?.class_date?.split(/[T ]/)[0]).filter(Boolean);
    if (dates.some(d => d >= todayStr)) { controlStudent = c.student_id; break; }
  }
  if (controlStudent) {
    const ctl = await runEndpoint(controlStudent);
    const stillActive = ctl && (ctl.display_status === 'active' || ctl.display_status === 'upcoming' || ctl.status === 'paused');
    console.log(`  control student ${controlStudent}: currentEnrollment.id=${ctl?.id} display_status=${ctl?.display_status} status=${ctl?.status}`);
    assert(stillActive, 'active-enrollment student still surfaces an active/upcoming enrollment (no regression)');
  } else {
    console.log('  (no active control candidate found — skipped)');
  }

  console.log('\nDone. No database modifications were made.');
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
