// Migration: delivery tracking + fee settlement on piece_batches.
//
// Picking "Deliver ($10)" used to write a status nothing downstream read — no
// pipeline column, no fulfilment action, no email ever. The studio now ships the
// batch itself and issues a tracking number, and the $10 comes off the student's
// VES credit balance, so the row needs somewhere to record all of that.
//
// delivery_fee (already present) stays the PRICE. delivery_fee_charged is what
// credits actually covered; whatever they could not reach becomes either
// delivery_fee_outstanding (billed, still owed) or delivery_fee_waived (written
// off). The admin picks which at the moment of shipping, so an unpaid balance is
// never created without somebody choosing it. Idempotent.
//
// Run from server/:  node scripts/add-piece-delivery-tracking-columns.js
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
  ['tracking_carrier', 'TEXT'],
  ['tracking_number', 'TEXT'],
  ['shipped_at', 'TIMESTAMPTZ'],
  ['delivery_fee_charged', 'NUMERIC(10,2)'],
  ['delivery_fee_outstanding', 'NUMERIC(10,2)'],
  ['delivery_fee_waived', 'NUMERIC(10,2)'],
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
       WHERE table_name = 'piece_batches' AND column_name = ANY($1)
       ORDER BY column_name;`,
      [COLUMNS.map(c => c[0])]
    );
    console.table(rows);
    if (rows.length !== COLUMNS.length) {
      throw new Error(`expected ${COLUMNS.length} columns, found ${rows.length}`);
    }
    console.log('All delivery tracking columns present.');
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
