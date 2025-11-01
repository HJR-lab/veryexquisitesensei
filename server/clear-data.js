const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function clearData() {
  console.log('🗑️  Clearing existing dummy data...\n');

  // Delete all class instances
  const { error: classError } = await supabase
    .from('class_instances')
    .delete()
    .neq('id', 0); // Delete all rows

  if (classError) {
    console.log('❌ Error clearing classes:', classError.message);
  } else {
    console.log('✓ Cleared all class instances');
  }

  // Delete all pottery pieces
  const { error: pieceError } = await supabase
    .from('pottery_pieces')
    .delete()
    .neq('id', 0); // Delete all rows

  if (pieceError) {
    console.log('❌ Error clearing pottery pieces:', pieceError.message);
  } else {
    console.log('✓ Cleared all pottery pieces');
  }

  console.log('\n✅ Database cleared successfully!\n');
}

clearData().catch(console.error);
