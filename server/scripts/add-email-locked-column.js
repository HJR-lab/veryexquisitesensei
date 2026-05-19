// Migration: add customers.email_locked (mirrors the existing name_locked flag).
// Permanent flag set when an admin manually edits a customer's email so that
// Shopify sync never reverts the edit. READ then WRITE (idempotent).
// Run from server/:  node scripts/add-email-locked-column.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// The direct DB host (db.<ref>.supabase.co) is IPv6-only; many networks can't
// reach it. Route through the Supabase session-mode pooler (IPv4) instead,
// reusing the DB password from .env. The pooler URL (host/user, no password)
// is written by the Supabase CLI to supabase/.temp/pooler-url.
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

(async () => {
  const connectionString = buildConnectionString();
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(
      'ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_locked boolean NOT NULL DEFAULT false;'
    );
    const { rows } = await client.query(
      "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'email_locked';"
    );
    console.log('email_locked column:', rows.length ? rows[0] : 'NOT FOUND');
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
