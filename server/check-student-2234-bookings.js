require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkStudent2234() {
  try {
    console.log('Checking all bookings for student 2234...\n');

    // Get all bookings for student 2234
    const { data: bookings, error } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          id,
          class_type,
          class_date,
          start_time,
          instructor
        )
      `)
      .eq('student_id', 2234)
      .order('class_instances(class_date)', { ascending: true });

    if (error) throw error;

    console.log(`Found ${bookings.length} total bookings for student 2234:\n`);

    bookings.forEach((b, index) => {
      if (b.class_instances) {
        const isGlazing = b.class_instances.class_type?.includes('6.6');
        const date = new Date(b.class_instances.class_date);
        console.log(`${index + 1}. Class: ${b.class_instances.class_type}${isGlazing ? ' (GLAZING)' : ''}`);
        console.log(`   Date: ${date.toLocaleDateString()} at ${b.class_instances.start_time}`);
        console.log(`   Status: ${b.status}`);
        console.log(`   Booking Type: ${b.booking_type || 'regular'}`);
        console.log(`   Class Instance ID: ${b.class_instance_id}`);
        console.log('');
      }
    });

    // Check for Feb 4 specifically
    const feb4Bookings = bookings.filter(b =>
      b.class_instances?.class_date === '2026-02-04'
    );

    console.log(`\nBookings on Feb 4, 2026: ${feb4Bookings.length}`);
    if (feb4Bookings.length > 0) {
      feb4Bookings.forEach(b => {
        console.log(`  - ${b.class_instances.class_type} (${b.status})`);
      });
    }

    // Check for March 3 specifically
    const mar3Bookings = bookings.filter(b =>
      b.class_instances?.class_date === '2026-03-03'
    );

    console.log(`\nBookings on March 3, 2026: ${mar3Bookings.length}`);
    if (mar3Bookings.length > 0) {
      mar3Bookings.forEach(b => {
        console.log(`  - ${b.class_instances.class_type} (${b.status})`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkStudent2234();
