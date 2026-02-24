const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  console.log('Checking Denise Wong bookings...\n');

  const customerId = 1147;

  // Get all enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', customerId)
    .order('created_at', { ascending: false });

  console.log(`Found ${enrollments.length} enrollment(s):`);
  enrollments.forEach(e => {
    console.log(`  ID: ${e.id}, Course: ${e.course_identifier}, Status: ${e.status}`);
  });
  console.log('');

  // Get all bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      *,
      class_instance:class_instances!bookings_class_instance_id_fkey (
        class_type,
        class_date,
        instructor
      )
    `)
    .eq('student_id', customerId)
    .order('class_instance(class_date)', { ascending: true });

  console.log(`Found ${bookings.length} booking(s):`);
  bookings.forEach(b => {
    console.log(`  ${b.class_instance.class_type} - ${b.class_instance.class_date.split('T')[0]} - ${b.status} - Enrollment: ${b.course_enrollment_id}`);
  });
}

run();
