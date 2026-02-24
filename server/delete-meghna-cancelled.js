require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function deleteMeghnaCancelled() {
  // Delete the 5 cancelled WT1901AM_JL6 bookings
  const bookingIds = [21190, 21191, 21192, 21193, 21194];

  console.log(`Deleting ${bookingIds.length} cancelled WT1901AM_JL6 bookings...`);
  console.log('Booking IDs:', bookingIds.join(', '));

  const { data, error } = await supabase
    .from('bookings')
    .delete()
    .in('id', bookingIds)
    .select();

  if (error) {
    console.error('Error deleting bookings:', error);
    return;
  }

  console.log(`\n✅ Successfully deleted ${data.length} bookings`);
  console.log('\nMeghna should now have:');
  console.log('  - 6 attended (WT3108AM_JL6)');
  console.log('  - 6 booked (WT1801AM_DL6)');
  console.log('  - Total: 12 bookings');
}

deleteMeghnaCancelled().then(() => process.exit());
