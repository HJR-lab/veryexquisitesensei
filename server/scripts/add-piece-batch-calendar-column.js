// Migration: add piece_batches.google_calendar_event_id (TEXT).
//
// A confirmed pickup gets an all-day marker on the info@ves.sg studio calendar
// (same pattern as the membership term markers) so the collection day shows up
// in the daily view rather than only in the admin pipeline column. The event id
// is stored so a later update moves the existing marker instead of stacking a
// second one, and a terminal status can delete it. Idempotent.
//
// Run from server/:  node scripts/add-piece-batch-calendar-column.js
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
      'ALTER TABLE piece_batches ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT;'
    );
    const { rows } = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'piece_batches' AND column_name = 'google_calendar_event_id';"
    );
    console.log('piece_batches.google_calendar_event_id column:', rows.length ? rows[0] : 'NOT FOUND');
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
