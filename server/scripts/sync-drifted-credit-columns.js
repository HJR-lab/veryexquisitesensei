/**
 * Reconcile the stored credit cache to the bookings ledger, for every open
 * enrollment that has drifted.
 *
 * Run from server/:
 *   node scripts/sync-drifted-credit-columns.js          # dry run, writes nothing
 *   node scripts/sync-drifted-credit-columns.js --apply  # writes
 *
 * Writes only through syncStoredCredits(), the sanctioned writer, so
 * class_credits_allocated is never touched and closed blocks keep their
 * history. See project_credit_single_writer.
 *
 * This checks BOTH cached columns. verify-credit-columns.js only compares
 * `remaining`, so a row whose `used` is stale passes that check while the
 * identity allocated = used + remaining quietly fails on it.
 *
 * A row that changes `remaining` changes what a student can book. Those are
 * money writes: read the dry run before applying.
 */
require('dotenv').config();

const { supabase, fetchAllRows } = require('../utils/supabaseClient');
const { getEnrollmentCredits, syncStoredCredits } = require('../utils/bookingDb');

const APPLY = process.argv.includes('--apply');

(async () => {
  const rows = await fetchAllRows((from, to) => supabase
    .from('course_enrollments')
    .select('id, student_id, course_identifier, course_type, number_of_weeks, class_credits_allocated, class_credits_used, class_credits_remaining, credits_closed_at, status')
    .is('credits_closed_at', null)
    .range(from, to));

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — scanning ${rows.length} open enrollments\n`);

  const drifted = [];
  let untracked = 0;
  for (const e of rows) {
    const led = await getEnrollmentCredits(e.id);
    if (!led) continue;

    // A standard WT enrollment is not credit-tracked: getEnrollmentCredits
    // reports allocated 0 because the real total lives in number_of_weeks, so
    // `used` carries no meaning on those rows and `remaining` is 0 by
    // construction. 325 of them "drift" on used alone. Writing a number into a
    // column nothing reads would be 325 chances to introduce a defect, which is
    // the trade the 09/08/26 credit review already declined. Skip them.
    if (!led.allocated) { untracked++; continue; }

    const remOff  = (e.class_credits_remaining ?? null) !== led.remaining;
    const usedOff = (e.class_credits_used ?? null) !== led.committed;
    if (remOff || usedOff) drifted.push({ e, led, remOff, usedOff });
  }
  console.log(`skipped ${untracked} enrollment(s) the ledger does not credit-track\n`);

  if (!drifted.length) {
    console.log('Nothing drifted. Stored cache agrees with the ledger.');
    return;
  }

  // Balance changes first — those are the ones that need a human.
  drifted.sort((a, b) => Number(b.remOff) - Number(a.remOff));

  for (const { e, led, remOff, usedOff } of drifted) {
    const { data: c } = await supabase.from('customers')
      .select('first_name, last_name').eq('id', e.student_id).maybeSingle();
    const who = c ? `${c.first_name} ${c.last_name}` : `student ${e.student_id}`;
    const delta = led.remaining - (e.class_credits_remaining ?? 0);
    console.log(`enr ${e.id}  ${who}  ${e.course_identifier || e.course_type}`);
    if (remOff) {
      console.log(`   ⚠ BALANCE  remaining ${e.class_credits_remaining} -> ${led.remaining}  (${delta > 0 ? '+' : ''}${delta} bookable class${Math.abs(delta) === 1 ? '' : 'es'})`);
    }
    if (usedOff) {
      console.log(`     cache    used ${e.class_credits_used} -> ${led.committed}   (no change to what they can book)`);
    }
    if (APPLY) {
      await syncStoredCredits(e.id);
      console.log('     written');
    }
    console.log('');
  }

  const balanceChanges = drifted.filter(d => d.remOff).length;
  console.log(`${drifted.length} drifted — ${balanceChanges} change a bookable balance, ${drifted.length - balanceChanges} are cache-only.`);
  if (!APPLY) console.log('\nNothing written. Re-run with --apply.');
})();
