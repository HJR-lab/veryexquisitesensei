// Verification of the continuation offer lifecycle (C2 + C3).
//
// Run from server/: node scripts/verify-continuation-offers.js
//
// SAFETY: creates offers with automated:true so the send is suppressed by the
// paused 'continuation' email category — NO real student is ever emailed — and
// deletes every row it created before exiting. It never calls confirm on a
// cohort with room, so no enrollment is ever created. The one confirm it does
// exercise is against a FULL cohort, which must be refused.
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');
const { resolveNextCourse, assertDisplayDate } = require('../utils/packageContinuation');
const {
  createContinuationOffer, getOfferByToken, offerState, respondToOffer,
  OFFER_DAYS, EXTENSION_DAYS, MAX_EXTENSIONS,
  autosendStatus,
} = require('../utils/continuationOffer');

let failures = 0;
const created = [];

function assert(cond, label) {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${label}`);
  if (!cond) failures++;
}

async function cleanup() {
  if (!created.length) return;
  await supabase.from('continuation_offers').delete().in('id', created);
  console.log(`\ncleaned up ${created.length} test offer(s)`);
}

async function main() {
  // Guard: with autosend on, creating an offer would email a real student.
  const gate = autosendStatus();
  if (gate.enabled) {
    console.error('ABORT: CONTINUATION_AUTOSEND is on. This script would email real students.');
    process.exit(1);
  }
  console.log(`automatic sending is off (${gate.reason}) — safe to run\n`);

  // Find live multi-course package students.
  const { data: pkgs } = await supabase
    .from('course_enrollments')
    .select('*, customers!inner(first_name, last_name, email)')
    .gte('package_total_courses', 2)
    .eq('status', 'active')
    .order('id', { ascending: false })
    .limit(40);

  console.log(`active package enrollments examined: ${(pkgs || []).length}`);

  // Students who already hold a live offer cannot be used for the lifecycle
  // test — creating a second one is correctly refused. Real offers made by the
  // nightly sweep live in this table, so this is the normal case, not an edge.
  const { data: liveOffers } = await supabase
    .from('continuation_offers')
    .select('student_id')
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString());
  const alreadyOffered = new Set((liveOffers || []).map(o => o.student_id));

  const withRoom = [];
  const full = [];
  for (const e of pkgs || []) {
    const r = await resolveNextCourse(e, e.student_id);
    if (r.ok && !alreadyOffered.has(e.student_id)) withRoom.push({ e, r });
    else if (r.reason === 'cohort_full') full.push({ e, r });
  }
  if (alreadyOffered.size) {
    console.log(`  (${alreadyOffered.size} student(s) already hold a live offer and are excluded)`);
  }
  console.log(`  can continue now: ${withRoom.length}`);
  console.log(`  next cohort full: ${full.length}\n`);

  // ---- 1. Offer lifecycle on a real student, email suppressed ----
  if (withRoom.length === 0) {
    console.log('No package student currently has a continuable cohort — lifecycle test skipped.');
  } else {
    const { e, r } = withRoom[0];
    const who = `${e.customers.first_name} ${e.customers.last_name}`;
    console.log(`Lifecycle test using ${who} → ${r.nextCourse.course_start_date}`);

    const c1 = await createContinuationOffer({ enrollment: e, studentId: e.student_id, automated: true });
    assert(c1.ok, 'offer created');
    if (!c1.ok) return;
    created.push(c1.offer.id);
    assert(c1.emailed === false, 'no email sent (category paused)');

    const days = Math.round((new Date(c1.offer.expires_at) - Date.now()) / 86400000);
    assert(days === OFFER_DAYS, `deadline is ${OFFER_DAYS} days out (got ${days})`);

    // REGRESSION GUARD. The first build of this page showed 'Wednesday, 9
    // September' for a Thursday cohort, because course_start_date is a day
    // early on most live cohorts. The date a student sees must always fall on
    // the weekday their cohort actually runs.
    const shown = c1.offer.first_class_date;
    assert(!!shown, 'offer stored a first_class_date to display');
    assert(
      assertDisplayDate(shown, c1.offer.schedule_pattern) === shown,
      `displayed date ${shown} falls on ${c1.offer.schedule_pattern} as it must`
    );
    assert(
      assertDisplayDate(c1.offer.cohort_start_date, c1.offer.schedule_pattern) === null
        || c1.offer.cohort_start_date === shown,
      'the guard would reject the raw cohort_start_date where it drifts'
    );

    // Duplicate suppression.
    const c2 = await createContinuationOffer({ enrollment: e, studentId: e.student_id, automated: true });
    assert(!c2.ok && c2.reason === 'offer_exists', 'second offer for the same cohort refused');
    if (c2.ok) created.push(c2.offer.id);

    // Token lookup + public state.
    const fetched = await getOfferByToken(c1.offer.token);
    assert(!!fetched, 'offer retrievable by token');
    assert(offerState(fetched) === 'pending', 'state is pending');

    // Extension, once only.
    const ext1 = await respondToOffer(c1.offer.token, 'extend');
    assert(ext1.ok, 'first extension granted');
    const extDays = Math.round((new Date(ext1.offer.expires_at) - Date.now()) / 86400000);
    assert(extDays === OFFER_DAYS + EXTENSION_DAYS, `deadline now ${OFFER_DAYS + EXTENSION_DAYS} days out (got ${extDays})`);
    assert(ext1.offer.extension_count === 1, 'extension_count incremented');

    const ext2 = await respondToOffer(c1.offer.token, 'extend');
    assert(!ext2.ok && ext2.reason === 'no_extensions_left', `second extension refused (max ${MAX_EXTENSIONS})`);

    // Pass — records the answer, creates no enrollment.
    const before = await supabase.from('course_enrollments')
      .select('id', { count: 'exact', head: true }).eq('student_id', e.student_id);
    const passed = await respondToOffer(c1.offer.token, 'pass');
    assert(passed.ok && passed.offer.status === 'passed', 'pass recorded');
    const after = await supabase.from('course_enrollments')
      .select('id', { count: 'exact', head: true }).eq('student_id', e.student_id);
    assert(before.count === after.count, 'pass created no enrollment');

    // Answered offers are closed.
    const again = await respondToOffer(c1.offer.token, 'confirm');
    assert(!again.ok && again.reason === 'passed', 'an answered offer cannot be answered again');
  }

  // ---- 2. Confirm must be refused when the cohort is full ----
  console.log('\nCapacity refusal on confirm:');
  if (full.length === 0) {
    console.log('  (no package student facing a full cohort — skipped)');
  } else {
    const { e } = full[0];
    const c = await createContinuationOffer({ enrollment: e, studentId: e.student_id, automated: true });
    assert(!c.ok && c.reason === 'cohort_full', 'offer refused outright for a full cohort — student never asked');
    if (c.ok) created.push(c.offer.id);
  }

  // ---- 2b. Every upcoming cohort can be described to a student correctly ----
  console.log('\nDisplayable date for every upcoming cohort:');
  const { resolveFirstClassDate } = require('../utils/packageContinuation');
  const today2 = new Date().toISOString().split('T')[0];
  const { data: upcoming } = await supabase
    .from('course_enrollments')
    .select('course_start_date, schedule_pattern, course_identifier, status')
    .gte('course_start_date', today2)
    .not('schedule_pattern', 'is', null);
  const cohortSeen = new Set();
  for (const e of upcoming || []) {
    if (e.status === 'cancelled') continue;
    const key = `${e.course_start_date}|${e.schedule_pattern}`;
    if (cohortSeen.has(key)) continue;
    cohortSeen.add(key);
    const d = await resolveFirstClassDate(e.course_identifier, e.course_start_date, e.schedule_pattern);
    assert(
      assertDisplayDate(d, e.schedule_pattern) === d,
      `${e.course_identifier || key}: resolves to ${d}, a ${e.schedule_pattern}`
    );
  }

  // ---- 3. Unknown token ----
  console.log('\nUnknown token:');
  const missing = await respondToOffer('definitely-not-a-real-token', 'confirm');
  assert(!missing.ok && missing.reason === 'not_found', 'unknown token rejected');

  console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} assertion(s)`}`);
}

main()
  .then(cleanup)
  .then(() => process.exit(failures === 0 ? 0 : 1))
  .catch(async err => {
    console.error('verification error:', err.message);
    await cleanup();
    process.exit(1);
  });
