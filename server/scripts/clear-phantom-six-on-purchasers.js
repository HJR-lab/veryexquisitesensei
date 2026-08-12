/**
 * Remove the phantom default-6 from customers who DID buy something.
 *
 * customers.classes_allocated used to default to 6, and allocation is additive:
 * a purchase adds its weeks on top of whatever was already there. So a customer
 * who bought one 6-week course ends up with 12 — six they paid for, six the
 * column handed them. Booking eligibility reads this counter BEFORE the
 * enrollment ledger, so the phantom six are genuinely bookable.
 *
 * clear-phantom-class-allocations.js (PR #70) only cleared customers who had
 * never booked, precisely because a purchaser might be owed something. This is
 * the follow-up for purchasers, using a much stronger test:
 *
 *     classes_allocated === sum(number_of_weeks across their enrollments) + 6
 *
 * When that holds exactly, the extra six is arithmetically the old default and
 * nothing else. Verified on 54 of 64 live students 12/08/26 — Sanjana Vijay
 * (6-week course + 6 = 12) was one of them, and it is what sent her booking
 * down the unlinked path in the first place.
 *
 * Run from server/:
 *   node scripts/clear-phantom-six-on-purchasers.js            # dry run, live students
 *   node scripts/clear-phantom-six-on-purchasers.js --apply
 *   node scripts/clear-phantom-six-on-purchasers.js --all      # include non-live too
 *
 * Anyone whose allocation does NOT match the formula exactly is left alone —
 * their excess may be under-recorded attendance rather than a phantom grant,
 * and that needs a person.
 */
require('dotenv').config();

const { supabase } = require('../utils/supabaseDb');

const APPLY = process.argv.includes('--apply');
const INCLUDE_ALL = process.argv.includes('--all');
const PHANTOM = 6;

async function fetchAll(table, columns) {
  let rows = [], page = 0, more = true;
  while (more) {
    const { data, error } = await supabase.from(table).select(columns)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    rows = rows.concat(data || []);
    more = (data || []).length === 1000;
    page++;
  }
  return rows;
}

(async () => {
  const customers = await fetchAll('customers', 'id, first_name, last_name, classes_allocated');
  const enrollments = await fetchAll('course_enrollments', 'student_id, status, number_of_weeks');

  const enrByStudent = {};
  enrollments.forEach(e => { (enrByStudent[e.student_id] = enrByStudent[e.student_id] || []).push(e); });

  const live = [], nonLive = [];

  for (const c of customers) {
    const alloc = c.classes_allocated || 0;
    if (alloc <= PHANTOM) continue;                    // nothing to take without going below a real purchase

    const mine = enrByStudent[c.id] || [];
    if (!mine.length) continue;                        // no purchase — handled by the earlier script

    const purchased = mine.reduce((s, e) => s + (e.number_of_weeks || 0), 0);
    if (alloc !== purchased + PHANTOM) continue;       // the formula must hold EXACTLY

    const isLive = mine.some(e => ['active', 'paused', 'upcoming'].includes(e.status));
    const row = { id: c.id, name: `${c.first_name || ''} ${c.last_name || ''}`.trim(), alloc, purchased };
    (isLive ? live : nonLive).push(row);
  }

  const targets = INCLUDE_ALL ? [...live, ...nonLive] : live;

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — scope: ${INCLUDE_ALL ? 'all customers' : 'live enrollments only'}\n`);
  console.log(`  matches the formula, live enrollment : ${live.length}`);
  console.log(`  matches the formula, not live        : ${nonLive.length}`);
  console.log(`\n  TO CLEAR: ${targets.length} customers, ${targets.length * PHANTOM} phantom classes\n`);

  targets.slice(0, 20).forEach(t => console.log(
    `   ${String(t.id).padStart(5)}  ${t.name.slice(0, 24).padEnd(25)} ${t.alloc} = ${t.purchased} purchased + ${PHANTOM}  ->  ${t.alloc - PHANTOM}`));
  if (targets.length > 20) console.log(`   ... and ${targets.length - 20} more`);

  if (!APPLY) {
    console.log('\nNothing written. Re-run with --apply.');
    process.exit(0);
  }

  let done = 0;
  for (const t of targets) {
    // Direct update, NOT updateCustomer() — that bumps updated_at, which the
    // Shopify sync treats as an admin edit and would shield the row from future
    // syncs. See project_sync_field_protection.
    const { error } = await supabase
      .from('customers').update({ classes_allocated: t.alloc - PHANTOM }).eq('id', t.id);
    if (error) { console.error(`  FAILED on ${t.id}:`, error.message); process.exit(1); }
    done++;
  }
  console.log(`\ncleared the phantom ${PHANTOM} from ${done} customers.`);
})();
