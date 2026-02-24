const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  console.log('Checking Joey data...\n');

  // Find Joey
  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .ilike('first_name', '%joey%');

  const customer = customers[0];

  if (!customer) {
    console.log('❌ Joey not found');
    return;
  }

  console.log('Customer:', customer.first_name, customer.last_name);
  console.log('  ID:', customer.id);
  console.log('  Classes Allocated:', customer.classes_allocated);
  console.log('  Classes Used:', customer.classes_used);
  console.log('  Course Purchase Count:', customer.course_purchase_count);
  console.log('');

  // Get active enrollment
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

  // Get all bookings
  const { data: allBookings } = await supabase
    .from('bookings')
    .select(`
      *,
      class_instance:class_instances!bookings_class_instance_id_fkey (
        class_type,
        class_date,
        instructor
      ),
      course_enrollment:course_enrollments!bookings_course_enrollment_id_fkey (
        status
      )
    `)
    .eq('student_id', customer.id)
    .order('class_instance(class_date)', { ascending: true });

  console.log(`Total bookings in database: ${allBookings.length}`);

  // Filter to only active/paused enrollments
  const activeBookings = allBookings.filter(booking => {
    if (!booking.course_enrollment) return true;
    return ['active', 'paused'].includes(booking.course_enrollment.status);
  });

  console.log(`Active/paused enrollment bookings: ${activeBookings.length}\n`);

  console.log('Active bookings breakdown:');
  let attendedCount = 0;
  let bookedCount = 0;

  activeBookings.forEach(b => {
    const status = b.status === 'attended' || b.attended === true ? 'attended' : b.status;
    if (status === 'attended') attendedCount++;
    if (status === 'booked') bookedCount++;

    const classDate = b.class_instance.class_date.split('T')[0];
    const isUpcoming = new Date(b.class_instance.class_date) >= new Date();

    console.log(`  ${b.class_instance.class_type} - ${classDate} - ${status} - ${isUpcoming ? 'UPCOMING' : 'PAST'} (Enrollment: ${b.course_enrollment_id})`);
  });

  console.log('\n📊 Summary for Student Management page:');
  console.log(`  Classes Allocated: ${customer.classes_allocated}`);
  console.log(`  Attended: ${attendedCount}`);
  console.log(`  Booked (upcoming): ${bookedCount}`);
  console.log(`  Total Active Bookings: ${activeBookings.length}`);
  console.log(`  Remaining: ${activeBookings.length - attendedCount} (should be ${customer.classes_allocated - attendedCount})`);

  console.log('\n Expected values:');
  console.log(`  Total: 10`);
  console.log(`  Attended: 2`);
  console.log(`  Remaining: 8`);
}

run();
