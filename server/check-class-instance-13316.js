const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  // Check if class instance 13316 exists
  const { data: classInstance, error: classError } = await supabase
    .from('class_instances')
    .select('*')
    .eq('id', 13316)
    .single();

  if (classError) {
    console.log('Error finding class instance 13316:', classError);
    console.log('This class instance might not exist!');
    return;
  }

  console.log('Class Instance 13316:');
  console.log(JSON.stringify(classInstance, null, 2));
  console.log('');

  // Now check the bookings query that the API uses
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      attended,
      booking_date,
      course_enrollment_id,
      class_instance:class_instances!bookings_class_instance_id_fkey (
        id,
        class_date,
        start_time,
        end_time,
        class_type,
        instructor,
        room
      )
    `)
    .eq('student_id', 1137)
    .order('id', { ascending: true });

  if (bookingsError) {
    console.log('Error fetching bookings:', bookingsError);
    return;
  }

  console.log(`\nFound ${bookings.length} bookings with join:`);
  bookings.forEach(b => {
    console.log(`Booking ID: ${b.id}, Enrollment: ${b.course_enrollment_id}, Class Instance: ${b.class_instance ? b.class_instance.class_type : 'NULL'}`);
  });
}

run();
