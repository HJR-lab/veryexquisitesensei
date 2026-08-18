// Migration: create continuation_offers.
//
// A continuation offer is one question put to one package student about one
// cohort: do you want your next course here, yes / no / give me longer. The
// token is the student's only credential, exactly as with
// student_detail_requests.
//
// Idempotent (IF NOT EXISTS throughout). Run from server/:
//   node scripts/add-continuation-offers-table.js
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

const SQL = `
CREATE TABLE IF NOT EXISTS continuation_offers (
  id                    bigserial PRIMARY KEY,
  token                 text        NOT NULL UNIQUE,
  student_id            bigint      NOT NULL REFERENCES customers(id),
  source_enrollment_id  bigint      NOT NULL REFERENCES course_enrollments(id),

  -- The cohort being offered, keyed the way the continuation lookup keys it.
  cohort_identifier     text,
  cohort_start_date     date        NOT NULL,

  -- The date shown to the student. Deliberately separate from
  -- cohort_start_date: that column is the MATCHING KEY copied from
  -- course_enrollments, which on live data sits a day before the real first
  -- class on most cohorts. Never show cohort_start_date to a human.
  first_class_date      date,
  schedule_pattern      text        NOT NULL,
  class_time            text        NOT NULL,

  -- pending | confirmed | passed | lapsed
  status                text        NOT NULL DEFAULT 'pending',
  expires_at            timestamptz NOT NULL,
  extension_count       int         NOT NULL DEFAULT 0,

  -- Set when the student confirms and the enrollment is actually created.
  created_enrollment_id bigint      REFERENCES course_enrollments(id),

  created_at            timestamptz NOT NULL DEFAULT now(),
  responded_at          timestamptz,
  sent_at               timestamptz
);

-- One live offer per student per cohort. Any producer -- the admin Ask button
-- today, the automatic matcher later -- can be re-run without creating a
-- second offer for the same seat.
CREATE UNIQUE INDEX IF NOT EXISTS continuation_offers_live_unique
  ON continuation_offers (student_id, cohort_start_date, schedule_pattern, class_time)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS continuation_offers_status_expiry
  ON continuation_offers (status, expires_at);

CREATE INDEX IF NOT EXISTS continuation_offers_student
  ON continuation_offers (student_id);

-- For databases created before first_class_date existed.
ALTER TABLE continuation_offers ADD COLUMN IF NOT EXISTS first_class_date date;
`;

(async () => {
  const client = new Client({ connectionString: buildConnectionString() });
  await client.connect();
  try {
    await client.query(SQL);
    const { rows } = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'continuation_offers' ORDER BY ordinal_position;`
    );
    console.log(`continuation_offers: ${rows.length} columns`);
    rows.forEach(r => console.log(`  ${r.column_name.padEnd(22)} ${r.data_type}`));
    const { rows: idx } = await client.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'continuation_offers';`
    );
    console.log('indexes:', idx.map(i => i.indexname).join(', '));
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
