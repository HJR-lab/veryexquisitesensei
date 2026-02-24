const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  console.log('Fixing Peilin Liang enrollments...\n');

  const customerId = 1166;
  const oldEnrollmentId = 4924;
  const newEnrollmentId = 4812;

  // Step 1: Update enrollment 4812 to have the correct course identifier
  console.log('Step 1: Setting course_identifier for enrollment 4812...');
  const { error: updateEnrollmentError } = await supabase
    .from('course_enrollments')
    .update({
      course_identifier: 'WT2201NT_JL6',
      instructor: 'Joyce Lim',
      course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
      course_type: 'Wheelthrowing Beginner',
      number_of_weeks: 6
    })
    .eq('id', newEnrollmentId);

  if (updateEnrollmentError) {
    console.log('Error:', updateEnrollmentError);
    return;
  }
  console.log('✓ Updated enrollment 4812\n');

  // Step 2: Move the 5 WT2201NT_JL6 bookings from enrollment 4924 to 4812
  console.log('Step 2: Moving WT2201NT_JL6 bookings to enrollment 4812...');

  // Get all bookings for WT2201NT_JL6
  const { data: wt2201Bookings } = await supabase
    .from('bookings')
    .select('id, class_instances!bookings_class_instance_id_fkey(class_type)')
    .eq('student_id', customerId)
    .eq('course_enrollment_id', oldEnrollmentId);

  const bookingsToMove = wt2201Bookings.filter(b =>
    b.class_instances && b.class_instances.class_type && b.class_instances.class_type.startsWith('WT2201NT')
  );

  console.log(`Found ${bookingsToMove.length} bookings to move:`, bookingsToMove.map(b => b.id));

  const { error: moveBookingsError } = await supabase
    .from('bookings')
    .update({ course_enrollment_id: newEnrollmentId })
    .in('id', bookingsToMove.map(b => b.id));

  if (moveBookingsError) {
    console.log('Error:', moveBookingsError);
    return;
  }
  console.log('✓ Moved bookings\n');

  // Step 3: Update enrollment 4924 to set course_identifier for the old course
  console.log('Step 3: Setting course_identifier for enrollment 4924...');
  const { error: updateOldEnrollmentError } = await supabase
    .from('course_enrollments')
    .update({
      course_identifier: 'WT1610NT_JL6'
    })
    .eq('id', oldEnrollmentId);

  if (updateOldEnrollmentError) {
    console.log('Error:', updateOldEnrollmentError);
    return;
  }
  console.log('✓ Updated enrollment 4924\n');

  // Step 4: Update customer's course_purchase_count
  console.log('Step 4: Updating course_purchase_count...');
  const { error: updateCustomerError } = await supabase
    .from('customers')
    .update({
      course_purchase_count: 2,
      classes_allocated: 6  // Current course allocation
    })
    .eq('id', customerId);

  if (updateCustomerError) {
    console.log('Error:', updateCustomerError);
    return;
  }
  console.log('✓ Updated customer\n');

  console.log('✅ Done! Peilin now has:');
  console.log('  - Enrollment 4924 (completed): 6 bookings for WT1610NT_JL6');
  console.log('  - Enrollment 4812 (active): 5 bookings for WT2201NT_JL6');
  console.log('  - Courses Purchased: 2');
  console.log('  - Current Course Remaining: 5 classes');
}

run();
