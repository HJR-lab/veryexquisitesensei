require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function deleteAllBookings() {
  try {
    console.log('Deleting all bookings\n');

    const { error } = await supabase
      .from('bookings')
      .delete()
      .neq('id', 0); // Delete all records

    if (error) throw error;

    console.log('All bookings deleted successfully');
    process.exit(0);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

deleteAllBookings();
