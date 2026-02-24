require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function testSupabaseJoin() {
  console.log('=== TESTING SUPABASE JOIN FOR SARAH BOOKINGS ===\n');

  const sarahId = 1197;

  // Test 1: Get bookings without join
  console.log('Test 1: Bookings WITHOUT join');
  const { data: rawBookings, error: rawError } = await supabase
    .from('bookings')
    .select('*')
    .eq('student_id', sarahId);

  console.log(`Result: ${rawBookings?.length || 0} bookings`);
  if (rawError) console.error('Error:', rawError);

  // Test 2: Get bookings WITH join (using foreign key name from schema)
  console.log('\nTest 2: Bookings WITH join using class_instances');
  const { data: joinedBookings, error: joinError } = await supabase
    .from('bookings')
    .select(`
      *,
      class_instances (
        id,
        class_type,
        class_date,
        start_time,
        end_time
      )
    `)
    .eq('student_id', sarahId);

  console.log(`Result: ${joinedBookings?.length || 0} bookings`);
  if (joinError) console.error('Error:', joinError);

  if (joinedBookings && joinedBookings.length > 0) {
    console.log('\nFirst booking with join:');
    console.log(JSON.stringify(joinedBookings[0], null, 2));
  }

  // Test 3: Check one specific booking
  if (rawBookings && rawBookings.length > 0) {
    const firstBooking = rawBookings[0];
    console.log(`\nTest 3: Checking class instance ${firstBooking.class_instance_id}`);

    const { data: classInstance } = await supabase
      .from('class_instances')
      .select('*')
      .eq('id', firstBooking.class_instance_id)
      .single();

    console.log('Class instance found:', classInstance ? 'YES' : 'NO');
    if (classInstance) {
      console.log(`  Type: ${classInstance.class_type}, Date: ${classInstance.class_date}`);
    }
  }
}

testSupabaseJoin().then(() => process.exit());
