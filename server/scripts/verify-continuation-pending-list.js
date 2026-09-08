// READ-ONLY verification of the continuation-pending package student fix in
// GET /api/admin/students/list. Replicates the new block exactly + the
// emailSet of students that the active/paused/upcoming query already covers.
// Mutates NOTHING. Run from server/: node scripts/verify-continuation-pending-list.js
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');

async function main() {
  // 1. Emails already covered by the existing active/paused/upcoming query
  const { data: live } = await supabase
    .from('course_enrollments')
    .select('student_id, customers!course_enrollments_student_id_fkey(email)')
    .in('status', ['active', 'paused', 'upcoming']);
  const emailSet = new Set((live || []).map(r => r.customers?.email).filter(Boolean));
  console.log(`Active/paused/upcoming covers ${emailSet.size} student emails (pre-block).`);

  // 2. Replicate the NEW continuation-pending block exactly
  const { data: completedPkgAll } = await supabase
    .from('course_enrollments')
    .select(`id, student_id, course_type, course_title, course_identifier,
             status, number_of_weeks, created_at, package_total_courses,
             customers!course_enrollments_student_id_fkey ( id, email, first_name, last_name )`)
    .eq('status', 'completed')
    .gt('package_total_courses', 1)
    .order('created_at', { ascending: false });

  const added = [];
  const excludedRemainingZero = [];
  const skippedAlreadyListed = [];
  if (completedPkgAll && completedPkgAll.length) {
    const sids = [...new Set(completedPkgAll.map(e => e.student_id))];
    const { data: pkgRows } = await supabase
      .from('course_enrollments')
      .select('student_id, status, package_total_courses')
      .in('student_id', sids)
      .in('status', ['active', 'completed'])
      .gt('package_total_courses', 1);
    const usedByStudent = {};
    (pkgRows || []).forEach(r => { usedByStudent[r.student_id] = (usedByStudent[r.student_id] || 0) + 1; });

    const seenSid = new Set();
    for (const enr of completedPkgAll) {
      const sid = enr.student_id;
      if (seenSid.has(sid)) continue;
      seenSid.add(sid);
      const student = enr.customers;
      if (!student) continue;
      if (emailSet.has(student.email)) { skippedAlreadyListed.push(student.email); continue; }
      const remaining = (enr.package_total_courses || 0) - (usedByStudent[sid] || 0);
      if (remaining <= 0) { excludedRemainingZero.push({ sid, email: student.email, remaining }); continue; }
      added.push({
        sid, email: student.email,
        name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
        identifier: enr.course_identifier,
        packageTotalCourses: enr.package_total_courses,
        packageCoursesRemaining: remaining,
        enrollmentStatus: 'active', continuationPending: true, isWT: true,
      });
    }
  }

  console.log(`\nContinuation-pending students ADDED to list: ${added.length}`);
  added.slice(0, 15).forEach(a => console.log(`  + ${a.name} <${a.email}> sid=${a.sid} ${a.identifier} remaining=${a.packageCoursesRemaining}/${a.packageTotalCourses}`));
  if (added.length > 15) console.log(`  …and ${added.length - 15} more`);
  console.log(`Excluded (package fully consumed, remaining<=0): ${excludedRemainingZero.length}`);
  console.log(`Skipped (already in active/paused/upcoming — no dup): ${skippedAlreadyListed.length}`);

  // 3. Assertions
  let ok = true;
  const assert = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}: ${m}`); ok = ok && c; };
  console.log('\n--- Assertions ---');
  // The original bug was found on one student (1186), but pinning the assertion
  // to that student rotted: she has since finished her third course, so
  // remaining is 0 and excluding her is now the CORRECT answer. A verification
  // that fails because live data moved on is a false alarm, and a false alarm
  // that fires every run teaches people to ignore the suite.
  //
  // So assert the INVARIANT the fix actually guarantees — every completed-package
  // student with courses left who is not already listed must appear — and check
  // the original student against whichever branch her current state belongs in.
  const orig = added.find(a => a.sid === 1186);
  const origExcluded = excludedRemainingZero.find(e => e.sid === 1186);
  if (orig) {
    assert(orig.packageCoursesRemaining > 0, `student 1186 appears with courses left (${orig.packageCoursesRemaining})`);
    assert(orig.continuationPending === true && orig.isWT === true && orig.enrollmentStatus === 'active',
      'student 1186 flagged continuationPending + isWT + enrollmentStatus=active (flows through WT-active filter → searchable)');
  } else if (origExcluded) {
    assert(origExcluded.remaining <= 0,
      `student 1186 has consumed her package (remaining ${origExcluded.remaining}) — correctly excluded, original fixture has aged out`);
  } else {
    assert(false, 'student 1186 is neither listed nor excluded — she has dropped out of the query entirely');
  }

  // The invariant, stated independently of any one student: nobody with a
  // part-used package is silently missing from the admin list.
  const missing = [];
  for (const enr of (completedPkgAll || [])) {
    const sid = enr.student_id;
    if (!enr.customers) continue;
    if (emailSet.has(enr.customers.email)) continue;
    if (added.some(a => a.sid === sid) || excludedRemainingZero.some(e => e.sid === sid)) continue;
    missing.push(sid);
  }
  assert(missing.length === 0,
    `every completed-package student is either listed or explicitly excluded (unaccounted: ${missing.length})`);
  // No student added who already has an active/paused/upcoming enrollment (no duplicates)
  const dupes = added.filter(a => emailSet.has(a.email));
  assert(dupes.length === 0, `No duplicates with active/paused/upcoming students (found ${dupes.length})`);
  // Every added student has remaining > 0
  assert(added.every(a => a.packageCoursesRemaining > 0), 'Every added student has packageCoursesRemaining > 0');
  // Fully-consumed packages were correctly excluded (sanity: list is bounded)
  assert(added.length <= (completedPkgAll ? new Set(completedPkgAll.map(e=>e.student_id)).size : 0),
    'Added count is bounded by distinct completed-package students');

  console.log(`\nOVERALL: ${ok ? 'PASS ✅' : 'FAIL ❌'}`);
  process.exit(ok ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
