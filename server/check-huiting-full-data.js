const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  // Find Huiting
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .ilike('first_name', '%huiting%')
    .single();

  const customerId = customer.id;
  console.log('Customer ID:', customerId, '-', customer.first_name, customer.last_name);
  console.log('');

  // Get ALL enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', customerId);

  console.log(`Found ${enrollments.length} enrollment(s):`);
  enrollments.forEach(e => {
    console.log(`  ID: ${e.id}, Course: ${e.course_identifier}, Instructor: ${e.instructor}, Status: ${e.status}`);
  });
  console.log('');

  // Get ALL bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      *,
      class_instance:class_instances!bookings_class_instance_id_fkey (
        id,
        class_type,
        class_date,
        instructor
      )
    `)
    .eq('student_id', customerId)
    .order('class_instance(class_date)', { ascending: true });

  console.log(`Found ${bookings.length} booking(s):`);
  bookings.forEach(b => {
    console.log(`  Booking ID: ${b.id}`);
    console.log(`    Class: ${b.class_instance.class_type} on ${b.class_instance.class_date}`);
    console.log(`    Course Enrollment ID: ${b.course_enrollment_id || 'NONE (standalone)'}`);
    console.log(`    Status: ${b.status}, Attended: ${b.attended}`);
    console.log('');
  });
}

run();
