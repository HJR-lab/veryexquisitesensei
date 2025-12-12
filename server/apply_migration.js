const fs = require('fs');
const path = require('path');
const supabaseDb = require('./utils/supabaseDb');

async function applyMigration() {
  try {
    const migrationPath = path.join(__dirname, 'migrations', 'add_course_enrollment_tracking.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Applying migration: add_course_enrollment_tracking.sql');

    // Split by semicolons and execute each statement separately
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.length > 0) {
        console.log('\nExecuting:', statement.substring(0, 100) + '...');

        const { error } = await supabaseDb.supabase.rpc('exec', {
          sql: statement + ';'
        });

        if (error) {
          console.error('Error:', error);
          // Try direct query approach
          const { error: error2 } = await supabaseDb.supabase
            .from('_migrations')
            .insert({ sql: statement });

          if (error2) {
            console.error('Alternative approach failed:', error2);
          }
        } else {
          console.log('✓ Success');
        }
      }
    }

    console.log('\n✅ Migration application attempted!');
    process.exit(0);
  } catch (error) {
    console.error('Failed:', error);
    process.exit(1);
  }
}

applyMigration();
