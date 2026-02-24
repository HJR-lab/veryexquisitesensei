require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkSarahLogin() {
  console.log('=== CHECKING SARAH CHER LOGIN AND BOOKINGS ===\n');

  // Find Sarah Cher
  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .ilike('first_name', 'sarah')
    .ilike('last_name', 'cher');

  console.log(`Found ${customers?.length || 0} customers matching "Sarah Cher":\n`);
  customers?.forEach(c => {
    console.log(`- ID: ${c.id}, Email: ${c.email}, Name: ${c.first_name} ${c.last_name}`);
  });

  const sarahId = 1197;
  console.log(`\n=== CHECKING BOOKINGS FOR ID ${sarahId} ===\n`);

  // Get bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      student_id,
      status,
      class_instance_id,
      course_enrollment_id,
      class_instances (
        id,
        class_type,
        class_date,
        start_time,
        end_time
      )
    `)
    .eq('student_id', sarahId)
    .order('class_instances(class_date)');

  console.log(`Total bookings: ${bookings?.length || 0}\n`);

  if (bookings && bookings.length > 0) {
    console.log('First 5 bookings:');
    bookings.slice(0, 5).forEach(b => {
      console.log(`- Booking ID: ${b.id}, Class: ${b.class_instances?.class_type}, Date: ${b.class_instances?.class_date}, Status: ${b.status}`);
    });
  }

  // Check if there's a password set
  const { data: customer } = await supabase
    .from('customers')
    .select('email, password')
    .eq('id', sarahId)
    .single();

  console.log(`\n=== LOGIN INFO ===`);
  console.log(`Email: ${customer?.email}`);
  console.log(`Has password: ${customer?.password ? 'YES' : 'NO'}`);
}

checkSarahLogin().then(() => process.exit());
