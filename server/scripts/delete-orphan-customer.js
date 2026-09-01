/**
 * delete-orphan-customer.js
 *
 * Delete a local customer row that has been orphaned by a SHOPIFY-SIDE merge.
 *
 * WHY THIS EXISTS
 *   When two Shopify customers are merged, the losing Shopify customer is deleted
 *   there — but nothing deletes our local row. Sync only ever creates/updates, so
 *   the local row lingers forever as a phantom duplicate student with 0 courses.
 *
 *   Charmaine Ng hit this twice: merge-charandboi.js deleted local row 2803 but
 *   left the duplicate Shopify customer standing, so sync rebuilt it as 2810.
 *   Fixing it properly means merging in Shopify FIRST, then running this.
 *
 * SAFETY
 *   - Refuses to delete if the Shopify customer still exists (that is not an
 *     orphan — it is a live record, and sync would recreate the row anyway).
 *   - Refuses to delete if ANY dependent row references the customer. Move the
 *     data first (see merge-charandboi.js) — this script never reassigns.
 *
 * Usage:
 *   cd server && node scripts/delete-orphan-customer.js 2810 --dry-run
 *   cd server && node scripts/delete-orphan-customer.js 2810
 */
require('dotenv').config();
const https = require('https');
const { supabase } = require('../utils/supabaseDb');

const DRY = process.argv.includes('--dry-run');
const ID = parseInt(process.argv.find(a => /^\d+$/.test(a)), 10);
if (!ID) { console.error('Usage: node scripts/delete-orphan-customer.js <customerId> [--dry-run]'); process.exit(1); }

const DEPENDENTS = [
  ['course_enrollments', 'student_id'], ['bookings', 'student_id'], ['pottery_pieces', 'customer_id'],
  ['credit_transactions', 'customer_id'], ['memberships', 'customer_id'], ['notifications', 'customer_id'],
  ['waitlist', 'student_id'], ['capacity_overrides', 'student_id'], ['instructor_notes', 'student_id'],
  ['verification_codes', 'customer_id'], ['continuation_offers', 'student_id'],
];

function shopifyCustomerExists(gid) {
  const payload = JSON.stringify({
    query: `query($id:ID!){ customer(id:$id){ id email } }`,
    variables: { id: `gid://shopify/Customer/${gid}` },
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: process.env.SHOPIFY_SHOP_DOMAIN,
      path: `/admin/api/2024-04/graphql.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Accept-Encoding': 'identity', 'Connection': 'close',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve(!!JSON.parse(b).data?.customer); } catch (e) { reject(new Error(b.slice(0, 400))); } }); });
    req.on('error', reject); req.write(payload); req.end();
  });
}

(async () => {
  const { data: c } = await supabase.from('customers').select('*').eq('id', ID).maybeSingle();
  if (!c) { console.log(`Customer ${ID} does not exist — nothing to do.`); process.exit(0); }
  console.log(`${DRY ? '[DRY RUN] ' : ''}Target: id=${c.id} "${c.first_name} ${c.last_name}" <${c.email}> shopify=${c.shopify_customer_id}\n`);

  if (c.shopify_customer_id) {
    const alive = await shopifyCustomerExists(c.shopify_customer_id);
    console.log(`Shopify customer ${c.shopify_customer_id}: ${alive ? 'STILL EXISTS' : 'gone (orphan confirmed)'}`);
    if (alive) { console.error('\nABORT: Shopify customer is live. Merge it in Shopify first, or sync will just recreate this row.'); process.exit(1); }
  }

  console.log('\nDependent rows:');
  let total = 0;
  for (const [t, col] of DEPENDENTS) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true }).eq(col, ID);
    if (error) { console.log(`  ${t}.${col}: n/a (${error.message.slice(0, 50)})`); continue; }
    total += count || 0;
    console.log(`  ${t}.${col}: ${count}`);
  }
  console.log(`  TOTAL: ${total}`);
  if (total > 0) { console.error('\nABORT: customer still owns data. Reassign it first (see merge-charandboi.js).'); process.exit(1); }

  if (DRY) { console.log('\n[DRY RUN] Would delete. No rows written.'); process.exit(0); }

  const { error } = await supabase.from('customers').delete().eq('id', ID);
  if (error) throw error;

  const { data: gone } = await supabase.from('customers').select('id').eq('id', ID).maybeSingle();
  console.log(gone ? `\nFAILED: customer ${ID} still present.` : `\nDeleted customer ${ID}. Verified gone.`);
  process.exit(gone ? 1 : 0);
})().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
