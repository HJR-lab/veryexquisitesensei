require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkMeghnaBookings() {
  const customerId = 1198; // Meghna N (meghna.n30@gmail.com)

  console.log('Fetching all bookings for Meghna...\n');

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      class_instance_id,
      class_instances!bookings_class_instance_id_fkey (
        class_date,
        class_type,
        start_time
      )
    `)
    .eq('student_id', customerId);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Total bookings: ${bookings.length}\n`);

  // Group by status
  const byStatus = {};
  bookings.forEach(b => {
    if (!byStatus[b.status]) byStatus[b.status] = [];
    byStatus[b.status].push(b);
  });

  Object.keys(byStatus).forEach(status => {
    console.log(`\n${status.toUpperCase()} (${byStatus[status].length}):`);
    byStatus[status].forEach(b => {
      const ci = b.class_instances;
      console.log(`  ID: ${b.id} | ${ci.class_date} | ${ci.class_type} | ${ci.start_time}`);
    });
  });
}

checkMeghnaBookings().then(() => process.exit());
