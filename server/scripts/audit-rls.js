// Read-only audit + fix: enable RLS on public-schema tables that don't have it.
// Uses Supabase pooler (IPv4) since direct host is IPv6-only on this network.
// Pass --apply to actually enable RLS; default is dry-run.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');
const { URL } = require('url');

const APPLY = process.argv.includes('--apply');

function parseDirect(connStr) {
  const u = new URL(connStr);
  return {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    host: u.hostname,
    port: Number(u.port || 5432),
    database: u.pathname.replace(/^\//, '') || 'postgres',
  };
}

function projectRef(host) {
  // db.<ref>.supabase.co
  const m = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  return m ? m[1] : null;
}

async function tryConnect(cfg, label) {
  const c = new Client(cfg);
  try {
    await c.connect();
    console.log(`[ok] connected via ${label}`);
    return c;
  } catch (e) {
    console.log(`[fail] ${label}: ${e.message}`);
    try { await c.end(); } catch (_) {}
    return null;
  }
}

(async () => {
  const direct = parseDirect(process.env.DIRECT_URL || process.env.DATABASE_URL);
  const ref = projectRef(direct.host);
  if (!ref) {
    console.error('Could not parse project ref from host:', direct.host);
    process.exit(1);
  }

  const candidates = [
    // Transaction pooler (IPv4), common regions for Singapore project:
    { host: `aws-0-ap-southeast-1.pooler.supabase.com`, port: 6543, label: 'pooler/ap-southeast-1:6543' },
    { host: `aws-0-ap-southeast-1.pooler.supabase.com`, port: 5432, label: 'pooler/ap-southeast-1:5432' },
    { host: `aws-1-ap-southeast-1.pooler.supabase.com`, port: 6543, label: 'pooler-1/ap-southeast-1:6543' },
    { host: `aws-0-ap-northeast-1.pooler.supabase.com`, port: 6543, label: 'pooler/ap-northeast-1:6543' },
    { host: `aws-0-ap-south-1.pooler.supabase.com`,     port: 6543, label: 'pooler/ap-south-1:6543' },
    { host: `aws-0-us-east-1.pooler.supabase.com`,      port: 6543, label: 'pooler/us-east-1:6543' },
    // Fallback: direct (will fail on IPv6-only networks)
    { host: direct.host, port: direct.port, label: 'direct' },
  ];

  let client = null;
  for (const c of candidates) {
    const cfg = {
      user: c.host.includes('pooler') ? `postgres.${ref}` : direct.user,
      password: direct.password,
      host: c.host,
      port: c.port,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 4000,
    };
    client = await tryConnect(cfg, c.label);
    if (client) break;
  }
  if (!client) {
    console.error('Could not reach Supabase via any candidate endpoint.');
    process.exit(2);
  }

  const { rows } = await client.query(`
    SELECT c.relname AS table_name,
           c.relrowsecurity AS rls_enabled,
           (SELECT count(*) FROM pg_policies p
              WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relrowsecurity, c.relname;
  `);

  const off = rows.filter(r => !r.rls_enabled);
  const on  = rows.filter(r =>  r.rls_enabled);

  console.log(`\nTotal public tables: ${rows.length}`);
  console.log(`RLS OFF: ${off.length}`);
  console.log(`RLS ON:  ${on.length}\n`);

  console.log('-- RLS DISABLED --');
  off.forEach(r => console.log(`  ${r.table_name}  (policies: ${r.policy_count})`));
  console.log('\n-- RLS ENABLED --');
  on.forEach(r => console.log(`  ${r.table_name}  (policies: ${r.policy_count})`));

  if (APPLY) {
    console.log('\n--- APPLYING: ENABLE ROW LEVEL SECURITY ---');
    for (const r of off) {
      const sql = `ALTER TABLE public."${r.table_name}" ENABLE ROW LEVEL SECURITY;`;
      try {
        await client.query(sql);
        console.log(`  enabled RLS: ${r.table_name}`);
      } catch (e) {
        console.error(`  FAILED ${r.table_name}: ${e.message}`);
      }
    }
  } else {
    console.log('\n(Dry run. Re-run with --apply to enable RLS on the listed tables.)');
  }

  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
