// Migration: mark a class instance as a glazing class explicitly.
//
// Glazing was only ever DERIVED from the class code — the final week of a WT
// cohort (WT0206NT_JL6.6, where the trailing <total>.<week> are equal). An HB
// drop-in has no week numbering, so no HB session could ever be a glazing class,
// which is why 10-class students had nothing to book for their glazing.
//
//   class_instances.is_glazing        explicit marker, set by instructor or admin
//   class_instances.glazing_capacity  how many of the class's seats may be glazing
//                                     bookings (null = the GLAZING_SUBCAP default)
//   bookings.counts_as_glazing        this booking consumed the student's glazing
//
// The sub-capacity is what keeps an HB glazing class usable by everyone: the
// class still holds 8, of which at most 4 are glazing students.
//
// READ then WRITE (idempotent). Run from server/:
//   node scripts/add-glazing-class-columns.js
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

const STATEMENTS = [
  'ALTER TABLE class_instances ADD COLUMN IF NOT EXISTS is_glazing boolean NOT NULL DEFAULT false;',
  'ALTER TABLE class_instances ADD COLUMN IF NOT EXISTS glazing_capacity integer;',
  'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS counts_as_glazing boolean NOT NULL DEFAULT false;',
  // Every glazing gate counts booked glazing rows for one class instance.
  'CREATE INDEX IF NOT EXISTS bookings_glazing_idx ON bookings (class_instance_id) WHERE counts_as_glazing;',
];

(async () => {
  const client = new Client({ connectionString: buildConnectionString() });
  await client.connect();
  try {
    for (const sql of STATEMENTS) {
      await client.query(sql);
      console.log('ok  ' + sql.split('\n')[0]);
    }

    const { rows } = await client.query(`
      SELECT table_name, column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE (table_name = 'class_instances' AND column_name IN ('is_glazing', 'glazing_capacity'))
         OR (table_name = 'bookings' AND column_name = 'counts_as_glazing')
      ORDER BY table_name, column_name;
    `);
    console.log('\nresulting columns:');
    for (const r of rows) {
      console.log(`  ${r.table_name}.${r.column_name} — ${r.data_type}, default ${r.column_default || 'none'}, nullable ${r.is_nullable}`);
    }
    if (rows.length !== 3) {
      console.error(`\nexpected 3 columns, found ${rows.length}`);
      process.exit(1);
    }
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('migration failed:', e.message);
  process.exit(1);
});
