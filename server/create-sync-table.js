require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://fpdbfbxpthmaceuspcrf.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function createSyncTrackingTable() {
  console.log('Creating sync_tracking table...');

  // Try to query the table first to see if it exists
  const { error: checkError } = await supabase
    .from('sync_tracking')
    .select('*')
    .limit(1);

  if (checkError && (checkError.code === '42P01' || checkError.code === 'PGRST205')) {
    // Table doesn't exist (error code 42P01 or PGRST205 means "undefined_table" or "not in schema cache")
    console.log('Table does not exist. Need to create it manually.');
    console.log('\n⚠️  Please run this SQL in Supabase SQL Editor:');
    console.log('\nCREATE TABLE IF NOT EXISTS sync_tracking (');
    console.log('  sync_type VARCHAR(50) PRIMARY KEY,');
    console.log('  last_sync_at TIMESTAMPTZ NOT NULL,');
    console.log('  updated_at TIMESTAMPTZ DEFAULT NOW()');
    console.log(');\n');
    console.log("INSERT INTO sync_tracking (sync_type, last_sync_at)");
    console.log("VALUES ('shopify_orders', NOW() - INTERVAL '7 days')");
    console.log('ON CONFLICT (sync_type) DO NOTHING;\n');
    return;
  } else if (checkError) {
    console.error('Error checking table:', checkError);
    return;
  }

  console.log('✅ Table exists!');

  // Insert initial record
  console.log('Inserting initial sync record...');
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { error: insertError } = await supabase
    .from('sync_tracking')
    .upsert({
      sync_type: 'shopify_orders',
      last_sync_at: sevenDaysAgo.toISOString()
    }, {
      onConflict: 'sync_type'
    });

  if (insertError) {
    console.error('Error inserting initial record:', insertError);
  } else {
    console.log('✅ Initial sync record created successfully!');
  }
}

createSyncTrackingTable()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
