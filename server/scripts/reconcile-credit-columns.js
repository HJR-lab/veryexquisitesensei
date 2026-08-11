/**
 * One-off: make credit-block closure explicit, and reconcile the stored cache
 * to the bookings ledger.
 *
 * Run from server/:
 *   node scripts/reconcile-credit-columns.js          # dry run, writes nothing
 *   node scripts/reconcile-credit-columns.js --apply  # writes
 *
 * WHAT IT DOES, AND WHAT IT DELIBERATELY DOES NOT
 *
 * Closures — 19 enrollments were closed only by the accident of
 * class_credits_remaining === 0. Each gets credits_closed_at plus a reason
 * naming why, so the gates can stop inferring closure from a number. Their
 * stored values are left alone: they are already 0, which is consistent.
 *
 * Reconciliation — enrollments whose stored remaining disagrees with the
 * ledger are corrected to the ledger. Justin's call, 11/08/26: the ledger
 * wins, including where that reduces a live student's balance.
 *
 * class_credits_allocated is NEVER written. It behaves as an override: for a
 * standard WT enrollment getEnrollmentCredits reports allocated 0 because the
 * real total lives in number_of_weeks, so writing the computed value back
 * would clobber the fallback and shrink the course. See
 * project_credits_allocated_override.
 *
 * Rows already agreeing with the ledger are not touched at all. Rewriting 392
 * correct rows to prove a point would be 392 chances to introduce a defect.
 */
require('dotenv').config();

const { supabase, getEnrollmentCredits } = require('../utils/supabaseDb');

const APPLY = process.argv.includes('--apply');

// Closed blocks, grouped by why. Reasons are specific because a closure with
// no explanation is the exact failure this whole exercise is fixing.
const CLOSURES = [
  {
    reason: 'Legacy enrollment predating booking tracking — no bookings were ever recorded, so the ledger reports a full balance only because there is nothing to count. Closed on the 09/08/26 credit review; made explicit 11/08/26.',
    ids: [4569, 4570, 4574, 4575, 4583, 4655, 4707, 4708, 5083, 5084, 5224, 5225, 5226, 5227, 5228, 5229],
  },
  {
    reason: 'Block finished and settled — bookings were recorded and the remainder was written off by an admin at the time. Confirmed against the 09/08/26 credit review (enr 5231 is Ryan Ling package 1, closed with nothing owed).',
    ids: [5231, 4667],
  },
  {
    reason: 'Enrollment cancelled — no entitlement remains regardless of what the ledger computes from its historical bookings.',
    ids: [5384],
  },
];

(async () => {
  const closureById = new Map();
  for (const group of CLOSURES) {
    for (const id of group.ids) closureById.set(id, group.reason);
  }

  let all = [], page = 0, more = true;
  while (more) {
    const { data } = await supabase
      .from('course_enrollments')
      .select('id, student_id, status, class_credits_used, class_credits_remaining, credits_closed_at')
      .range(page * 1000, (page + 1) * 1000 - 1);
    all = all.concat(data || []);
    more = (data || []).length === 1000;
    page++;
  }

  const toClose = [], toReconcile = [], untouched = [];

  for (const e of all) {
    const credits = await getEnrollmentCredits(e.id);

    if (closureById.has(e.id)) {
      toClose.push({ id: e.id, reason: closureById.get(e.id), ledgerRemaining: credits.remaining });
      continue;
    }

    const stored = e.class_credits_remaining;
    if (stored === credits.remaining) { untouched.push(e.id); continue; }

    toReconcile.push({
      id: e.id,
      status: e.status,
      student_id: e.student_id,
      from: stored,
      to: credits.remaining,
      used: credits.committed,
    });
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${all.length} enrollments\n`);

  console.log(`CLOSE (${toClose.length}) — record an explicit closure, stored values unchanged:`);
  for (const c of toClose) {
    console.log(`   enr ${c.id}  ledger would offer ${c.ledgerRemaining}, block stays closed`);
  }

  console.log(`\nRECONCILE (${toReconcile.length}) — stored cache corrected to the ledger:`);
  for (const r of toReconcile) {
    const dir = r.to > r.from ? 'up  ' : 'down';
    console.log(`   enr ${r.id} [${r.status}] remaining ${r.from} -> ${r.to}  (${dir}), used -> ${r.used}`);
  }

  console.log(`\nUNTOUCHED (${untouched.length}) — already agree with the ledger.`);

  if (!APPLY) {
    console.log('\nNothing written. Re-run with --apply.');
    process.exit(0);
  }

  const now = new Date().toISOString();
  for (const c of toClose) {
    const { error } = await supabase
      .from('course_enrollments')
      .update({ credits_closed_at: now, credits_closed_reason: c.reason })
      .eq('id', c.id);
    if (error) { console.error(`  FAILED to close ${c.id}:`, error.message); process.exit(1); }
  }
  console.log(`\nclosed ${toClose.length} blocks.`);

  for (const r of toReconcile) {
    const { error } = await supabase
      .from('course_enrollments')
      .update({
        class_credits_remaining: r.to,
        class_credits_used: r.used,
        updated_at: now,
      })
      .eq('id', r.id);
    if (error) { console.error(`  FAILED to reconcile ${r.id}:`, error.message); process.exit(1); }
  }
  console.log(`reconciled ${toReconcile.length} enrollments.`);
})();
