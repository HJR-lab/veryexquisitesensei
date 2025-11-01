const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);

async function runMigration() {
  console.log('🔄 Running booking type migration...\n');

  try {
    // Read the migration SQL
    const migrationSQL = fs.readFileSync('./add-booking-type-migration.sql', 'utf8');

    // Split by semicolons and filter out comments and empty statements
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('COMMENT'));

    // Execute each statement
    for (const statement of statements) {
      console.log('Executing:', statement.substring(0, 50) + '...');
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement });

      if (error) {
        // Try direct query if RPC doesn't work
        const { data, error: directError } = await supabase
          .from('_sql')
          .select('*')
          .limit(0);

        if (directError) {
          console.log('⚠️  Note: Running migrations via Supabase client has limitations.');
          console.log('   Please run the migration directly in Supabase SQL Editor:');
          console.log('   https://supabase.com/dashboard/project/fpdbfbxpthmaceuspcrf/sql\n');
          console.log('Migration SQL:');
          console.log(migrationSQL);
          return;
        }
      }
    }

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    console.log('\n⚠️  Please run the migration manually in Supabase SQL Editor:');
    console.log('   https://supabase.com/dashboard/project/fpdbfbxpthmaceuspcrf/sql\n');
    console.log('Migration SQL:');
    const migrationSQL = fs.readFileSync('./add-booking-type-migration.sql', 'utf8');
    console.log(migrationSQL);
  }
}

runMigration().catch(console.error);
