require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkGeraldine() {
  try {
    // Find Geraldine Brogden
    const { data: geraldine, error: geraldineError } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'gbr@uwcsea.edu.sg')
      .single();

    if (geraldineError) throw geraldineError;

    console.log('Geraldine Brogden:');
    console.log(`  ID: ${geraldine.id}`);
    console.log(`  Email: ${geraldine.email}`);
    console.log(`  Name: ${geraldine.first_name} ${geraldine.last_name}`);
    console.log(`  Customer Type: ${geraldine.customer_type}`);
    console.log(`  Classes Allocated: ${geraldine.classes_allocated}`);
    console.log(`  Course Purchase Count: ${geraldine.course_purchase_count}`);

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
      .eq('student_id', geraldine.id);

    if (bookingsError) throw bookingsError;

    console.log(`\nBookings: ${bookings.length} total`);

    if (bookings.length > 0) {
      bookings.forEach(b => {
        const classDate = new Date(b.class_instances.class_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        classDate.setHours(0, 0, 0, 0);
        const isFuture = classDate >= today;
        console.log(`  - ${b.class_instances.class_type} on ${b.class_instances.class_date} - Status: ${b.status} ${isFuture ? '(FUTURE)' : '(PAST)'}`);
      });
    } else {
      console.log('  No bookings found');
    }

    // Check if she should be active
    const futureBookings = bookings.filter(b => {
      const classDate = new Date(b.class_instances.class_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      classDate.setHours(0, 0, 0, 0);
      return classDate >= today && (b.status === 'booked' || b.status === 'attended');
    });

    console.log(`\nFuture bookings (booked/attended): ${futureBookings.length}`);
    console.log(`Should be active: ${futureBookings.length > 0 ? 'YES' : 'NO - needs bookings!'}`);

    console.log('\n⚠️  ISSUE: Active students are defined as students with FUTURE bookings.');
    console.log('   Geraldine has 6 class credits but NO bookings yet.');
    console.log('   She needs to book classes to appear in the Active Students list.');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkGeraldine();
