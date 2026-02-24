const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  console.log('Fixing Denise Wong enrollment...\n');

  const customerId = 1147;
  const oldEnrollmentId = 4915; // Old enrollment with wrong course_identifier
  const newEnrollmentId = 5049; // New active enrollment with correct course_identifier

  // Step 1: Move all bookings from old enrollment to new enrollment
  console.log('Step 1: Moving bookings to new enrollment...');
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id')
    .eq('student_id', customerId)
    .eq('course_enrollment_id', oldEnrollmentId);

  console.log(`Found ${bookings.length} bookings to move`);

  const { error: moveError } = await supabase
    .from('bookings')
    .update({ course_enrollment_id: newEnrollmentId })
    .eq('student_id', customerId)
    .eq('course_enrollment_id', oldEnrollmentId);

  if (moveError) {
    console.log('❌ Error moving bookings:', moveError);
    return;
  }
  console.log('✓ Moved all bookings to enrollment 5049\n');

  // Step 2: Update old enrollment status to cancelled (representing the HB order she cancelled)
  console.log('Step 2: Updating old enrollment status...');
  const { error: updateError } = await supabase
    .from('course_enrollments')
    .update({ status: 'cancelled' })
    .eq('id', oldEnrollmentId);

  if (updateError) {
    console.log('❌ Error updating enrollment:', updateError);
    return;
  }
  console.log('✓ Updated enrollment 4915 to cancelled\n');

  // Step 3: Update customer's course_purchase_count
  console.log('Step 3: Updating customer record...');
  const { error: customerError } = await supabase
    .from('customers')
    .update({
      course_purchase_count: 1,
      classes_allocated: 6
    })
    .eq('id', customerId);

  if (customerError) {
    console.log('❌ Error updating customer:', customerError);
    return;
  }
  console.log('✓ Updated customer\n');

  console.log('✅ Done! Denise Wong now has:');
  console.log('  - Enrollment 4915 (cancelled): Old HB order');
  console.log('  - Enrollment 5049 (active): WT1701AM_DL6 with 6 bookings');
  console.log('  - Course Purchase Count: 1');
}

run();
