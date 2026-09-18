#!/usr/bin/env node
/**
 * Repair one customer whose stored address is on Resend's suppression list.
 *
 * This is the fix for the `undeliverable_customer_email` finding in the daily
 * anomaly digest. A hard bounce suppresses an address permanently: every later
 * send to it is discarded inside Resend and the app still writes a successful
 * row to sent_emails, so nothing in the app says the customer stopped
 * receiving mail. See scripts/audit-suppressed-addresses.js for the detection
 * side, and the digest finding for the shape of the problem.
 *
 * Removing the suppression is NOT the fix and this script never does it. The
 * mailbox is genuinely gone; re-sending to it just bounces again and spends
 * more sender reputation. The fix is a correct address, written to Shopify
 * (the source of truth, or customer sync will put the dead one straight back)
 * and to customers, followed by a re-send of what was lost.
 *
 * What counts as "lost" is taken from Resend rather than guessed: every
 * sent_emails row addressed to the dead address is looked up by its message
 * id, and only those whose last_event is `bounced` or `suppressed` are
 * re-sent. Anything Resend delivered before the address died is left alone.
 * The re-send reuses the original subject and HTML pulled back from Resend, so
 * the customer receives the message that was actually composed for them rather
 * than a regenerated approximation that may have drifted.
 *
 * The correct address cannot be derived — every system holds the same wrong
 * one. Get it from the customer (phone on their order, or in person) before
 * running this. Writing a guess would mail their details to a stranger.
 *
 * Usage:
 *   node scripts/fix-undeliverable-email.js <customerId> <correctEmail>
 *   node scripts/fix-undeliverable-email.js <customerId> <correctEmail> --send
 *
 * Without --send it verifies everything and prints the plan, writing nothing.
 */
require('dotenv').config();
const https = require('https');
const { supabase } = require('../utils/supabaseDb');
const { sendEmail } = require('../utils/emailService');

const customerId = parseInt(process.argv[2], 10);
const newEmailRaw = process.argv[3];
const doSend = process.argv.includes('--send');

if (!customerId || !newEmailRaw) {
  console.error('Usage: node scripts/fix-undeliverable-email.js <customerId> <correctEmail> [--send]');
  process.exit(1);
}

const newEmail = String(newEmailRaw).trim().toLowerCase();
const RESEND_KEY = process.env.RESEND_API_KEY;
const SHOPIFY_API_VERSION = '2024-04';

const fail = (msg) => { console.error(`\n✖ ${msg}`); process.exit(1); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function resendGet(path) {
  return fetch(`https://api.resend.com${path}`, { headers: { Authorization: `Bearer ${RESEND_KEY}` } })
    .then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
}

// Raw HTTPS, mirroring shopifyGraphQL() in routes/shopify.js: the SDK's
// node-fetch client truncates gzip responses on Railway.
function shopifyGraphQL(query, variables = {}) {
  const payload = JSON.stringify({ query, variables });
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: process.env.SHOPIFY_SHOP_DOMAIN,
      path: `/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'identity',
        'Connection': 'close',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Shopify HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
        }
        try {
          const parsed = JSON.parse(raw);
          if (parsed.errors) return reject(new Error(`Shopify GraphQL errors: ${JSON.stringify(parsed.errors).slice(0, 300)}`));
          resolve(parsed.data);
        } catch (e) {
          reject(new Error(`Shopify JSON parse failed: ${e.message}`));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('Shopify request timed out after 30s')));
    req.write(payload);
    req.end();
  });
}

(async () => {
  if (!RESEND_KEY) fail('RESEND_API_KEY not set');
  if (!process.env.SHOPIFY_ACCESS_TOKEN || !process.env.SHOPIFY_SHOP_DOMAIN) fail('Shopify credentials not set');

  // ---------------------------------------------------------------- customer
  const { data: customer, error: cErr } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email, shopify_customer_id, email_locked')
    .eq('id', customerId)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!customer) fail(`No customer with id ${customerId}`);

  const oldEmail = String(customer.email || '').toLowerCase();
  const name = `${customer.first_name || ''} ${customer.last_name || ''}`.trim();

  console.log(`customer:   ${name} <${oldEmail}>  (id ${customer.id})`);
  console.log(`shopify:    ${customer.shopify_customer_id || '— none —'}`);
  console.log(`new email:  ${newEmail}`);
  console.log(`mode:       ${doSend ? 'SEND (writes to Shopify, customers and Resend)' : 'dry run — nothing will be written'}\n`);

  // ------------------------------------------------------------- validations
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newEmail)) fail(`"${newEmail}" is not a valid email address`);
  if (newEmail === oldEmail) fail('The new address is the same as the current one — nothing to fix');
  if (!customer.shopify_customer_id) fail('Customer has no shopify_customer_id; fix Shopify by hand first or sync will revert this');

  const supp = await resendGet('/suppressions?limit=100');
  if (supp.status !== 200) fail(`Resend suppressions: ${supp.status} ${JSON.stringify(supp.body).slice(0, 200)}`);
  const suppressed = supp.body.data || [];
  const byAddress = new Map(suppressed.map(s => [String(s.email).toLowerCase(), s]));

  const oldRecord = byAddress.get(oldEmail);
  if (!oldRecord) {
    fail(`${oldEmail} is NOT on the suppression list — this customer is not the undeliverable case. ` +
         'Check the digest finding again before changing anyone\'s address.');
  }
  console.log(`✓ ${oldEmail} is suppressed since ${oldRecord.created_at.slice(0, 10)} (${oldRecord.origin})`);

  if (byAddress.has(newEmail)) {
    fail(`${newEmail} is ALSO on the suppression list (since ${byAddress.get(newEmail).created_at.slice(0, 10)}). ` +
         'That address is dead too — get another one from the customer.');
  }
  console.log('✓ the new address is not suppressed');

  // Never silently merge two customers by giving one another's address.
  const { data: clash } = await supabase
    .from('customers').select('id, first_name, last_name').ilike('email', newEmail).neq('id', customerId);
  if (clash && clash.length) {
    fail(`${newEmail} already belongs to customer ${clash[0].id} ` +
         `(${clash[0].first_name} ${clash[0].last_name}). Merge in Shopify first — see the ` +
         'shopify-merge-orphan-row note. This script will not reassign an address.');
  }
  console.log('✓ no other customer holds the new address');

  const shopNow = await shopifyGraphQL(
    `query($id: ID!) { customer(id: $id) { id email firstName lastName } }`,
    { id: `gid://shopify/Customer/${customer.shopify_customer_id}` }
  );
  if (!shopNow.customer) fail(`Shopify customer ${customer.shopify_customer_id} not found`);
  if (String(shopNow.customer.email || '').toLowerCase() !== oldEmail) {
    console.warn(`⚠️  Shopify holds "${shopNow.customer.email}", the app holds "${oldEmail}" — they already disagree.`);
  }
  console.log(`✓ Shopify customer reachable (currently ${shopNow.customer.email})`);

  // --------------------------------------------------- what was actually lost
  // Resend decides, not the app's own log: a row is only re-sent if Resend
  // says the message bounced or was discarded.
  const { data: rows, error: sErr } = await supabase
    .from('sent_emails')
    .select('id, email_type, course_identifier, subject, resend_message_id, sent_at')
    .contains('recipient_emails', [customer.email])
    .order('sent_at');
  if (sErr) throw sErr;

  const lost = [];
  console.log(`\nsent_emails rows addressed to ${oldEmail}: ${rows?.length || 0}`);
  for (const row of rows || []) {
    if (!row.resend_message_id) {
      console.log(`  – ${row.sent_at.slice(0, 16)}  ${row.email_type}  (no message id — cannot check)`);
      continue;
    }
    const r = await resendGet(`/emails/${row.resend_message_id}`);
    const event = r.status === 200 ? r.body.last_event : `lookup ${r.status}`;
    const recoverable = r.status === 200 && (event === 'bounced' || event === 'suppressed') && r.body.html;
    console.log(`  ${recoverable ? '→' : '–'} ${row.sent_at.slice(0, 16)}  ${row.email_type}  [${event}]`);
    if (recoverable) lost.push({ row, subject: r.body.subject || row.subject, html: r.body.html });
    else if (r.status === 200 && (event === 'bounced' || event === 'suppressed')) {
      console.log(`      ⚠️  aged out of Resend retention — body unavailable, re-send by hand`);
    }
    await sleep(120); // stay well under Resend's rate limit
  }

  console.log(`\nto re-send: ${lost.length}`);
  for (const l of lost) console.log(`  • ${l.row.email_type} — ${l.subject}`);

  if (!doSend) {
    console.log('\nDry run. Re-run with --send to apply:');
    console.log(`  node scripts/fix-undeliverable-email.js ${customerId} ${newEmail} --send`);
    console.log('\nThe suppression on the old address is left in place on purpose — that mailbox is gone.');
    process.exit(0);
  }

  // --------------------------------------------------------------- 1. Shopify
  console.log('\n— writing —');
  const upd = await shopifyGraphQL(
    `mutation($input: CustomerInput!) {
       customerUpdate(input: $input) { customer { id email } userErrors { field message } }
     }`,
    { input: { id: `gid://shopify/Customer/${customer.shopify_customer_id}`, email: newEmail } }
  );
  const uErrs = upd.customerUpdate?.userErrors || [];
  if (uErrs.length) fail(`Shopify rejected the update: ${JSON.stringify(uErrs)}`);

  const verify = await shopifyGraphQL(
    `query($id: ID!) { customer(id: $id) { email } }`,
    { id: `gid://shopify/Customer/${customer.shopify_customer_id}` }
  );
  if (String(verify.customer?.email || '').toLowerCase() !== newEmail) {
    fail(`Shopify still reads "${verify.customer?.email}" after the update — stopping before the local write ` +
         'so the two do not diverge.');
  }
  console.log(`✓ Shopify updated and verified: ${verify.customer.email}`);

  // ----------------------------------------------------------- 2. local row
  const { error: uErr } = await supabase
    .from('customers').update({ email: newEmail, updated_at: new Date().toISOString() }).eq('id', customerId);
  if (uErr) fail(`Local update failed: ${uErr.message}`);

  const { data: after } = await supabase.from('customers').select('email').eq('id', customerId).maybeSingle();
  if (String(after?.email || '').toLowerCase() !== newEmail) fail(`Local row still reads "${after?.email}"`);
  console.log(`✓ customers.${customerId}.email updated and verified: ${after.email}`);

  // ------------------------------------------------------------- 3. re-sends
  const sent = [];
  for (const { row, subject, html } of lost) {
    const result = await sendEmail({ to: newEmail, subject, html });
    if (!result.success) {
      console.error(`✖ re-send failed for ${row.email_type}: ${result.error}`);
      continue;
    }
    await supabase.from('sent_emails').insert({
      email_type: row.email_type,
      course_identifier: row.course_identifier,
      subject,
      recipient_count: 1,
      recipient_emails: [newEmail],
      sent_by: 'fix-undeliverable-email.js',
      resend_message_id: result.messageId,
    });
    sent.push({ type: row.email_type, id: result.messageId });
    console.log(`✓ re-sent ${row.email_type} → ${newEmail} (${result.messageId})`);
    await sleep(700); // Resend allows 2 requests/second
  }

  // -------------------------------------------------------------- 4. verify
  if (sent.length) {
    console.log('\nwaiting 15s for Resend delivery events…');
    await sleep(15000);
    for (const s of sent) {
      const r = await resendGet(`/emails/${s.id}`);
      const event = r.status === 200 ? r.body.last_event : `lookup ${r.status}`;
      const ok = ['delivered', 'sent', 'delivery_delayed'].includes(event);
      console.log(`  ${ok ? '✓' : '✖'} ${s.type}: ${event}`);
      if (event === 'bounced' || event === 'suppressed') {
        console.error(`     ${newEmail} did not accept it either — that address is wrong too.`);
      }
    }
    console.log('\nEvents can lag; re-check with scripts/audit-email-delivery.js if any still read "sent".');
  }

  console.log(`\nDone. ${sent.length}/${lost.length} re-sent. The old address stays suppressed.`);
})().catch(e => { console.error('\n✖', e.message); process.exit(1); });
