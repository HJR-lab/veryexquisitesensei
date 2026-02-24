require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function deleteGeraldine() {
  try {
    console.log('Deleting Geraldine Brogden\'s Feb 8 makeup class...\n');

    // Delete booking ID 27377 (WT1801AM_DL6.4 on Feb 8)
    const { error } = await supabaseDb.supabase
      .from('bookings')
      .delete()
      .eq('id', 27377);

    if (error) {
      console.error('Error deleting booking:', error);
      return;
    }

    console.log('✅ Deleted booking ID 27377');
    console.log('   Class: WT1801AM_DL6.4');
    console.log('   Date: 2026-02-08');
    console.log('   Type: makeup\n');

    console.log('✅ Geraldine Brogden will now only appear in Active Students');
    console.log('   Current course: WT2201NT_JL6 (started today, Feb 5)');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

deleteGeraldine();
