require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createMissingBookings() {
  console.log('🔍 Finding students...\n');

  // Find Jessie
  const { data: jessie, error: jessieError } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email')
    .eq('email', 'jessieong326@yahoo.com')
    .single();

  if (jessieError) {
    console.error('Error finding Jessie:', jessieError);
    return;
  }

  console.log(`Found Jessie: ${jessie.first_name} ${jessie.last_name} (ID: ${jessie.id})\n`);

  // Find Sabrina
  const { data: sabrina, error: sabrinaError } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email')
    .eq('email', 'oh-so-sweet@hotmail.sg')
    .single();

  if (sabrinaError) {
    console.error('Error finding Sabrina:', sabrinaError);
    return;
  }

  console.log(`Found Sabrina: ${sabrina.first_name} ${sabrina.last_name} (ID: ${sabrina.id})\n`);

  // Find Jessie's enrollments
  const { data: jessieEnrollments, error: jessieEnrollError } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', jessie.id)
    .in('course_identifier', ['WT2301AM_JL6', 'WT1010AM_JL6'])
    .order('created_at', { ascending: false });

  if (jessieEnrollError) {
    console.error('Error finding Jessie enrollments:', jessieEnrollError);
  } else {
    console.log(`Found ${jessieEnrollments?.length || 0} enrollments for Jessie:`);
    jessieEnrollments?.forEach(e => {
      console.log(`  - ${e.course_identifier} (Order: ${e.shopify_order_id}, Status: ${e.status}, Start: ${e.course_start_date})`);
    });
  }
  console.log('');

  // Find Sabrina's enrollment
  const { data: sabrinaEnrollments, error: sabrinaEnrollError } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', sabrina.id)
    .eq('course_identifier', 'WT2201NT_JL6')
    .order('created_at', { ascending: false });

  if (sabrinaEnrollError) {
    console.error('Error finding Sabrina enrollments:', sabrinaEnrollError);
  } else {
    console.log(`Found ${sabrinaEnrollments?.length || 0} enrollments for Sabrina:`);
    sabrinaEnrollments?.forEach(e => {
      console.log(`  - ${e.course_identifier} (Order: ${e.shopify_order_id}, Status: ${e.status}, Start: ${e.course_start_date})`);
    });
  }
  console.log('');

  // Combine all enrollments that need bookings
  const enrollmentsNeedingBookings = [
    ...(jessieEnrollments || []),
    ...(sabrinaEnrollments || [])
  ];

  if (enrollmentsNeedingBookings.length === 0) {
    console.log('❌ No enrollments found. Searching for any enrollments for these students...\n');

    // Show all Jessie's enrollments
    const { data: allJessieEnrollments } = await supabase
      .from('course_enrollments')
      .select('course_identifier, shopify_order_id, status, course_start_date')
      .eq('student_id', jessie.id)
      .order('created_at', { ascending: false })
      .limit(10);

    console.log('All recent Jessie enrollments:');
    allJessieEnrollments?.forEach(e => {
      console.log(`  - ${e.course_identifier} (Order: ${e.shopify_order_id}, Status: ${e.status})`);
    });

    // Show all Sabrina's enrollments
    const { data: allSabrinaEnrollments } = await supabase
      .from('course_enrollments')
      .select('course_identifier, shopify_order_id, status, course_start_date')
      .eq('student_id', sabrina.id)
      .order('created_at', { ascending: false })
      .limit(10);

    console.log('\nAll recent Sabrina enrollments:');
    allSabrinaEnrollments?.forEach(e => {
      console.log(`  - ${e.course_identifier} (Order: ${e.shopify_order_id}, Status: ${e.status})`);
    });

    return;
  }

  console.log(`\n📋 Processing ${enrollmentsNeedingBookings.length} enrollments...\n`);

  for (const enrollment of enrollmentsNeedingBookings) {
    console.log(`\n--- Processing ${enrollment.course_identifier} ---`);
    console.log(`Enrollment ID: ${enrollment.id}`);
    console.log(`Student ID: ${enrollment.student_id}`);
    console.log(`Start Date: ${enrollment.course_start_date}`);
    console.log(`Schedule: ${enrollment.schedule_pattern} ${enrollment.class_time}`);

    // Check if bookings already exist
    const { data: existingBookings, error: bookingsError } = await supabase
      .from('class_bookings')
      .select('id, class_instance_id')
      .eq('enrollment_id', enrollment.id);

    if (bookingsError) {
      console.error('  ❌ Error checking existing bookings:', bookingsError);
      continue;
    }

    if (existingBookings && existingBookings.length > 0) {
      console.log(`  ✅ Already has ${existingBookings.length} bookings - skipping`);
      continue;
    }

    console.log('  ⚠️  No bookings found for this enrollment');

    // Find class instances for this cohort
    const { data: classes, error: classesError } = await supabase
      .from('class_instances')
      .select('id, class_date, class_type, instructor')
      .eq('course_identifier', enrollment.course_identifier)
      .gte('class_date', enrollment.course_start_date)
      .order('class_date', { ascending: true })
      .limit(6);

    if (classesError) {
      console.error('  ❌ Error finding classes:', classesError);
      continue;
    }

    if (!classes || classes.length === 0) {
      console.log(`  ⚠️  No classes found for cohort ${enrollment.course_identifier}`);
      console.log('  This cohort needs classes to be created first');
      continue;
    }

    console.log(`  Found ${classes.length} classes for this cohort:`);
    classes.forEach(c => {
      console.log(`    - ${c.class_date} (${c.class_type}, ${c.instructor})`);
    });

    if (classes.length < 6) {
      console.log(`  ⚠️  Warning: Only ${classes.length} classes found, expected 6`);
    }

    // Create bookings for each class
    console.log('  📝 Creating bookings...');
    const bookingsToCreate = classes.map(classInstance => ({
      enrollment_id: enrollment.id,
      class_instance_id: classInstance.id,
      student_id: enrollment.student_id,
      booking_date: new Date().toISOString().split('T')[0],
      status: 'confirmed',
      created_at: new Date().toISOString()
    }));

    const { data: createdBookings, error: createError } = await supabase
      .from('class_bookings')
      .insert(bookingsToCreate)
      .select();

    if (createError) {
      console.error('  ❌ Error creating bookings:', createError);
      continue;
    }

    console.log(`  ✅ Created ${createdBookings.length} bookings successfully!`);
  }

  console.log('\n\n📊 Final Summary:');

  // Check Jessie's total bookings
  const { data: jessieBookings } = await supabase
    .from('class_bookings')
    .select('id')
    .eq('student_id', jessie.id);

  console.log(`\nJessie Ong: ${jessieBookings?.length || 0} total bookings`);

  // Check Sabrina's total bookings
  const { data: sabrinaBookings } = await supabase
    .from('class_bookings')
    .select('id')
    .eq('student_id', sabrina.id);

  console.log(`Sabrina Ang: ${sabrinaBookings?.length || 0} total bookings`);
}

createMissingBookings()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
