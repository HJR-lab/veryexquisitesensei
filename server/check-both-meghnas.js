require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkBothMeghnas() {
  const meghnaIds = [1198, 1226];

  for (const meghnaId of meghnaIds) {
    console.log(`\n========== Checking Meghna ID ${meghnaId} ==========\n`);

    // Get customer info
    const { data: customer } = await supabase
      .from('customers')
      .select('first_name, last_name, email')
      .eq('id', meghnaId)
      .single();

    console.log(`${customer.first_name} ${customer.last_name} - ${customer.email}`);

    // Get enrollments
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', meghnaId)
      .order('created_at', { ascending: false });

    console.log(`\nEnrollments: ${enrollments.length}`);
    enrollments.forEach(e => {
      console.log(`  - ID: ${e.id}, Status: ${e.status}, Title: ${e.course_title}`);
    });

    // Get bookings
    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        id,
        status,
        course_enrollment_id,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date
        )
      `)
      .eq('student_id', meghnaId)
      .in('status', ['booked', 'attended'])
      .order('class_instances(class_date)', { ascending: true });

    console.log(`\nBookings: ${bookings.length}`);
    if (bookings.length > 0) {
      const groupedByEnrollment = {};
      bookings.forEach(b => {
        const enrollmentId = b.course_enrollment_id;
        if (!groupedByEnrollment[enrollmentId]) {
          groupedByEnrollment[enrollmentId] = [];
        }
        groupedByEnrollment[enrollmentId].push(b);
      });

      Object.entries(groupedByEnrollment).forEach(([enrollmentId, bookingList]) => {
        const enrollment = enrollments.find(e => e.id === parseInt(enrollmentId));
        console.log(`\n  Enrollment ${enrollmentId} (${enrollment?.status}): ${bookingList.length} bookings`);
        bookingList.slice(0, 3).forEach(b => {
          console.log(`    - ${b.class_instances.class_date}: ${b.class_instances.class_type} (${b.status})`);
        });
        if (bookingList.length > 3) {
          console.log(`    ... and ${bookingList.length - 3} more`);
        }
      });
    }
  }
}

checkBothMeghnas().then(() => process.exit());
