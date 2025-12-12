require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkBookings() {
  console.log('Checking bookings table...\n');
  
  // Check total bookings
  const { data: allBookings, error: allError, count: totalCount } = await supabase
    .from('bookings')
    .select('*', { count: 'exact' });
  
  if (allError) {
    console.error('Error fetching bookings:', allError);
    return;
  }
  
  console.log(`Total bookings: ${totalCount}`);
  console.log(`Sample bookings:`, allBookings?.slice(0, 5));
  
  // Check booked/completed bookings
  const { data: activeBookings, error: activeError, count: activeCount } = await supabase
    .from('bookings')
    .select('*', { count: 'exact' })
    .in('status', ['booked', 'completed']);
  
  console.log(`\nActive bookings (booked/completed): ${activeCount}`);
  
  // Check course enrollments
  const { data: enrollments, error: enrollError, count: enrollCount } = await supabase
    .from('course_enrollments')
    .select('*', { count: 'exact' });
  
  console.log(`\nTotal course enrollments: ${enrollCount}`);
  console.log(`Sample enrollments:`, enrollments?.slice(0, 5));
  
  // Check class sessions
  const { data: sessions, error: sessError, count: sessCount } = await supabase
    .from('class_sessions')
    .select('*', { count: 'exact' })
    .gte('date', new Date().toISOString().split('T')[0])
    .order('date', { ascending: true });
  
  console.log(`\nUpcoming/current class sessions: ${sessCount}`);
  console.log(`Sample sessions:`, sessions?.slice(0, 5));
  
  // Check students
  const { data: students, error: studError, count: studCount } = await supabase
    .from('customers')
    .select('*', { count: 'exact' });
  
  console.log(`\nTotal customers: ${studCount}`);
  
  process.exit(0);
}

checkBookings().catch(console.error);
