const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  console.log('Fixing Joey Lee data...\n');

  const customerId = 2234;
  const enrollmentId = 4849;

  // Step 1: Update enrollment to set course_identifier
  console.log('Step 1: Setting course_identifier for enrollment...');
  const { error: enrollError } = await supabase
    .from('course_enrollments')
    .update({
      course_identifier: 'WT2001NT_JL6',
      course_title: 'Wheelthrowing Beginner/Ext 6 Weeks + 4 Flexible Classes',
      course_type: 'Wheelthrowing Beginner',
      number_of_weeks: 10,
      instructor: 'Joyce Lim'
    })
    .eq('id', enrollmentId);

  if (enrollError) {
    console.log('❌ Error:', enrollError);
    return;
  }
  console.log('✓ Updated enrollment\n');

  // Step 2: Get bookings for past classes (Jan 20 and Jan 27)
  console.log('Step 2: Marking past classes as attended...');
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      class_instance:class_instances!bookings_class_instance_id_fkey (
        class_date
      )
    `)
    .eq('student_id', customerId);

  const pastBookings = bookings.filter(b => {
    const classDate = new Date(b.class_instance.class_date);
    const now = new Date('2026-01-30');
    return classDate < now;
  });

  console.log(`Found ${pastBookings.length} past bookings to mark as attended`);

  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'attended',
      attended: true
    })
    .in('id', pastBookings.map(b => b.id));

  if (updateError) {
    console.log('❌ Error:', updateError);
    return;
  }
  console.log('✓ Marked bookings as attended\n');

  console.log('✅ Done! Joey Lee now has:');
  console.log('  - Enrollment: WT2001NT_JL6 (6 weeks WT + 4 flexible)');
  console.log('  - Total Classes Allocated: 10');
  console.log('  - Current WT Bookings: 6 (2 attended, 4 upcoming)');
  console.log('  - Remaining Flexible Classes: 4 (to be scheduled as WT makeup or HB)');
  console.log('\n📊 Student Management will show:');
  console.log('  - Allocated: 10');
  console.log('  - Attended: 2');
  console.log('  - Remaining: 8');
}

run();
