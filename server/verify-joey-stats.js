const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  const customerId = 2234;

  console.log('Verifying Joey Lee (ID: 2234) stats calculation...\n');

  // Get customer
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single();

  console.log('Customer Data:');
  console.log(`  Name: ${customer.first_name} ${customer.last_name}`);
  console.log(`  Classes Allocated: ${customer.classes_allocated}`);
  console.log('');

  // Get enrollment
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', customerId)
    .in('status', ['active', 'paused']);

  console.log(`Active/Paused Enrollments: ${enrollments.length}`);
  if (enrollments.length > 0) {
    enrollments.forEach(e => {
      console.log(`  Enrollment ID: ${e.id}, Course: ${e.course_identifier}, Status: ${e.status}`);
    });
  }
  console.log('');

  // Get ALL bookings (past and future)
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      *,
      class_instances!bookings_class_instance_id_fkey (
        class_date,
        class_type
      )
    `)
    .eq('student_id', customerId)
    .order('class_instances(class_date)');

  console.log(`Total Bookings: ${bookings.length}`);
  console.log('');

  // Calculate attended classes (the logic from the fixed API)
  const today = new Date('2026-01-30');
  today.setHours(0, 0, 0, 0);

  let attendedCount = 0;
  console.log('Booking Details:');
  bookings.forEach(b => {
    const classDate = new Date(b.class_instances.class_date);
    classDate.setHours(0, 0, 0, 0);
    const isPast = classDate < today;

    let isAttended = false;
    if (b.status === 'attended' || b.status === 'completed') {
      isAttended = true;
    } else if (b.status === 'booked' && isPast) {
      isAttended = true;
    }

    if (isAttended) attendedCount++;

    console.log(`  ${b.class_instances.class_date.split('T')[0]} - ${b.class_instances.class_type} - Status: ${b.status} - ${isPast ? 'PAST' : 'FUTURE'} - ${isAttended ? 'ATTENDED' : 'NOT YET'}`);
  });

  console.log('');
  console.log('='.repeat(60));
  console.log('CALCULATION:');
  console.log(`  Classes Allocated: ${customer.classes_allocated}`);
  console.log(`  Classes Attended: ${attendedCount}`);
  console.log(`  Classes Remaining: ${customer.classes_allocated - attendedCount}`);
  console.log('='.repeat(60));
  console.log('');
  console.log('Expected Result:');
  console.log('  Allocated: 10, Attended: 2, Remaining: 8');
  console.log(`  Actual: Allocated: ${customer.classes_allocated}, Attended: ${attendedCount}, Remaining: ${customer.classes_allocated - attendedCount}`);
  console.log('');
  console.log((customer.classes_allocated === 10 && attendedCount === 2) ? '✅ CORRECT' : '❌ INCORRECT');
}

run();
