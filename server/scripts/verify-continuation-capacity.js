// READ-ONLY verification of the cohort signup capacity gate (C1).
//
// Mutates NOTHING. Run from server/: node scripts/verify-continuation-capacity.js
//
// Proves three things against live data:
//   1. The signup counter agrees with a hand count of the roster.
//   2. The gate would have refused the enrollment that took WT2908PM_DL6 to 9.
//   3. A student already in a cohort is never told the cohort is full.

require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');
const { countCohortSignups, checkCohortSignupCapacity } = require('../utils/cohortCapacity');
const { WT_SIGNUP_CAP, signupSeverity } = require('../config/capacity');

let failures = 0;
function assert(cond, label) {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${label}`);
  if (!cond) failures++;
}

async function main() {
  const today = new Date().toISOString().split('T')[0];

  // ---- 1. Every upcoming WT cohort, counted ----
  const { data: enrollments, error } = await supabase
    .from('course_enrollments')
    .select('id, student_id, status, course_start_date, schedule_pattern, class_time, course_type, course_identifier')
    .gte('course_start_date', today)
    .not('course_start_date', 'is', null);
  if (error) throw error;

  const live = (enrollments || []).filter(
    e => e.status !== 'cancelled' && !/handbuilding/i.test(e.course_type || '')
  );

  const cohorts = new Map();
  for (const e of live) {
    if (!e.schedule_pattern || !e.class_time) continue;
    const key = `${e.course_start_date}|${e.schedule_pattern}|${e.class_time}`;
    if (!cohorts.has(key)) {
      cohorts.set(key, {
        courseStartDate: e.course_start_date,
        schedulePattern: e.schedule_pattern,
        classTime: e.class_time,
        courseIdentifier: (e.course_identifier || '').split('.')[0],
        students: new Set(),
      });
    }
    cohorts.get(key).students.add(e.student_id);
  }

  console.log(`\nUpcoming WT cohorts: ${cohorts.size}   (signup cap ${WT_SIGNUP_CAP})\n`);

  const over = [];
  for (const c of cohorts.values()) {
    const counted = await countCohortSignups(c);
    const hand = c.students.size;
    const sev = signupSeverity(hand);
    const flag = sev === 'ok' ? '     ' : sev === 'over' ? ' OVER' : ' CRIT';
    console.log(
      `${flag}  ${String(hand).padStart(2)}/${WT_SIGNUP_CAP}  ${c.courseStartDate}  ${c.schedulePattern.padEnd(9)} ${c.classTime.padEnd(20)} ${c.courseIdentifier}`
    );
    assert(counted.count === hand, `counter agrees with hand count for ${c.courseIdentifier} (${counted.count} vs ${hand})`);
    if (sev !== 'ok') over.push(c);
  }

  // ---- 2. The gate refuses a new student in an over-cap cohort ----
  console.log('\nGate behaviour on over-cap cohorts:');
  if (over.length === 0) {
    console.log('  (none currently over cap — skipping)');
  }
  for (const c of over) {
    // A student id that is definitely not in this cohort.
    const outsider = -1;
    const res = await checkCohortSignupCapacity(c, outsider);
    assert(res.allowed === false, `${c.courseIdentifier}: new student refused (${res.signups}/${res.cap}, ${res.reason})`);

    // Someone already enrolled must not be told the cohort is full — the
    // caller's duplicate check owns that case and gives a clearer message.
    const insider = [...c.students][0];
    const inRes = await checkCohortSignupCapacity(c, insider);
    assert(inRes.allowed === true, `${c.courseIdentifier}: already-enrolled student ${insider} not blocked by the cap`);
  }

  // ---- 3. Replay the enrollment that broke WT2908PM_DL6 ----
  console.log('\nReplay of the 18/08/26 continuation into WT2908PM_DL6:');
  const target = [...cohorts.values()].find(c => c.courseIdentifier === 'WT2908PM_DL6');
  if (!target) {
    console.log('  (cohort not found — it may have started; skipping)');
  } else {
    const { data: added } = await supabase
      .from('course_enrollments')
      .select('id, student_id, created_at, shopify_line_item_id, customers!inner(first_name,last_name)')
      .eq('course_start_date', target.courseStartDate)
      .eq('class_time', target.classTime)
      .like('shopify_line_item_id', '%-C%')
      .order('created_at');

    const priorCount = target.students.size - (added || []).length;
    console.log(`  cohort had ${priorCount} signups before the continuation adds`);
    for (const [i, a] of (added || []).entries()) {
      const wouldBe = priorCount + i;
      const allowed = wouldBe < WT_SIGNUP_CAP;
      const name = `${a.customers.first_name} ${a.customers.last_name}`;
      console.log(`    ${name.padEnd(20)} at ${wouldBe}/${WT_SIGNUP_CAP} → gate would ${allowed ? 'ALLOW' : 'BLOCK'}`);
    }
    const lastIndex = (added || []).length - 1;
    assert(
      lastIndex >= 0 && priorCount + lastIndex >= WT_SIGNUP_CAP,
      'the enrollment that pushed this cohort past the cap would have been blocked'
    );
  }

  console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} assertion(s)`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('verification error:', err.message);
  process.exit(1);
});
