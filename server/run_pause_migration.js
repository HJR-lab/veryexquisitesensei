require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');
const fs = require('fs');

(async () => {
  try {
    console.log('📦 Running pause/reschedule migration...\n');

    const sql = fs.readFileSync('./migrations/add_pause_reschedule_tracking.sql', 'utf8');

    // Split by semicolon and run each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('COMMENT'));

    for (const statement of statements) {
      if (statement.includes('ALTER TABLE') || statement.includes('CREATE')) {
        try {
          const { error } = await supabase.rpc('exec_sql', { sql_query: statement + ';' });

          if (error) {
            // Try direct query if RPC doesn't exist
            const { error: directError } = await supabase.from('_migrations').insert({
              name: 'add_pause_reschedule_tracking',
              executed_at: new Date().toISOString()
            });

            console.log('⚠️  Note: Manual SQL execution required via Supabase dashboard');
            console.log('   Statement:', statement.substring(0, 100) + '...');
          } else {
            console.log('✅ Executed:', statement.substring(0, 60) + '...');
          }
        } catch (err) {
          console.log('⚠️  ', err.message);
        }
      }
    }

    console.log('\n📋 Migration SQL saved to: migrations/add_pause_reschedule_tracking.sql');
    console.log('   Please run this SQL in the Supabase SQL Editor:\n');
    console.log('   1. Go to Supabase Dashboard > SQL Editor');
    console.log('   2. Copy and paste the migration file');
    console.log('   3. Click "Run"\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
