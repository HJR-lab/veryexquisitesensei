// Migration: add customers.mobile (text) + customers.date_of_birth (date).
// The profile-update endpoint and the Account form already exchange these
// fields; the columns were missing so writes failed with Postgres 42703.
// Run from server/:  node scripts/add-mobile-and-dob-columns.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

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
  const client = new Client({ connectionString: buildConnectionString() });
  await client.connect();
  try {
    await client.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS mobile TEXT;');
    await client.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS date_of_birth DATE;');
    const { rows } = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'customers' AND column_name IN ('mobile','date_of_birth') ORDER BY column_name;"
    );
    console.log('Columns now on customers:');
    for (const r of rows) console.log('  ' + r.column_name + ': ' + r.data_type);
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
