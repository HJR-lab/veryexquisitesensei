require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkMitchellBookings() {
  try {
    // Get Mitchell
    const { data: mitchell } = await supabase
      .from('customers')
      .select('*')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    console.log('=== Mitchell Chan ===');
    console.log(`ID: ${mitchell.id}`);
    console.log('');

    // Get all bookings with class details
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_date,
          class_type,
          start_time,
          end_time
        )
      `)
      .eq('student_id', mitchell.id);

    if (error) {
      console.error('Error fetching bookings:', error);
      return;
    }

    console.log(`Total Bookings: ${bookings?.length || 0}\n`);

    // Group by enrollment
    const byEnrollment = {};
    bookings.forEach(b => {
      const enrollmentId = b.course_enrollment_id || 'null';
      if (!byEnrollment[enrollmentId]) {
        byEnrollment[enrollmentId] = [];
      }
      byEnrollment[enrollmentId].push(b);
    });

    for (const [enrollmentId, bookingList] of Object.entries(byEnrollment)) {
      console.log(`\n=== Enrollment ID: ${enrollmentId} ===`);
      console.log(`Bookings: ${bookingList.length}`);

      bookingList.forEach((b, idx) => {
        console.log(`  ${idx + 1}. ${b.class_instances.class_date} - ${b.class_instances.class_type} (${b.status})`);
      });
    }

    // Check specifically for WT2802
    console.log(`\n\n=== WT2802 Bookings ===`);
    const wt2802Bookings = bookings.filter(b =>
      b.class_instances?.class_type?.includes('WT2802')
    );

    console.log(`Found ${wt2802Bookings.length} WT2802 bookings:`);
    wt2802Bookings.forEach(b => {
      console.log(`  - Date: ${b.class_instances.class_date}`);
      console.log(`    Enrollment ID: ${b.course_enrollment_id}`);
      console.log(`    Type: ${b.class_instances.class_type}`);
      console.log(`    Status: ${b.status}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkMitchellBookings();
