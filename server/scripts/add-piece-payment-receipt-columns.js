// Migration: PayNow receipt columns on piece_batches.
//
// A student with no studio credit settles the $10 delivery fee by PayNow and
// sends a screenshot as proof. Three columns, three distinct states:
//   payment_receipt_url   — the screenshot they uploaded (null = not sent yet)
//   payment_uploaded_at   — when they sent it
//   payment_confirmed_at  — when an admin actually checked the bank and agreed
//
// uploaded is NOT the same as confirmed. A screenshot is a claim, not a payment;
// only an admin marking it confirmed clears delivery_fee_outstanding. Idempotent.
//
// Run from server/:  node scripts/add-piece-payment-receipt-columns.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// The direct DB host (db.<ref>.supabase.co) is IPv6-only; many networks can't
// reach it. Route through the Supabase session-mode pooler (IPv4) instead,
// reusing the DB password from .env.
function buildConnectionString() {
  const src = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!src) throw new Error('No DIRECT_URL/DATABASE_URL in env');
  const password = new URL(src).password;
  const poolerPath = path.join(__dirname, '..', '..', 'supabase', '.temp', 'pooler-url');
  const poolerRaw = fs.readFileSync(poolerPath, 'utf8').trim();
  const pooler = new URL(poolerRaw);
  pooler.password = password;
  return pooler.toString();
}

const COLUMNS = [
  ['payment_receipt_url', 'TEXT'],
  ['payment_uploaded_at', 'TIMESTAMPTZ'],
  ['payment_confirmed_at', 'TIMESTAMPTZ'],
];

(async () => {
  const client = new Client({ connectionString: buildConnectionString() });
  await client.connect();
  try {
    for (const [name, type] of COLUMNS) {
      await client.query(`ALTER TABLE piece_batches ADD COLUMN IF NOT EXISTS ${name} ${type};`);
    }
    const { rows } = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'piece_batches' AND column_name = ANY($1) ORDER BY column_name;`,
      [COLUMNS.map(c => c[0])]
    );
    console.table(rows);
    if (rows.length !== COLUMNS.length) throw new Error(`expected ${COLUMNS.length}, found ${rows.length}`);
    console.log('All payment receipt columns present.');
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
