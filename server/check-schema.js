const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkSchema() {
  console.log('📋 Checking database schema...\n');

  try {
    // Get all tables
    const { data: tables, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');

    if (error) {
      console.log('Using alternate method to list tables...');
      
      // Try getting data from known tables
      const knownTables = ['customers', 'class_bookings', 'class_instances', 'memberships', 'studio_memberships'];
      
      for (const tableName of knownTables) {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(0);
        
        if (!error) {
          console.log(`✅ Table exists: ${tableName}`);
        }
      }
    } else {
      console.log('Tables in database:');
      tables.forEach(t => console.log(`  - ${t.table_name}`));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkSchema();
