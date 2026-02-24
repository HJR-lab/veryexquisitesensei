require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function renameToCalvin() {
  try {
    console.log('Renaming Karyn Chan to Calvin Chan (Mitchell)...\n');

    // Update the customer name
    const { data, error } = await supabaseDb.supabase
      .from('customers')
      .update({
        first_name: 'Calvin',
        last_name: 'Chan'
      })
      .eq('email', 'Mitchell.chandx@gmail.com')
      .select();

    if (error) {
      console.error('Error updating name:', error);
      return;
    }

    console.log('✅ Updated successfully:');
    console.log(`  Name: ${data[0].first_name} ${data[0].last_name}`);
    console.log(`  Email: ${data[0].email}`);
    console.log(`  ID: ${data[0].id}`);

    console.log('\n✅ Calvin Chan (Mitchell) and Sarah should both appear in Active Students for WT1701PM_DL6');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

renameToCalvin();
