const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  console.log('Restoring Huiting\'s makeup class booking...\n');

  // 1. Find Huiting's customer record
  const { data: customer, error: custError } = await supabase
    .from('customers')
    .select('*')
    .ilike('first_name', '%huiting%')
    .single();

  if (custError) {
    console.log('Error finding customer:', custError);
    return;
  }

  console.log('Found customer:', customer.first_name, customer.last_name);
  console.log('Customer data:', customer);

  const customerId = customer.db_customer_id || customer.id;
  console.log('Using customer ID:', customerId);

  // 2. Find all enrollments for this student to see what we have
  const { data: allEnrollments, error: allEnrollError } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', customerId);

  if (allEnrollError) {
    console.log('Error finding enrollments:', allEnrollError);
    return;
  }

  console.log('\nAll enrollments for Huiting:');
  allEnrollments.forEach(e => {
    console.log(`  - ID: ${e.id}, Course: ${e.course_identifier}, Instructor: ${e.instructor_name}`);
  });

  // Find the enrollment (should be ID 5047 based on server logs)
  const enrollment = allEnrollments.find(e => e.id === 5047 || e.course_identifier?.includes('WT2201NT_JL6'));

  if (!enrollment) {
    console.log('\nError: Could not find WT2201NT_JL6 enrollment');
    return;
  }

  console.log('\nUsing enrollment:', enrollment.id, '-', enrollment.course_identifier);

  // 3. Find the makeup class instance (WT2001NT_JL6.2 on Jan 27)
  const { data: makeupClass, error: classError } = await supabase
    .from('class_instances')
    .select('*')
    .eq('class_type', 'WT2001NT_JL6.2')
    .eq('class_date', '2026-01-27')
    .single();

  if (classError) {
    console.log('Error finding makeup class:', classError);
    return;
  }

  console.log('Found makeup class:', makeupClass.id, '-', makeupClass.class_type, 'on', makeupClass.class_date);

  // 4. Create the makeup booking linked to the course enrollment
  const now = new Date().toISOString();
  const { data: newBooking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      student_id: customerId,
      class_instance_id: makeupClass.id,
      course_enrollment_id: enrollment.id,  // Link to course enrollment
      booking_date: now,
      status: 'booked',
      booking_type: 'makeup',
      is_makeup_class: true,
      advance_notice_given: false,
      created_at: now,
      updated_at: now
    })
    .select()
    .single();

  if (bookingError) {
    console.log('Error creating booking:', bookingError);
    return;
  }

  console.log('\n✅ Successfully created makeup booking:', newBooking.id);
  console.log('   - Linked to course enrollment:', enrollment.course_identifier);
  console.log('   - Class:', makeupClass.class_type, 'on', makeupClass.class_date);
  console.log('\nThe makeup class will now appear as part of the WT2201NT_JL6 course, not as a separate N/A entry.');
}

run();
