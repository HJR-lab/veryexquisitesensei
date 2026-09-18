/**
 * grant-membership-credit.js
 *
 * Grant the $20 "Ves is 10" VES Credit for Clay Club membership purchases.
 *
 * WHY THIS EXISTS
 *   Every new order earns $20 in Ves Credits, but until the order sync learned
 *   to credit memberships (routes/shopify.js, Clay Club branch) only course
 *   orders paid out. Anyone who bought a membership before that went live —
 *   Celine's 6-month Clay Club, for one — is owed the credit. This backfills it.
 *
 * Delegates the decision to awardMembershipPurchaseCredit, the same helper the
 * order sync calls, so it can never drift from production policy and can never
 * pay a membership twice: the grant is keyed on the membership row.
 *
 * Sends no email while the 'credits' category is paused (PAUSED_EMAIL_CATEGORIES).
 *
 * Usage (from server/):
 *   node scripts/grant-membership-credit.js --dry-run --name celine
 *   node scripts/grant-membership-credit.js --name celine
 *   node scripts/grant-membership-credit.js --email celine@example.com
 *   node scripts/grant-membership-credit.js --all --dry-run     # every membership
 *   node scripts/grant-membership-credit.js --all --since 2026-09-01
 */
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');
const { awardMembershipPurchaseCredit, getCreditBalance, MEMBERSHIP_PURCHASE_CREDIT } = require('../utils/creditManager');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const ALL = args.includes('--all');
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const NAME = flag('--name');
const EMAIL = flag('--email');
const SINCE = flag('--since');

if (!ALL && !NAME && !EMAIL) {
  console.error('Pick who to credit: --name <first/last name>, --email <email>, or --all. Add --dry-run to preview.');
  process.exit(1);
}

(async () => {
  console.log(`${DRY ? '[DRY RUN] ' : ''}Membership credit backfill — $${MEMBERSHIP_PURCHASE_CREDIT} per membership\n`);

  // Resolve the customers in scope first, so a name like "celine" can match
  // either first or last name without leaning on a join filter.
  let customerIds = null;
  if (!ALL) {
    let q = supabase.from('customers').select('id, first_name, last_name, email');
    if (EMAIL) q = q.ilike('email', EMAIL.trim());
    if (NAME) q = q.or(`first_name.ilike.%${NAME.trim()}%,last_name.ilike.%${NAME.trim()}%`);
    const { data: customers, error } = await q;
    if (error) throw error;
    if (!customers || customers.length === 0) {
      console.log('No customer matched. Nothing to do.');
      return;
    }
    console.log(`Matched ${customers.length} customer(s):`);
    for (const c of customers) console.log(`  #${c.id} ${c.first_name} ${c.last_name} <${c.email}>`);
    console.log('');
    customerIds = customers.map(c => c.id);
  }

  let q = supabase
    .from('memberships')
    .select('id, customer_id, membership_type, status, purchase_date, start_date, created_at, customers!memberships_customer_id_fkey(first_name, last_name, email)')
    .order('created_at');
  if (customerIds) q = q.in('customer_id', customerIds);
  if (SINCE) q = q.gte('created_at', new Date(SINCE).toISOString());
  const { data: memberships, error } = await q;
  if (error) throw error;

  console.log(`${memberships.length} membership(s) found.\n`);
  let granted = 0, skipped = 0;

  for (const m of memberships) {
    const c = m.customers || {};
    const who = `${c.first_name || ''} ${c.last_name || ''}`.trim() || `customer #${m.customer_id}`;
    const when = m.purchase_date || m.start_date || (m.created_at || '').slice(0, 10);

    // Cancelled memberships are not orders we owe a credit on.
    if (m.status === 'cancelled') {
      console.log(`  skip   #${m.id} ${who} — ${m.membership_type} (${when}) — cancelled`);
      skipped++;
      continue;
    }

    const res = await awardMembershipPurchaseCredit({
      customerId: m.customer_id,
      membershipId: m.id,
      membershipType: m.membership_type,
      dryRun: DRY,
    });

    if (res.granted) {
      granted++;
      console.log(`  ${DRY ? 'WOULD ' : ''}GRANT  #${m.id} ${who} — ${m.membership_type} (${when})`);
    } else {
      skipped++;
      console.log(`  skip   #${m.id} ${who} — ${m.membership_type} (${when}) — ${res.reason}`);
    }
  }

  console.log(`\n${DRY ? 'Would grant' : 'Granted'} ${granted}, skipped ${skipped}.`);

  if (!DRY && granted > 0) {
    const seen = new Set();
    for (const m of memberships) {
      if (seen.has(m.customer_id)) continue;
      seen.add(m.customer_id);
      const bal = await getCreditBalance(m.customer_id);
      const c = m.customers || {};
      console.log(`  balance  ${`${c.first_name || ''} ${c.last_name || ''}`.trim()}: $${bal}`);
    }
  }
})().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
