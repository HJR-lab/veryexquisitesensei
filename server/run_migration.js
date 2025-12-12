const fs = require('fs');
const path = require('path');
const supabaseDb = require('./utils/supabaseDb');

async function runMigration(migrationFile) {
  try {
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log(`Running migration: ${migrationFile}`);
    console.log('SQL:', sql);

    // Execute the migration SQL
    const { data, error } = await supabaseDb.supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.error('Migration error:', error);
      throw error;
    }

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Failed to run migration:', error);
    process.exit(1);
  }
}

// Get migration file from command line argument
const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node run_migration.js <migration-file.sql>');
  process.exit(1);
}

runMigration(migrationFile);
