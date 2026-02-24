const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  // Find Peilin by last name
  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .ilike('last_name', '%liang%');

  const customer = customers.find(c => c.first_name && c.first_name.toLowerCase().includes('peilin'));

  if (!customer) {
    console.log('Customer not found');
    return;
  }

  console.log('Customer:', customer.first_name, customer.last_name);
  console.log('  ID:', customer.id);
  console.log('  Classes Allocated:', customer.classes_allocated);
  console.log('  Classes Used:', customer.classes_used);
  console.log('  Course Purchase Count:', customer.course_purchase_count);
  console.log('');

  // Get ALL enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', customer.id)
    .order('created_at', { ascending: false });

  console.log(`Found ${enrollments.length} enrollment(s):`);
  enrollments.forEach(e => {
    console.log(`  ID: ${e.id}, Course: ${e.course_identifier}, Status: ${e.status}, Weeks: ${e.number_of_weeks}`);
  });
  console.log('');

  // Get ALL bookings
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
    .eq('student_id', customer.id)
    .order('class_instance(class_date)', { ascending: true });

  console.log(`Found ${bookings.length} booking(s):`);

  let attendedCount = 0;
  let bookedCount = 0;

  bookings.forEach(b => {
    const status = b.status === 'attended' || b.attended === true ? 'attended' : b.status;
    if (status === 'attended') attendedCount++;
    if (status === 'booked') bookedCount++;

    console.log(`  ${b.class_instance.class_type} - ${b.class_instance.class_date.split('T')[0]} - ${status} (Enrollment: ${b.course_enrollment_id})`);
  });

  console.log('');
  console.log('Summary:');
  console.log('  Total Bookings:', bookings.length);
  console.log('  Attended:', attendedCount);
  console.log('  Booked (upcoming):', bookedCount);
  console.log('  Allocated:', customer.classes_allocated);
  console.log('  Remaining (should be):', customer.classes_allocated - attendedCount, '(but should be based on CURRENT course only!)');
}

run();
