require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixJoeyCorrect() {
  const email = 'joey.lee2302@gmail.com';

  console.log('\n=== FIXING JOEY LEE - 10 CLASSES ===\n');

  // Get customer
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('email', email)
    .single();

  console.log('Customer ID:', customer.id);

  // Step 1: Update the 6 bookings to link to enrollment 4849 instead of 5004
  console.log('\nStep 1: Moving 6 bookings from enrollment 5004 to 4849...');
  const { error: updateError } = await supabase
    .from('bookings')
    .update({ course_enrollment_id: 4849 })
    .eq('student_id', customer.id)
    .eq('course_enrollment_id', 5004);

  if (updateError) {
    console.error('Error updating bookings:', updateError);
  } else {
    console.log('✅ Updated 6 bookings to enrollment 4849');
  }

  // Step 2: Delete enrollment 5004
  console.log('\nStep 2: Deleting enrollment 5004...');
  const { error: deleteError } = await supabase
    .from('course_enrollments')
    .delete()
    .eq('id', 5004);

  if (deleteError) {
    console.error('Error deleting enrollment:', deleteError);
  } else {
    console.log('✅ Deleted enrollment 5004');
  }

  // Step 3: Update enrollment 4849 to active
  console.log('\nStep 3: Setting enrollment 4849 to active...');
  const { error: activeError } = await supabase
    .from('course_enrollments')
    .update({
      status: 'active',
      course_start_date: '2026-01-20',
      course_end_date: '2026-03-03'
    })
    .eq('id', 4849);

  if (activeError) {
    console.error('Error updating enrollment:', activeError);
  } else {
    console.log('✅ Set enrollment 4849 to active');
  }

  // Verify
  console.log('\n=== VERIFICATION ===');

  const { data: enrollment } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('id', 4849)
    .single();

  console.log('\nEnrollment 4849:');
  console.log('  Status:', enrollment.status);
  console.log('  Course:', enrollment.course_title);
  console.log('  Start:', enrollment.course_start_date);
  console.log('  End:', enrollment.course_end_date);

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, course_enrollment_id')
    .eq('student_id', customer.id);

  console.log('\nBookings:');
  console.log('  Total:', bookings.length);
  console.log('  Linked to 4849:', bookings.filter(b => b.course_enrollment_id === 4849).length);

  console.log('\n✅ Joey should now show:');
  console.log('   Total: 10 classes');
  console.log('   Booked: 6 classes');
  console.log('   Attended: 0');
  console.log('   Remaining: 4 classes');
}

fixJoeyCorrect().then(() => process.exit());
