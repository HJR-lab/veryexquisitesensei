require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkBookings() {
  console.log('=== STUDENT BOOKINGS FOR 2025+ CLASSES ===\n');

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .gte('class_date', '2025-01-01')
    .order('class_date', { ascending: true })
    .limit(20);

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (bookings && bookings.length > 0) {
    bookings.forEach(b => {
      console.log(`Date: ${b.class_date} | ${b.class_instance_id}`);
      console.log(`  Customer ID: ${b.customer_id}`);
      console.log(`  Status: ${b.status}`);
      console.log('---');
    });

    const { count } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .gte('class_date', '2025-01-01');

    console.log(`\nTotal bookings for 2025+: ${count}`);
  } else {
    console.log('No bookings found for 2025+');
  }

  console.log('\n=== ENROLLMENT STATUS BREAKDOWN ===\n');

  const statuses = ['active', 'confirmed', 'pending', 'cancelled', 'completed'];

  for (const status of statuses) {
    const { count } = await supabase
      .from('course_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('status', status);

    console.log(`${status.toUpperCase()}: ${count}`);
  }

  process.exit(0);
}

checkBookings().catch(console.error);
