// Verification of the daily continuation sweep (C4 + the C5 lapse).
//
// Run from server/: node scripts/verify-continuation-sweep.js
//
// SAFETY: refuses to run unless the 'continuation' email category is paused, so
// the sweep cannot email a real student. It deliberately does NOT call
// runContinuationSweep(), because that also mails the admin digest to
// info@ves.sg — the parts are exercised individually instead. Every offer it
// creates is deleted before exit.
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');
const { isEmailCategoryPaused } = require('../utils/emailService');
const { assertDisplayDate } = require('../utils/packageContinuation');
const { lapseExpiredOffers, findDuePackageStudents, createDueOffers } = require('../utils/continuationSweep');

let failures = 0;
const created = [];

function assert(cond, label) {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${label}`);
  if (!cond) failures++;
}

async function cleanup() {
  if (!created.length) return;
  await supabase.from('continuation_offers').delete().in('id', created);
  const { count } = await supabase.from('continuation_offers').select('id', { count: 'exact', head: true });
  console.log(`\ncleaned up ${created.length} offer(s); table now holds ${count}`);
}

async function main() {
  if (!isEmailCategoryPaused('continuation')) {
    console.error('ABORT: "continuation" is not paused. The sweep would email real students.');
    process.exit(1);
  }
  console.log('continuation emails are paused — safe to run\n');

  const before = await supabase.from('continuation_offers').select('id', { count: 'exact', head: true });
  console.log(`offers already in the table: ${before.count}`);

  // ---- 1. Who the sweep considers ----
  const { due, paused } = await findDuePackageStudents();
  console.log(`\npackage students considered: ${due.length} (plus ${paused.length} paused, deliberately skipped)`);
  const perStudent = new Map();
  due.forEach(e => perStudent.set(e.student_id, (perStudent.get(e.student_id) || 0) + 1));
  assert(!due.some(e => e.status === 'paused'), 'no paused student is in the due list');
  assert([...perStudent.values()].every(n => n === 1), 'one enrollment per student (latest only, no duplicates)');

  // ---- 2. First run creates offers ----
  console.log('\nfirst sweep run:');
  const run1 = await createDueOffers();
  run1.created.forEach(c => created.push(c.offer.id));
  console.log(`  examined ${run1.examined}, created ${run1.created.length}`);
  console.log(`  skipped: ${JSON.stringify(run1.skipped)}`);

  assert(
    run1.created.every(c => c.emailed === false),
    'no student was emailed (category paused)'
  );
  assert(
    run1.created.every(c => assertDisplayDate(c.offer.first_class_date, c.offer.schedule_pattern) === c.offer.first_class_date),
    'every offered date falls on the cohort weekday'
  );
  run1.created.forEach(c => {
    console.log(`    → ${c.studentName}: ${c.offer.first_class_date} ${c.offer.class_time}`);
  });

  // ---- 3. Second run is a no-op ----
  console.log('\nsecond sweep run (must not duplicate):');
  const run2 = await createDueOffers();
  run2.created.forEach(c => created.push(c.offer.id));
  console.log(`  created ${run2.created.length}, skipped: ${JSON.stringify(run2.skipped)}`);
  assert(run2.created.length === 0, 'creates nothing on a re-run');
  assert(
    (run2.skipped.offer_exists || 0) >= run1.created.length,
    'the students offered in run 1 are skipped as offer_exists'
  );

  // ---- 4. Lapse releases the seat ----
  console.log('\nlapse:');
  if (created.length === 0) {
    console.log('  (no offers to lapse — skipped)');
  } else {
    const target = created[0];
    await supabase
      .from('continuation_offers')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', target);

    const lapsed = await lapseExpiredOffers();
    assert(lapsed.some(l => l.id === target), 'an expired offer is lapsed');

    const { data: after } = await supabase.from('continuation_offers').select('status').eq('id', target).single();
    assert(after?.status === 'lapsed', `status is now lapsed (got ${after?.status})`);

    const again = await lapseExpiredOffers();
    assert(!again.some(l => l.id === target), 'lapsing is idempotent — not lapsed twice');

    // The whole point: a lapsed offer must not block a fresh one, or the
    // student can never be re-offered.
    const run3 = await createDueOffers();
    run3.created.forEach(c => created.push(c.offer.id));
    assert(run3.created.length >= 1, 'a student whose offer lapsed can be offered again');
  }

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
