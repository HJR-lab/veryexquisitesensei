require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkAmy() {
  try {
    // Find Amy
    const { data: amy, error: amyError } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('id', 2220)
      .single();

    if (amyError) throw amyError;

    console.log('Amy Xiao Liu:');
    console.log(`  ID: ${amy.id}`);
    console.log(`  Email: ${amy.email}`);
    console.log(`  Name: ${amy.first_name} ${amy.last_name}`);
    console.log(`  Customer Type: ${amy.customer_type}`);
    console.log(`  Classes Allocated: ${amy.classes_allocated}`);

    // Check her bookings
    const { data: bookings, error: bookingsError } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_date,
          class_type,
          start_time
        )
      `)
      .eq('student_id', 2220);

    if (bookingsError) throw bookingsError;

    // Sort by date
    bookings.sort((a, b) => {
      const dateA = new Date(a.class_instances.class_date);
      const dateB = new Date(b.class_instances.class_date);
      return dateA - dateB;
    });

    console.log(`\nBookings (${bookings.length} total):`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    bookings.forEach(b => {
      const classDate = new Date(b.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      const isFuture = classDate >= today;
      console.log(`  - ${b.class_instances.class_type} on ${b.class_instances.class_date} - Status: ${b.status} ${isFuture ? '(FUTURE)' : '(PAST)'}`);
    });

    // Check if she has future bookings
    const futureBookings = bookings.filter(b => {
      const classDate = new Date(b.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      return classDate >= today;
    });

    console.log(`\nFuture bookings: ${futureBookings.length}`);
    console.log(`Should be active: ${futureBookings.length > 0 ? 'YES' : 'NO'}`);
    console.log(`\nCustomer type issue: ${amy.customer_type === 'course' ? 'YES - should be "student"' : 'NO'}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkAmy();
