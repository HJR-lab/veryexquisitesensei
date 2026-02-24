require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixMitchellChanName() {
  try {
    console.log('=== Fixing Mitchell Chan Name ===\n');

    const customerId = 1116;

    // First, check current name
    const { data: before } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    console.log('Before update:');
    console.log(`  ID: ${before.id}`);
    console.log(`  Name: ${before.first_name} ${before.last_name}`);
    console.log(`  Email: ${before.email}`);

    // Update the name from "Karyn Chan" to "Mitchell Chan"
    const { data: updated, error } = await supabase
      .from('customers')
      .update({
        first_name: 'Mitchell',
        last_name: 'Chan'
      })
      .eq('id', customerId)
      .select()
      .single();

    if (error) {
      console.error('Error updating name:', error);
      return;
    }

    console.log('\nAfter update:');
    console.log(`  ID: ${updated.id}`);
    console.log(`  Name: ${updated.first_name} ${updated.last_name}`);
    console.log(`  Email: ${updated.email}`);

    console.log('\n✅ Successfully updated name from "Karyn Chan" to "Mitchell Chan"');

  } catch (error) {
    console.error('Error:', error);
  }
}

fixMitchellChanName().then(() => process.exit());