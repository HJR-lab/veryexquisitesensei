require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkShulingBookings() {
  // Find Shuling Tan
  const { data: student } = await supabase
    .from('customers')
    .select('id, email, first_name, last_name')
    .ilike('first_name', 'Shuling')
    .single();

  console.log('Student:', student);
  console.log('\nFetching all bookings...\n');

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
    .eq('student_id', student.id);

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

checkShulingBookings().then(() => process.exit());
