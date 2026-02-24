require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkAprilBookings() {
  console.log('=== CHECKING APRIL BOOKINGS ===\n');

  // Find April's customer ID
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .ilike('email', '%april%')
    .single();

  if (!customer) {
    console.log('April not found');
    return;
  }

  console.log(`Found: ${customer.first_name} ${customer.last_name} (ID: ${customer.id})`);
  console.log(`Email: ${customer.email}\n`);

  // Get all bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      attended,
      booking_type,
      class_instance:class_instances!bookings_class_instance_id_fkey (
        id,
        class_date,
        class_type,
        start_time,
        end_time,
        instructor
      )
    `)
    .eq('student_id', customer.id)
    .order('class_instance(class_date)');

  console.log(`Total bookings: ${bookings?.length || 0}\n`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  bookings?.forEach((b, i) => {
    const classDate = new Date(b.class_instance.class_date);
    classDate.setHours(0, 0, 0, 0);
    const isPast = classDate < today;
    const statusIcon = isPast ? '❌ PAST' : '✅ FUTURE';

    console.log(`${i + 1}. ${statusIcon} ${b.class_instance.class_date.split('T')[0]}`);
    console.log(`   Class: ${b.class_instance.class_type}`);
    console.log(`   Time: ${b.class_instance.start_time} - ${b.class_instance.end_time}`);
    console.log(`   Status: ${b.status}`);
    console.log(`   Attended: ${b.attended}`);
    console.log(`   Booking Type: ${b.booking_type}`);
    console.log('');
  });

  // Check enrollment
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', customer.id);

  console.log(`\nEnrollments: ${enrollments?.length || 0}`);
  enrollments?.forEach(e => {
    console.log(`  ${e.course_type} - ${e.schedule_pattern} starting ${e.course_start_date}`);
    console.log(`  Classes allocated: ${e.classes_allocated}`);
    console.log(`  Bookings created: ${e.bookings_created_at ? 'YES' : 'NO'}`);
  });
}

checkAprilBookings().then(() => process.exit());
