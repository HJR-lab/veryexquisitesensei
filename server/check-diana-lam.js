const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  console.log('Checking Diana Lam...\n');

  // Find Diana Lam
  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .ilike('last_name', '%lam%');

  const customer = customers.find(c =>
    c.first_name && c.first_name.toLowerCase().includes('diana')
  );

  if (!customer) {
    console.log('❌ Diana Lam not found');
    return;
  }

  console.log('Customer:', customer.first_name, customer.last_name);
  console.log('  ID:', customer.id);
  console.log('  Email:', customer.email);
  console.log('  Shopify ID:', customer.shopify_customer_id);
  console.log('  Classes Allocated:', customer.classes_allocated);
  console.log('  Classes Used:', customer.classes_used);
  console.log('  Course Purchase Count:', customer.course_purchase_count);
  console.log('');

  // Get enrollments
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

  // Get bookings
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
  bookings.forEach(b => {
    const status = b.status === 'attended' || b.attended === true ? 'attended' : b.status;
    console.log(`  ${b.class_instance.class_type} - ${b.class_instance.class_date.split('T')[0]} - ${status} (Enrollment: ${b.course_enrollment_id})`);
  });

  console.log('\n📊 Summary:');
  console.log(`  Diana has ${customer.classes_allocated} credits allocated`);
  console.log(`  She has ${enrollments.length} enrollments`);
  console.log(`  She has ${bookings.length} bookings`);
  console.log(`  She needs to be assigned to a specific 6-week course`);
}

run();
