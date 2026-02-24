const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  const customerId = 2234;
  
  console.log('Checking Joey Lee (ID: 2234)...\n');

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single();

  console.log('Customer:', customer.first_name, customer.last_name);
  console.log('  Classes Allocated:', customer.classes_allocated);
  console.log('  Classes Used:', customer.classes_used);
  console.log('');

  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', customerId);

  console.log(`Enrollments (${enrollments.length}):`);
  enrollments.forEach(e => {
    console.log(`  ID: ${e.id}, Course: ${e.course_identifier}, Status: ${e.status}`);
  });
  console.log('');

  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      *,
      class_instance:class_instances!bookings_class_instance_id_fkey (
        class_type,
        class_date
      ),
      course_enrollment:course_enrollments!bookings_course_enrollment_id_fkey (
        status
      )
    `)
    .eq('student_id', customerId)
    .order('class_instance(class_date)');

  console.log(`Bookings (${bookings.length}):`);
  let attended = 0;
  bookings.forEach(b => {
    const status = b.status === 'attended' || b.attended === true ? 'attended' : b.status;
    if (status === 'attended') attended++;
    console.log(`  ${b.class_instance.class_type} - ${b.class_instance.class_date.split('T')[0]} - ${status} - Enroll: ${b.course_enrollment_id} (${b.course_enrollment?.status || 'N/A'})`);
  });

  console.log('\nSummary:');
  console.log(`  Total Bookings: ${bookings.length}`);
  console.log(`  Attended: ${attended}`);
  console.log(`  Remaining: ${bookings.length - attended}`);
  console.log('\nExpected: Total 10, Attended 2, Remaining 8');
}

run();
