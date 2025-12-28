require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('\n📊 Running database migration...\n');

  // Read the migration SQL
  const migrationFile = path.join(__dirname, 'migrations', 'add-credit-system.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');

  // Split into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--') && !s.startsWith('SELECT'));

  console.log(`Found ${statements.length} SQL statements to execute\n`);

  // Try to execute via Supabase REST API
  const url = `${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`;
  const headers = {
    'apikey': process.env.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  };

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    console.log(`Executing statement ${i + 1}/${statements.length}...`);
    console.log(stmt.substring(0, 80) + '...\n');

    try {
      const response = await axios.post(url, { query: stmt }, { headers });
      console.log('✓ Success\n');
    } catch (error) {
      if (error.response) {
        console.error('✗ Failed:', error.response.data);
      } else {
        console.error('✗ Failed:', error.message);
      }
      console.log('\n⚠️  Migration may need to be run manually through Supabase dashboard\n');
      console.log('See: https://supabase.com/dashboard/project/fpdbfbxpthmaceuspcrf/editor\n');
      process.exit(1);
    }
  }

  console.log('✅ Migration completed successfully!\n');
  process.exit(0);
}

runMigration().catch(console.error);
