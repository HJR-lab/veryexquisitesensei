require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkJoeyStatus() {
  try {
    console.log('\n🔍 Checking Joey Lee status...\n');

    // Get Joey's customer record
    const { data: joey, error: joeyError } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'joey.lee2302@gmail.com')
      .single();

    if (joeyError || !joey) {
      console.error('❌ Joey not found:', joeyError);
      return;
    }

    console.log('✅ Joey Lee (ID:', joey.id, ')');
    console.log('   Email:', joey.email);
    console.log('   Classes allocated:', joey.classes_allocated);
    console.log('   Classes used:', joey.classes_used);
    console.log('   Classes remaining:', (joey.classes_allocated || 0) - (joey.classes_used || 0));
    console.log('   Purchase count:', joey.course_purchase_count);

    // Get Joey's bookings
    const { data: bookings, error: bookingsError } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        id,
        status,
        booking_date,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date,
          start_time,
          end_time
        )
      `)
      .eq('student_id', joey.id)
      .order('class_instances(class_date)', { ascending: true });

    if (bookingsError) {
      console.error('❌ Error fetching bookings:', bookingsError);
      return;
    }

    console.log(`\n📅 Bookings (${bookings.length} total):`);
    const today = new Date().toISOString().split('T')[0];
    console.log(`   Today is: ${today}`);

    bookings.forEach(b => {
      const classDate = b.class_instances?.class_date?.split('T')[0];
      const isFuture = classDate >= today;
      const icon = isFuture ? '🔵' : '⚪';
      console.log(`   ${icon} ${classDate} ${b.class_instances?.start_time} - ${b.class_instances?.class_type} (${b.status})`);
    });

    const futureBookings = bookings.filter(b => {
      const classDate = b.class_instances?.class_date?.split('T')[0];
      return classDate >= today;
    });

    console.log(`\n📊 Summary:`);
    console.log(`   Total bookings: ${bookings.length}`);
    console.log(`   Future bookings: ${futureBookings.length}`);
    console.log(`   Should be active student: ${futureBookings.length > 0 ? 'YES ✅' : 'NO ❌'}`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkJoeyStatus();
