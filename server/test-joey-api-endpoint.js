require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function testJoeyAPIEndpoint() {
  try {
    console.log('\n🔍 Testing Joey Lee API endpoint simulation...\n');

    const email = 'joey.lee2302@gmail.com';
    const decodedEmail = decodeURIComponent(email);

    // Simulate the API endpoint logic
    const { data: student, error } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', decodedEmail)
      .single();

    if (error || !student) {
      console.log('❌ Student not found');
      console.log('Error:', error);
      return;
    }

    console.log('✅ Student found:');
    console.log(JSON.stringify(student, null, 2));

    // Test bookings endpoint
    console.log('\n📅 Testing bookings endpoint...\n');

    const { data: bookings, error: bookingsError } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date,
          start_time,
          end_time,
          instructor
        )
      `)
      .eq('student_id', student.id)
      .order('class_instances(class_date)', { ascending: true });

    if (bookingsError) {
      console.log('❌ Error fetching bookings:', bookingsError);
      return;
    }

    console.log(`✅ Found ${bookings.length} bookings`);
    bookings.forEach(b => {
      console.log(`   - ${b.class_instances?.class_date} ${b.class_instances?.start_time} - ${b.class_instances?.class_type} (${b.status})`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testJoeyAPIEndpoint();
