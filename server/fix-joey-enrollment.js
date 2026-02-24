require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixJoeyEnrollment() {
  const email = 'joey.lee2302@gmail.com';

  // Get customer
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('email', email)
    .single();

  console.log('\n=== FIXING JOEY LEE ENROLLMENT ===');
  console.log('Customer ID:', customer.id);

  // Check enrollment 5004
  const { data: enrollment } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('id', 5004)
    .single();

  console.log('\nEnrollment 5004:');
  console.log('  Status:', enrollment.status);
  console.log('  Course:', enrollment.course_title);
  console.log('  Start:', enrollment.course_start_date);
  console.log('  End:', enrollment.course_end_date);
  console.log('  Identifier:', enrollment.course_identifier);

  // Update to active
  const { error: updateError } = await supabase
    .from('course_enrollments')
    .update({ status: 'active' })
    .eq('id', 5004);

  if (updateError) {
    console.error('Error updating enrollment:', updateError);
  } else {
    console.log('\n✅ Updated enrollment 5004 to active');
  }

  // Check for Tuesday 7pm classes from Jan 20 to Mar 3
  console.log('\n=== CHECKING FOR TUESDAY 7PM CLASSES ===');
  const { data: tuesdayClasses } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2026-01-20')
    .lte('class_date', '2026-03-03')
    .eq('start_time', '7:00pm')
    .order('class_date', { ascending: true });

  console.log(`\nFound ${tuesdayClasses?.length || 0} Tuesday 7pm classes:`);
  tuesdayClasses?.forEach(c => {
    const date = new Date(c.class_date);
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
    console.log(`  ${c.class_date} (${dayOfWeek}) - ${c.class_type} - ${c.instructor}`);
  });

  // Check for bookings
  const { data: existingBookings } = await supabase
    .from('bookings')
    .select('*, class_instances!bookings_class_instance_id_fkey(class_date, class_type)')
    .eq('student_id', customer.id);

  console.log(`\n=== EXISTING BOOKINGS ===`);
  console.log(`Total: ${existingBookings?.length || 0}`);
  if (existingBookings && existingBookings.length > 0) {
    existingBookings.forEach(b => {
      console.log(`  Booking ID ${b.id}: ${b.class_instances?.class_date} - ${b.class_instances?.class_type} - Enrollment: ${b.course_enrollment_id}`);
    });
  }
}

fixJoeyEnrollment().then(() => process.exit());
