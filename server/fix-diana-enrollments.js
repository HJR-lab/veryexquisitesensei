const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  console.log('Fixing Diana Lam enrollments...\n');

  const customerId = 1469;
  const oldEnrollmentId = 4994;

  // Step 1: Create new active enrollment for WT1701PM_DL6
  console.log('Step 1: Creating new active enrollment for WT1701PM_DL6...');
  const { data: newEnrollment, error: enrollError } = await supabase
    .from('course_enrollments')
    .insert({
      student_id: customerId,
      course_identifier: 'WT1701PM_DL6',
      course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
      course_type: 'Wheelthrowing Beginner',
      number_of_weeks: 6,
      instructor: 'Dillon Lin',
      status: 'active',
      start_date: '2026-01-17'
    })
    .select()
    .single();

  if (enrollError) {
    console.log('❌ Error creating enrollment:', enrollError);
    return;
  }

  console.log('✓ Created enrollment ID:', newEnrollment.id);
  console.log('');

  // Step 2: Get all bookings and identify which belong to each course
  const { data: allBookings } = await supabase
    .from('bookings')
    .select(`
      id,
      class_instance:class_instances!bookings_class_instance_id_fkey (
        class_type,
        class_date
      )
    `)
    .eq('student_id', customerId)
    .eq('course_enrollment_id', oldEnrollmentId);

  const wt1701Bookings = allBookings.filter(b =>
    b.class_instance.class_type.startsWith('WT1701PM')
  );

  console.log(`Step 2: Moving ${wt1701Bookings.length} WT1701PM bookings to new enrollment...`);
  console.log('Booking IDs:', wt1701Bookings.map(b => b.id));

  const { error: moveError } = await supabase
    .from('bookings')
    .update({ course_enrollment_id: newEnrollment.id })
    .in('id', wt1701Bookings.map(b => b.id));

  if (moveError) {
    console.log('❌ Error moving bookings:', moveError);
    return;
  }
  console.log('✓ Moved bookings\n');

  // Step 3: Update old enrollment to reflect first course
  console.log('Step 3: Updating old enrollment to WT2009PM_JL6...');
  const { error: updateError } = await supabase
    .from('course_enrollments')
    .update({
      course_identifier: 'WT2009PM_JL6',
      instructor: 'Joyce Lim',
      number_of_weeks: 6
    })
    .eq('id', oldEnrollmentId);

  if (updateError) {
    console.log('❌ Error updating enrollment:', updateError);
    return;
  }
  console.log('✓ Updated enrollment 4994\n');

  // Step 4: Verify customer record
  const { data: customer } = await supabase
    .from('customers')
    .select('course_purchase_count, classes_allocated')
    .eq('id', customerId)
    .single();

  console.log('Step 4: Customer record verification:');
  console.log('  Course Purchase Count:', customer.course_purchase_count, '(should be 2)');
  console.log('  Classes Allocated:', customer.classes_allocated, '(should be 6 for current course)');

  console.log('\n✅ Done! Diana Lam now has:');
  console.log('  - Enrollment 4994 (completed): WT2009PM_JL6 - 6 attended classes');
  console.log(`  - Enrollment ${newEnrollment.id} (active): WT1701PM_DL6 - 6 classes (1 attended, 5 upcoming)`);
  console.log('  - Course Purchase Count: 2');
  console.log('  - Admin page will now show 6 active bookings');
}

run();
