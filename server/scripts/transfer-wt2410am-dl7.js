// WT2410AM was sold as "Wheelthrowing Intermediate 7 Weeks" (24 Oct - 12 Dec,
// no class 7 Nov) but formed as a 6-class _DL6 cohort: total_weeks defaulted
// to 6 and createClassesAndBookings sized the cohort from it. This script
//
//   1. renames WT2410AM_DL6.1-6 -> WT2410AM_DL7.1-6 and adds DL7.7 on 12 Dec
//   2. corrects Inge Bukit (5511) + Lynn Sng (5513): identifier, total_weeks 7,
//      end date 12 Dec, and books them into DL7.7
//   3. places Mitchell Chan (1116) + Sarah Ong (2228) — 3x6wk package order
//      6707957039262, course 2 of 3 ends 3 Oct — into WT2410AM_DL7 as their
//      course 3 (an agreed transfer to Intermediate), via
//      addStudentToExistingCohort, the same path a new buyer takes.
//
// The cohort is left DRAFT. It now holds 4 students, but activating it pushes
// it to gcal and runs the credit sweep — that is a separate, deliberate step.
// No emails are sent.
//
//   node scripts/transfer-wt2410am-dl7.js           # dry run
//   node scripts/transfer-wt2410am-dl7.js --apply

require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');
const supabaseDb = require('../utils/supabaseDb');
const { addStudentToExistingCohort } = require('../utils/courseEnrollmentManager');
const { initialRoomCapacity } = require('../config/capacity');
const { syncStoredCredits } = supabaseDb;
for (const fn of ['createCourseEnrollment', 'createMultipleBookings', 'updateClassEnrollment', 'syncStoredCredits']) {
  if (typeof supabaseDb[fn] !== 'function') { console.error(`ABORT: supabaseDb.${fn} missing`); process.exit(1); }
}

const APPLY = process.argv.includes('--apply');
const OLD_BASE = 'WT2410AM_DL6';
const NEW_BASE = 'WT2410AM_DL7';
const CLASS7_DATE = '2026-12-12';
const COHORT_ENROLLMENTS = [5511, 5513]; // Inge Bukit, Lynn Sng
const MOVERS = [
  { studentId: 1116, name: 'Mitchell Chan', currentEnrollmentId: 5472 },
  { studentId: 2228, name: 'Sarah Ong', currentEnrollmentId: 5473 },
];

function die(msg) { console.error(`ABORT: ${msg}`); process.exit(1); }

async function main() {
  console.log(APPLY ? '*** APPLY ***' : '--- dry run (pass --apply to write) ---');

  // ---------- preconditions ----------
  const { data: oldClasses } = await supabase
    .from('class_instances').select('*').like('class_type', `${OLD_BASE}.%`).order('class_date');
  const { data: newExisting } = await supabase
    .from('class_instances').select('*').like('class_type', `${NEW_BASE}.%`).order('class_date');

  const alreadyRenamed = (oldClasses || []).length === 0 && (newExisting || []).length >= 6;
  if (!alreadyRenamed) {
    if ((oldClasses || []).length !== 6) die(`expected 6 ${OLD_BASE} classes, found ${(oldClasses || []).length}`);
    if ((newExisting || []).length) die(`${NEW_BASE} classes already exist alongside ${OLD_BASE}`);
    if (oldClasses.some(c => c.status !== 'draft')) die('cohort is no longer draft — re-check before changing it');
  }

  const { data: cohortEnr } = await supabase
    .from('course_enrollments').select('*').in('id', COHORT_ENROLLMENTS);
  if ((cohortEnr || []).length !== 2 || cohortEnr.some(e => e.status !== 'active' || e.course_type !== 'Wheelthrowing Intermediate')) {
    die('Inge/Lynn enrollments not in the expected state');
  }
  const peer = cohortEnr.find(e => e.id === 5511);

  const moverRows = [];
  for (const m of MOVERS) {
    const { data: cur } = await supabase.from('course_enrollments').select('*').eq('id', m.currentEnrollmentId).single();
    if (!cur || cur.student_id !== m.studentId) die(`${m.name}: enrollment ${m.currentEnrollmentId} does not belong to student ${m.studentId}`);
    if (cur.shopify_order_id !== '6707957039262' || cur.package_total_courses !== 3) die(`${m.name}: not the expected 3-course package`);
    const { data: existing } = await supabase.from('course_enrollments').select('id, status')
      .eq('student_id', m.studentId).eq('course_start_date', '2026-10-24');
    moverRows.push({ ...m, cur, existing: existing || [] });
    console.log(`${m.name}: course 2 = ${cur.course_identifier} (${cur.status}), package_courses_remaining=${cur.package_courses_remaining}, already in 24 Oct: ${(existing || []).map(e => e.id).join(',') || 'no'}`);
    if (cur.package_courses_remaining !== 1 && !(existing || []).length) die(`${m.name}: expected 1 course remaining`);
  }

  // ---------- 1. rename + class 7 ----------
  if (!alreadyRenamed) {
    for (const c of oldClasses) {
      const week = c.class_type.split('.').pop();
      const newType = `${NEW_BASE}.${week}`;
      const cap = initialRoomCapacity(newType, 10);
      console.log(`rename ${c.id} ${c.class_type} -> ${newType}  (${String(c.class_date).slice(0, 10)}, cap ${c.max_capacity} -> ${cap})`);
      if (APPLY) {
        const { error } = await supabase.from('class_instances')
          .update({ class_type: newType, max_capacity: cap, updated_at: new Date().toISOString() }).eq('id', c.id);
        if (error) die(`rename ${c.id}: ${error.message}`);
      }
    }
  } else {
    console.log(`classes already renamed to ${NEW_BASE}`);
  }

  const { data: class7Existing } = await supabase.from('class_instances').select('*').eq('class_type', `${NEW_BASE}.7`);
  let class7 = class7Existing?.[0];
  if (!class7) {
    const template = (oldClasses || [])[0] || (newExisting || [])[0] || {};
    const stamp = new Date().toISOString();
    const row = {
      class_date: CLASS7_DATE,
      start_time: template.start_time || '9:30 AM',
      end_time: template.end_time || '12:00 PM',
      class_type: `${NEW_BASE}.7`,
      instructor: template.instructor || 'Dillon Lin',
      room: template.room || 'Studio B',
      max_capacity: initialRoomCapacity(`${NEW_BASE}.7`, 14),
      current_enrollment: 0,
      status: 'draft',
      is_glazing: false,
      created_at: stamp,
      updated_at: stamp,
    };
    // (date, time, room) is unique — make sure nothing else holds that slot.
    const { data: clash } = await supabase.from('class_instances').select('id, class_type')
      .eq('class_date', CLASS7_DATE).eq('start_time', row.start_time).eq('room', row.room);
    if ((clash || []).length) die(`12 Dec ${row.start_time} ${row.room} already taken by ${clash.map(c => c.class_type).join(',')}`);
    console.log(`create ${row.class_type} on ${CLASS7_DATE} ${row.start_time}-${row.end_time} ${row.room}, cap ${row.max_capacity}, draft`);
    if (APPLY) {
      const { data, error } = await supabase.from('class_instances').insert(row).select().single();
      if (error) die(`create class 7: ${error.message}`);
      class7 = data;
    }
  } else {
    console.log(`${NEW_BASE}.7 already exists (${class7.id})`);
  }

  // ---------- 2. Inge + Lynn ----------
  for (const e of cohortEnr) {
    console.log(`enrollment ${e.id} (student ${e.student_id}): ${e.course_identifier} -> ${NEW_BASE}, total_weeks ${e.total_weeks} -> 7, end ${e.course_end_date} -> ${CLASS7_DATE}, + book DL7.7`);
    if (!APPLY) continue;
    const { error } = await supabase.from('course_enrollments').update({
      course_identifier: NEW_BASE, total_weeks: 7, course_end_date: CLASS7_DATE, updated_at: new Date().toISOString(),
    }).eq('id', e.id);
    if (error) die(`update enrollment ${e.id}: ${error.message}`);

    const { data: held } = await supabase.from('bookings').select('id')
      .eq('student_id', e.student_id).eq('class_instance_id', class7.id).eq('status', 'booked');
    if (!(held || []).length) {
      const now = new Date().toISOString();
      await supabaseDb.createMultipleBookings([{
        student_id: e.student_id, class_instance_id: class7.id, status: 'booked', booking_type: 'regular',
        course_enrollment_id: e.id, booking_date: now, created_at: now, updated_at: now,
      }]);
      await supabaseDb.updateClassEnrollment(class7.id, 1);
    }
    await syncStoredCredits(e.id);
  }

  // ---------- 3. Mitchell + Sarah ----------
  for (const m of moverRows) {
    if (m.existing.length) { console.log(`${m.name}: already has a 24 Oct enrollment (${m.existing.map(e => e.id)}) — skipping create`); continue; }
    const cur = m.cur;
    const enrollmentData = {
      studentId: m.studentId,
      shopifyOrderId: cur.shopify_order_id,
      shopifyLineItemId: `${cur.shopify_line_item_id}-C3`,
      // The course they are actually taking, not the package they bought —
      // a "6 Weeks" title also switches on the 6-week glazing reschedule rules.
      courseTitle: peer.course_title,
      courseVariantTitle: peer.course_variant_title,
      courseType: 'Wheelthrowing Intermediate',
      schedulePattern: peer.schedule_pattern,
      numberOfWeeks: 7,
      totalWeeks: 7,
      courseStartDate: '2026-10-24',
      courseEndDate: CLASS7_DATE,
      classTime: peer.class_time,
      instructor: 'Dillon Lin',
      room: 'Studio B',
      status: 'active',
      packageTotalCourses: cur.package_total_courses,
      packageTotalClasses: cur.package_total_classes,
      packageCoursesRemaining: 0,
    };
    console.log(`${m.name}: create C3 enrollment ${enrollmentData.shopifyLineItemId} in ${NEW_BASE} (7 classes), package remaining 1 -> 0`);
    if (!APPLY) continue;
    const created = await supabaseDb.createCourseEnrollment(enrollmentData);
    await addStudentToExistingCohort(created, peer);
    m.createdEnrollmentId = created.id;
    // Course 2 keeps package_courses_remaining=1 — it means "left after this
    // one". The continuation sweep reads the newest row (this C3, remaining 0),
    // so no further offer goes out.
  }

  // Their pending offers for Sat PM 10 Oct hold a seat there, and confirming
  // one would resolve from course 2 (1 remaining) and place them in a SECOND
  // course 3. Close them the way closeFulfilledOffers does — course 3 is taken.
  for (const m of moverRows) {
    const { data: offers } = await supabase.from('continuation_offers').select('id, cohort_start_date, class_time')
      .eq('student_id', m.studentId).eq('status', 'pending');
    for (const o of offers || []) {
      const c3 = m.createdEnrollmentId || m.existing[0]?.id;
      console.log(`${m.name}: close pending offer ${o.id} (${o.cohort_start_date} ${o.class_time}) as fulfilled by ${c3 || '<new C3>'}`);
      if (!APPLY) continue;
      if (!c3) die(`${m.name}: no C3 enrollment to point offer ${o.id} at`);
      const { error } = await supabase.from('continuation_offers').update({
        status: 'fulfilled', responded_at: new Date().toISOString(), created_enrollment_id: c3,
      }).eq('id', o.id).eq('status', 'pending');
      if (error) die(`close offer ${o.id}: ${error.message}`);
    }
  }

  if (APPLY) {
    const { data: all } = await supabase.from('course_enrollments').select('id')
      .eq('course_type', 'Wheelthrowing Intermediate').eq('course_start_date', '2026-10-24').eq('status', 'active');
    await supabase.from('course_enrollments').update({ pending_student_count: (all || []).length }).in('id', (all || []).map(e => e.id));
  }

  // ---------- verify ----------
  const { data: finalClasses } = await supabase.from('class_instances')
    .select('id, class_type, class_date, status, max_capacity, current_enrollment').like('class_type', `${NEW_BASE}.%`).order('class_date');
  console.log('\nCohort now:');
  for (const c of finalClasses || []) {
    const { data: b } = await supabase.from('bookings').select('student_id, course_enrollment_id').eq('class_instance_id', c.id).eq('status', 'booked');
    console.log(`  ${c.class_type}  ${String(c.class_date).slice(0, 10)}  ${c.status}  cap ${c.max_capacity}  booked ${(b || []).length}: ${(b || []).map(x => `${x.student_id}/${x.course_enrollment_id}`).join(' ')}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
