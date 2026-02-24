const { supabase } = require('./utils/supabaseDb');

async function initSyncTracking() {
  console.log('🔄 Initializing sync tracking...');

  // Try to insert a record - this will also create the table if needed
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data, error } = await supabase
    .from('sync_tracking')
    .upsert({
      sync_type: 'shopify_orders',
      last_sync_at: sevenDaysAgo.toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'sync_type'
    })
    .select();

  if (error) {
    console.error('❌ Error:', error);
    console.log('\n⚠️  Table does not exist. Please create it manually in Supabase SQL Editor:');
    console.log('\nCREATE TABLE sync_tracking (');
    console.log('  sync_type VARCHAR(50) PRIMARY KEY,');
    console.log('  last_sync_at TIMESTAMPTZ NOT NULL,');
    console.log('  updated_at TIMESTAMPTZ DEFAULT NOW()');
    console.log(');\n');
  } else {
    console.log('✅ Sync tracking initialized:', data);
  }
}

initSyncTracking().then(() => process.exit(0)).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
