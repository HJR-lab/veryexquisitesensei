require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function fixNames() {
  try {
    console.log('Fixing names for Mitchell and Sarah Chan...\n');

    // Update Mitchell.chandx@gmail.com to "Mitchell Chan"
    const { data: mitchell, error: error1 } = await supabaseDb.supabase
      .from('customers')
      .update({
        first_name: 'Mitchell',
        last_name: 'Chan'
      })
      .eq('email', 'Mitchell.chandx@gmail.com')
      .select();

    if (error1) {
      console.error('Error updating Mitchell:', error1);
    } else {
      console.log('✅ Updated Mitchell:');
      console.log(`  Name: ${mitchell[0].first_name} ${mitchell[0].last_name}`);
      console.log(`  Email: ${mitchell[0].email}`);
    }

    // Update Mitchell.chandx+dup@gmail.com to "Sarah Chan"
    const { data: sarah, error: error2 } = await supabaseDb.supabase
      .from('customers')
      .update({
        first_name: 'Sarah',
        last_name: 'Chan'
      })
      .eq('email', 'Mitchell.chandx+dup@gmail.com')
      .select();

    if (error2) {
      console.error('Error updating Sarah:', error2);
    } else {
      console.log('\n✅ Updated Sarah:');
      console.log(`  Name: ${sarah[0].first_name} ${sarah[0].last_name}`);
      console.log(`  Email: ${sarah[0].email}`);
    }

    console.log('\n✅ Both Mitchell Chan and Sarah Chan should now appear in Active Students for WT1701PM_DL6');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

fixNames();
