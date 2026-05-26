// Read-only — inspect customer rows for anomalies (duplicates, locks, sync state)
// Usage: node scripts/inspect-customer.js "<email-or-name-fragment>"
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');

(async () => {
  const q = (process.argv[2] || '').trim();
  if (!q) { console.error('Usage: node scripts/inspect-customer.js "<email-or-name>"'); process.exit(1); }

  const cols = '*';

  const looksLikeEmail = q.includes('@');
  let { data, error } = looksLikeEmail
    ? await supabase.from('customers').select(cols).ilike('email', `%${q}%`)
    : await supabase.from('customers').select(cols).or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
  if (error) throw error;

  console.log(`Found ${data.length} customer row(s) matching "${q}":`);
  for (const c of data) {
    console.log('\n──────────────────────────────────────────');
    console.log(`id=${c.id}   email=${c.email}`);
    console.log(`name="${c.first_name} ${c.last_name}"   name_locked=${c.name_locked}   email_locked=${c.email_locked}`);
    console.log(`mobile=${c.mobile}   dob=${c.date_of_birth}   profile_picture=${c.profile_picture ? '[set]' : 'null'}`);
    console.log(`status=${c.status}   shopify_id=${c.shopify_customer_id}`);
    console.log(`created=${c.created_at}`);
    console.log(`updated=${c.updated_at}`);
    console.log(`synced =${c.last_synced_at}`);
  }

  // Duplicate-email check
  const byEmail = {};
  for (const c of data) {
    const k = (c.email || '').toLowerCase();
    (byEmail[k] = byEmail[k] || []).push(c.id);
  }
  const dupes = Object.entries(byEmail).filter(([_, ids]) => ids.length > 1);
  if (dupes.length) {
    console.log('\n⚠️  Duplicate email rows:');
    for (const [email, ids] of dupes) console.log(`   ${email} → ids ${ids.join(', ')}`);
  } else {
    console.log('\nNo duplicate email rows in this result set.');
  }
})().catch(e => { console.error(e); process.exit(1); });
