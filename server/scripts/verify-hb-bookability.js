/**
 * verify-hb-bookability.js
 *
 * Answers one question for every student who holds spendable handbuilding
 * credit: if they opened the schedule right now and pressed Book on an HB
 * class, would it work?
 *
 * Why this exists. On 2026-08-31 the hand-made HB calendar ran out and the
 * class list came back empty while 48 open enrolments held unspent credits.
 * Nothing logged, nothing alerted — the first anyone knew was a student saying
 * she could not book. hbScheduleGenerator now keeps the calendar filled, but a
 * filled calendar is only half the promise: the student also has to get past
 * the credit, enrolment-status, cross-type, glazing and seat gates that stand
 * between the button and a booking row.
 *
 * This script walks BOTH routes the UI can take, exactly as the UI chooses
 * between them, and reports every student for whom the answer is no.
 *
 *   Route A — /api/classes/book-hb-schedule
 *     Taken when the dashboard hands the page an HB enrolment with credits.
 *     The dashboard only ever loads status='active' enrolments, so a closed or
 *     completed HB block never reaches this route.
 *
 *   Route B — /api/classes/book-makeup
 *     The fallback when there is no such HB card: a 10-class package student
 *     spending flex credits on handbuilding takes this one.
 *
 * READ-ONLY. It never writes a booking; it reproduces each endpoint's guards in
 * order and stops at the first one that would reject.
 *
 * Usage:
 *   cd server && node scripts/verify-hb-bookability.js [--verbose]
 *
 * Exit code 1 if any student is blocked, so it can gate a deploy.
 */

require('dotenv').config();

const supabaseDb = require('../utils/supabaseDb');
const { supabase } = supabaseDb;
const { isGlazingClass } = require('../utils/glazing');
const { todaySGT } = require('../utils/sgtDate');

const VERBOSE = process.argv.includes('--verbose');

/** Every upcoming handbuilding class a student could try to book. */
async function upcomingHbClasses() {
  const { data, error } = await supabase
    .from('class_instances')
    .select('*')
    .like('class_type', 'HB%')
    .eq('status', 'active')
    .gte('class_date', todaySGT())
    .order('class_date', { ascending: true });
  if (error) throw new Error(`could not read HB classes: ${error.message}`);
  return data || [];
}

/**
 * The HB enrolment the student's schedule page would be holding.
 *
 * Mirrors GET /api/students/me/dashboard: active rows only, ordered by start
 * date, first handbuilding row wins — then the credits the card displays.
 */
async function dashboardHbCard(studentId) {
  const { data: active } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', studentId)
    .eq('status', 'active')
    .order('course_start_date', { ascending: true });

  const hb = (active || []).find(e =>
    (e.course_type || '').toLowerCase().includes('handbuilding'));
  if (!hb) return null;

  const credits = await supabaseDb.getEnrollmentCredits(hb.id);
  return { enrollment: hb, creditsRemaining: credits.remaining };
}

/** Route A: the guards in POST /api/classes/book-hb-schedule, in order. */
async function simulateHbSchedule(studentId, card, firstClass, weeks = 1) {
  const enr = card.enrollment;

  if (enr.status !== 'active') return 'Enrollment is not active';

  // NB: the endpoint gates on the stored cache column, not the ledger.
  const stored = enr.class_credits_remaining || 0;
  if (stored < weeks) {
    return `Not enough credits. You have ${stored} credits but need ${weeks}. `
         + `(ledger says ${card.creditsRemaining} — stored cache disagrees)`;
  }

  const { data: raw, error } = await supabase
    .from('class_instances')
    .select('*')
    .eq('status', 'active')
    .eq('start_time', firstClass.start_time)
    .eq('instructor', firstClass.instructor)
    .like('class_type', 'HB_%')
    .gte('class_date', firstClass.class_date)
    .order('class_date', { ascending: true })
    .limit(weeks * 2);
  if (error) return `Failed to find available classes (${error.message})`;

  const dow = new Date(firstClass.class_date).getDay();
  const matched = (raw || [])
    .filter(c => new Date(c.class_date).getDay() === dow)
    .slice(0, weeks);
  if (matched.length < weeks) {
    return `Only ${matched.length} consecutive classes available. Need ${weeks}.`;
  }

  for (const cls of matched) {
    if (await supabaseDb.findBooking(studentId, cls.id, 'booked')) {
      return 'You are already booked in one of these classes';
    }
    if ((cls.current_enrollment || 0) >= 10) return 'Week is full';
  }
  return null;
}

/** Route B: the guards in POST /api/classes/book-makeup, in order. */
async function simulateMakeup(studentId, classInstance) {
  const bookable = await supabaseDb.getBookableCredits(studentId);
  if (bookable.remaining <= 0) {
    return bookable.reason === 'no-enrollment'
      ? 'No remaining credits available (no active course on account)'
      : 'No remaining credits available (all classes used)';
  }

  const seat = await supabaseDb.checkSeatAvailability(classInstance, studentId);
  if (!seat.allowed) return 'Class is full. No makeup spots available.';

  if (await supabaseDb.findBooking(studentId, classInstance.id, 'booked')) {
    return 'You are already booked for this class';
  }

  const { data: active } = await supabase
    .from('course_enrollments')
    .select('id, course_type, course_identifier, number_of_weeks')
    .eq('student_id', studentId)
    .eq('status', 'active');

  const has10 = (active || []).some(e =>
    e.number_of_weeks >= 10 || (e.course_type || '').includes('10 Classes'));

  if (!has10 && active && active.length > 0) {
    const hasHB = active.some(e =>
      (e.course_type || '').toLowerCase().includes('handbuilding') ||
      (e.course_identifier || '').startsWith('HB'));
    const hasWT = active.some(e =>
      (e.course_type || '').toLowerCase().includes('wheelthrowing') ||
      (e.course_identifier || '').startsWith('WT'));
    if (hasWT && !hasHB) {
      return 'Your enrollment is for Wheelthrowing classes only. You cannot book Handbuilding classes.';
    }
  }

  if (!has10) {
    const { data: booked } = await supabase
      .from('bookings')
      .select('class_instances!bookings_class_instance_id_fkey(class_date, class_type, is_glazing)')
      .eq('student_id', studentId)
      .in('status', ['booked', 'attended'])
      .order('class_instances(class_date)', { ascending: true });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const glazing = (booked || []).find(b => {
      const d = new Date(b.class_instances?.class_date);
      if (d < today) return false;
      return isGlazingClass(b.class_instances);
    });

    if (glazing) {
      const gDate = new Date(glazing.class_instances.class_date);
      gDate.setHours(0, 0, 0, 0);
      const cDate = new Date(classInstance.class_date);
      cDate.setHours(0, 0, 0, 0);
      if (cDate > gDate) return 'Blocked: after the glazing class';
      const gap = (gDate - cDate) / 86400000;
      if (gap > 0 && gap < 5) return 'Blocked: within 5 days before glazing';
    }
  }
  return null;
}

/** Everyone who holds handbuilding credit they are entitled to spend. */
async function studentsWithHbCredit() {
  const ids = new Set();

  const { data: hbEnrolls } = await supabase
    .from('course_enrollments')
    .select('id, student_id')
    .ilike('course_type', '%handbuilding%')
    .eq('status', 'active');
  for (const e of hbEnrolls || []) {
    const c = await supabaseDb.getEnrollmentCredits(e.id);
    if (c.remaining > 0) ids.add(e.student_id);
  }

  // 10-class package students may spend flex credits on handbuilding.
  const { data: pkg } = await supabase
    .from('course_enrollments')
    .select('student_id')
    .in('status', ['active', 'completed'])
    .gte('number_of_weeks', 10);
  for (const e of pkg || []) {
    const b = await supabaseDb.getBookableCredits(e.student_id);
    if (b.remaining > 0) ids.add(e.student_id);
  }

  return [...ids];
}

async function main() {
  console.log('\n=== Can every student with HB credit actually book? ===\n');

  const classes = await upcomingHbClasses();
  if (classes.length === 0) {
    console.error('BLOCKED: there are no upcoming handbuilding classes at all.');
    console.error('The calendar has run dry — run scripts/backfill-hb-schedule.js.');
    process.exit(1);
  }
  const last = classes[classes.length - 1].class_date.slice(0, 10);
  console.log(`Calendar: ${classes.length} upcoming HB classes, filled to ${last}`);

  const studentIds = await studentsWithHbCredit();
  console.log(`Students holding spendable HB credit: ${studentIds.length}\n`);

  const blocked = [];
  let okCount = 0;

  for (const sid of studentIds) {
    const { data: cust } = await supabase
      .from('customers').select('first_name, last_name, email').eq('id', sid).maybeSingle();
    const name = cust ? `${cust.first_name} ${cust.last_name}` : `student ${sid}`;

    const card = await dashboardHbCard(sid);
    // Exactly how confirmBook() picks its route.
    const route = card && card.creditsRemaining > 0 ? 'A' : 'B';

    const failures = [];
    for (const cls of classes) {
      const reason = route === 'A'
        ? await simulateHbSchedule(sid, card, cls)
        : await simulateMakeup(sid, cls);
      if (reason) failures.push({ cls, reason });
    }

    const bookable = classes.length - failures.length;
    if (bookable === 0) {
      blocked.push({ sid, name, email: cust?.email, route, card, reason: failures[0]?.reason });
      console.log(`  ✗ ${name} <${cust?.email}> — route ${route} — 0 of ${classes.length} bookable`);
      console.log(`      first refusal: ${failures[0]?.reason}`);
    } else {
      okCount++;
      if (VERBOSE) {
        console.log(`  ✓ ${name} — route ${route} — ${bookable}/${classes.length} bookable`);
      }
      // Partial blocks are normal (glazing gaps, already-booked), but worth seeing.
      if (!VERBOSE && failures.length > 0) {
        const reasons = [...new Set(failures.map(f => f.reason))];
        console.log(`  ~ ${name} — ${bookable}/${classes.length} bookable — ${reasons[0]}`);
      }
    }
  }

  console.log(`\n--- Result ---`);
  console.log(`Can book:      ${okCount}`);
  console.log(`Fully blocked: ${blocked.length}`);

  if (blocked.length > 0) {
    console.log('\nBLOCKED STUDENTS:');
    for (const b of blocked) {
      console.log(`  ${b.name} <${b.email}>  route ${b.route}`);
      if (b.card) {
        console.log(`     HB card: enr ${b.card.enrollment.id} status=${b.card.enrollment.status} ` +
                    `ledger=${b.card.creditsRemaining} stored=${b.card.enrollment.class_credits_remaining}`);
      }
      console.log(`     ${b.reason}`);
    }
    process.exit(1);
  }

  console.log('\nEvery student holding HB credit can book at least one upcoming class.');
}

main().catch(e => { console.error('\nFAILED:', e.message || e); process.exit(1); });
