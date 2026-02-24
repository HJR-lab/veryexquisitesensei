const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  console.log('Enrolling Denise Wong in WT1701AM_DL6...\n');

  // Step 1: Find Denise Wong
  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .ilike('last_name', '%wong%');

  const customer = customers.find(c =>
    c.first_name && c.first_name.toLowerCase().includes('denise')
  );

  if (!customer) {
    console.log('❌ Denise Wong not found');
    return;
  }

  console.log('✓ Found customer:', customer.first_name, customer.last_name);
  console.log('  ID:', customer.id);
  console.log('  Email:', customer.email);
  console.log('  Course Purchase Count:', customer.course_purchase_count);
  console.log('');

  // Step 2: Check existing enrollments
  const { data: existingEnrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', customer.id)
    .order('created_at', { ascending: false });

  console.log(`Found ${existingEnrollments.length} existing enrollment(s):`);
  existingEnrollments.forEach(e => {
    console.log(`  ID: ${e.id}, Course: ${e.course_identifier}, Status: ${e.status}`);
  });
  console.log('');

  // Step 3: Find WT1701AM_DL6 classes (they have week numbers like WT1701AM_DL6.1, .2, etc.)
  const { data: classes } = await supabase
    .from('class_instances')
    .select('*')
    .like('class_type', 'WT1701AM_DL6.%')
    .order('class_date', { ascending: true });

  if (!classes || classes.length === 0) {
    console.log('❌ No classes found for WT1701AM_DL6');
    return;
  }

  console.log(`✓ Found ${classes.length} classes for WT1701AM_DL6:`);
  classes.forEach(c => {
    console.log(`  ${c.class_type} - ${c.class_date.split('T')[0]} ${c.start_time} - ${c.instructor}`);
  });
  console.log('');

  // Step 4: Create enrollment
  console.log('Creating enrollment...');
  const { data: enrollment, error: enrollError } = await supabase
    .from('course_enrollments')
    .insert({
      student_id: customer.id,
      course_identifier: 'WT1701AM_DL6',
      course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
      course_type: 'Wheelthrowing Beginner',
      number_of_weeks: 6,
      instructor: 'Dillon Lin',
      status: 'active',
      start_date: classes[0].class_date
    })
    .select()
    .single();

  if (enrollError) {
    console.log('❌ Error creating enrollment:', enrollError);
    return;
  }

  console.log('✓ Created enrollment ID:', enrollment.id);
  console.log('');

  // Step 5: Create bookings
  console.log('Creating bookings...');
  const bookings = classes.map(cls => ({
    student_id: customer.id,
    class_instance_id: cls.id,
    course_enrollment_id: enrollment.id,
    status: 'booked',
    booking_date: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  const { data: createdBookings, error: bookingError } = await supabase
    .from('bookings')
    .insert(bookings)
    .select();

  if (bookingError) {
    console.log('❌ Error creating bookings:', bookingError);
    return;
  }

  console.log(`✓ Created ${createdBookings.length} bookings`);
  console.log('');

  // Step 6: Update customer's course_purchase_count and classes_allocated
  const newCourseCount = (customer.course_purchase_count || 0) + 1;
  console.log('Updating customer record...');
  const { error: updateError } = await supabase
    .from('customers')
    .update({
      course_purchase_count: newCourseCount,
      classes_allocated: 6
    })
    .eq('id', customer.id);

  if (updateError) {
    console.log('❌ Error updating customer:', updateError);
    return;
  }

  console.log('✓ Updated course_purchase_count to', newCourseCount);
  console.log('');

  console.log('✅ Done! Denise Wong enrolled in WT1701AM_DL6');
  console.log(`  Enrollment ID: ${enrollment.id}`);
  console.log(`  Bookings: ${createdBookings.length} classes`);
  console.log(`  Course Purchase Count: ${newCourseCount}`);
}

run();
