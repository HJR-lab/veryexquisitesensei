#!/usr/bin/env node
/**
 * Read-only audit of Resend's suppression list.
 *
 * A hard bounce suppresses an address permanently: every later send to it
 * returns "suppressed" and never leaves Resend, while the app still records a
 * successful send in sent_emails. A suppressed address is therefore silent —
 * nothing in the app says mail stopped arriving.
 *
 * The question that matters is not "is this address suppressed" but "is this a
 * customer's real address, or a typo of one". Both shapes occur:
 *
 *   - A typo typed into the sign-in form. The magic link bounces and the typo
 *     gets suppressed. The customer's real address is untouched and they never
 *     lose anything — they just have to type it correctly.
 *   - A typo baked into a Shopify order, which becomes the customer's stored
 *     address. Then real mail goes to the dead address (Sian Bostrom, 31/08/26:
 *     sina… for sian…, so her Clay Club confirmation bounced). This is the one
 *     that needs fixing, in Shopify and in customers.
 *
 * "emails logged as sent since" separates them: non-zero means the app believes
 * it has been mailing a dead address.
 *
 * Usage: node scripts/audit-suppressed-addresses.js
 */
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');

// Levenshtein, for spotting the one-or-two character typos that produce these.
function dist(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return m[a.length][b.length];
}

// customers is past 1000 rows, which is where an unbounded select silently
// stops — it reported real customers as absent. Page through it.
async function allCustomers() {
  const rows = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from('customers').select('id, first_name, last_name, email')
      .range(from, from + size - 1);
    if (error) throw new Error(`customers page at ${from}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < size) return rows;
  }
}

(async () => {
  if (!process.env.RESEND_API_KEY) { console.error('RESEND_API_KEY not set'); process.exit(1); }

  const res = await fetch('https://api.resend.com/suppressions?limit=100', {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  if (!res.ok) { console.error('Resend suppressions:', res.status, await res.text()); process.exit(1); }
  const suppressed = (await res.json()).data || [];

  const customers = await allCustomers();
  console.log(`Suppressed addresses: ${suppressed.length}   (checked against ${customers.length} customers)`);

  const needsFixing = [];

  for (const s of suppressed) {
    const addr = String(s.email).toLowerCase();
    console.log(`\n${'─'.repeat(66)}\n${addr}`);
    console.log(`  suppressed ${s.created_at.slice(0, 10)} (${s.origin}) — message ${s.source_id}`);

    const owner = customers.find(c => (c.email || '').toLowerCase() === addr);

    if (owner) {
      const { data: lost, error } = await supabase.from('sent_emails')
        .select('email_type, subject, sent_at')
        .contains('recipient_emails', [owner.email]).gt('sent_at', s.created_at).order('sent_at');
      if (error) throw new Error(`sent_emails for ${addr}: ${error.message}`);

      console.log(`  *** A CUSTOMER'S STORED ADDRESS — customer ${owner.id}: ${owner.first_name} ${owner.last_name}`);
      console.log(`  emails logged as sent since suppression (none of them arrived): ${(lost || []).length}`);
      for (const l of lost || []) {
        console.log(`     ${l.sent_at.slice(0, 16)} | ${l.email_type} | ${String(l.subject).slice(0, 50)}`);
      }
      needsFixing.push(`${addr} (customer ${owner.id}, ${owner.first_name} ${owner.last_name})`);
    } else {
      console.log('  not any customer\'s stored address');
    }

    // Whether or not it is stored anywhere, name the address it was probably
    // meant to be — that is the actionable part.
    const near = customers
      .filter(c => c.email && c.email.toLowerCase() !== addr)
      .map(c => ({ c, d: dist(c.email.toLowerCase(), addr) }))
      .filter(x => x.d <= 2)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    if (near.length) {
      console.log('  looks like a typo of:');
      for (const { c, d } of near) {
        console.log(`     ${c.first_name} ${c.last_name} <${c.email}>  (${d} character${d === 1 ? '' : 's'} different)`);
      }
    }
  }

  console.log(`\n${'='.repeat(66)}`);
  if (needsFixing.length === 0) {
    console.log('No customer is losing mail: every suppressed address is a typo that');
    console.log('nobody has stored — failed sign-in attempts, not undelivered mail.');
  } else {
    console.log('Stored customer addresses that are suppressed — mail to these is being');
    console.log('discarded while the app records it as sent. Fix in Shopify and customers:');
    for (const n of needsFixing) console.log(`  - ${n}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
