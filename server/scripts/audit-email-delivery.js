#!/usr/bin/env node
/**
 * Reconcile every sent_emails row against what Resend actually did with it.
 *
 * sent_emails only records that Resend ACCEPTED the send. This asks Resend for
 * the outcome of each one and reports everything that did not reach a mailbox.
 *
 * Reading the results — until commit e5a5605 (01/09/26), sendAndLogEmail put
 * the studio copy in To as info@mail.ves.sg, the Resend sending subdomain,
 * which has no mailbox. Those messages report `bounced` from that dead To even
 * though the BCC recipients received them, so a pre-fix `bounced` on a BCC send
 * is NOT evidence a customer missed anything. What is conclusive:
 *
 *   - `suppressed`     the send never left Resend. Nobody got it.
 *   - `bounced` on a message whose To is a real recipient (no BCC).
 *   - any recipient on the suppression list, which blocks all future sends.
 *
 * Usage:
 *   node scripts/audit-email-delivery.js            # summary + conclusive losses
 *   node scripts/audit-email-delivery.js --all      # every non-delivered row
 */
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');

const KEY = process.env.RESEND_API_KEY;
const SHOW_ALL = process.argv.includes('--all');
// The To that had no mailbox, and the date the fix went out.
const DEAD_TO = 'info@mail.ves.sg';
const FIX_DATE = '2026-09-01T04:47:00Z';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function resendGet(path, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`https://api.resend.com${path}`, { headers: { Authorization: `Bearer ${KEY}` } });
    if (r.status === 429) { await sleep(1000 * (i + 1)); continue; }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
    return r.json();
  }
  throw new Error(`${path}: rate limited after ${tries} tries`);
}

// Page — an unbounded select stops at 1000 rows without saying so.
async function allSentEmails() {
  const rows = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase.from('sent_emails')
      .select('id, email_type, subject, recipient_emails, sent_at, sent_by, resend_message_id')
      .order('sent_at').range(from, from + size - 1);
    if (error) throw new Error(`sent_emails page at ${from}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < size) return rows;
  }
}

(async () => {
  if (!KEY) { console.error('RESEND_API_KEY not set'); process.exit(1); }

  const suppressed = new Set(
    ((await resendGet('/suppressions?limit=100'))?.data || []).map(s => String(s.email).toLowerCase())
  );

  const rows = (await allSentEmails()).filter(r => r.resend_message_id);
  console.log(`Checking ${rows.length} logged sends against Resend…\n`);

  const results = [];
  const CONCURRENCY = 4;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const got = await Promise.all(batch.map(async row => {
      try {
        const msg = await resendGet(`/emails/${row.resend_message_id}`);
        return { row, msg };
      } catch (e) {
        return { row, err: e.message };
      }
    }));
    results.push(...got);
    await sleep(120);
    if ((i / CONCURRENCY) % 20 === 0) process.stdout.write(`  ${Math.min(i + CONCURRENCY, rows.length)}/${rows.length}\r`);
  }
  process.stdout.write(' '.repeat(30) + '\r');

  const tally = {};
  const conclusive = [];
  const inconclusive = [];
  let gone = 0;

  for (const { row, msg, err } of results) {
    if (err) { tally['lookup-failed'] = (tally['lookup-failed'] || 0) + 1; continue; }
    if (!msg) { gone++; continue; }  // aged out of Resend's retention

    const ev = msg.last_event || 'unknown';
    tally[ev] = (tally[ev] || 0) + 1;
    if (ev === 'delivered') continue;

    const toDead = (msg.to || []).some(t => String(t).includes(DEAD_TO));
    const preFix = row.sent_at < FIX_DATE;
    const recipients = row.recipient_emails || [];
    const anySuppressed = recipients.filter(e => suppressed.has(String(e).toLowerCase()));

    const entry = { row, msg, ev, recipients, anySuppressed };
    // A pre-fix bounce on a message addressed to the dead To says nothing about
    // whether the BCC'd recipients got it.
    if (ev === 'suppressed' || anySuppressed.length > 0 || !(ev === 'bounced' && toDead && preFix)) {
      conclusive.push(entry);
    } else {
      inconclusive.push(entry);
    }
  }

  console.log('Resend outcome for every logged send:');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(k).padEnd(16)} ${v}`);
  if (gone) console.log(`  ${'(aged out)'.padEnd(16)} ${gone}`);

  console.log(`\nNot delivered, but explained by the dead To address (recipients almost`);
  console.log(`certainly received these; fixed in e5a5605): ${inconclusive.length}`);

  console.log(`\n${'='.repeat(70)}`);
  console.log(`CONCLUSIVE LOSSES — nobody received these: ${conclusive.length}`);
  console.log('='.repeat(70));
  for (const c of conclusive) {
    console.log(`\n  ${c.row.sent_at.slice(0, 16)} | ${c.ev} | ${c.row.email_type}`);
    console.log(`    ${String(c.row.subject).slice(0, 62)}`);
    console.log(`    to: ${c.recipients.join(', ')}`);
    if (c.anySuppressed.length) console.log(`    SUPPRESSED (all future sends blocked too): ${c.anySuppressed.join(', ')}`);
  }

  if (SHOW_ALL && inconclusive.length) {
    console.log(`\n${'='.repeat(70)}\nDead-To bounces (informational):`);
    for (const c of inconclusive) {
      console.log(`  ${c.row.sent_at.slice(0, 16)} | ${c.row.email_type} | ${c.recipients.join(', ')}`);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
