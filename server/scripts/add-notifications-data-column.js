// Migration: add notifications.data (JSONB).
//
// The column is in add_admin_photos_and_notifications.sql but the prod table was
// created without it, so createNotification()'s insert has always failed with
// PGRST204. That throw happens BEFORE sendAndLogEmail() in the pieces "ready"
// route, so no student has ever received a pieces-ready email or an in-app
// notification. Idempotent (ADD COLUMN IF NOT EXISTS).
//
// Run from server/:  node scripts/add-notifications-data-column.js
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

(async () => {
  const client = new Client({ connectionString: buildConnectionString() });
  await client.connect();
  try {
    await client.query(
      "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb;"
    );
    const { rows } = await client.query(
      "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'data';"
    );
    console.log('notifications.data column:', rows.length ? rows[0] : 'NOT FOUND');
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
