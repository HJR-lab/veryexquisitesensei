require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createBookings() {
  console.log('📚 Creating bookings for Jessie and Sabrina...\n');

  // Jessie's booking data
  const jessieEnrollmentId = 4850;
  const jessieStudentId = 1240;
  const jessieClassIds = [13279, 13280, 13281, 13282, 13283, 13284];

  // Sabrina's booking data
  const sabrinaEnrollmentId = 4851;
  const sabrinaStudentId = 2249;
  const sabrinaClassIds = [13273, 13274, 13275, 13276, 13277, 13278];

  // Create Jessie's bookings
  console.log('Creating bookings for Jessie (enrollment 4850, student 1240)...');
  const jessieBookings = jessieClassIds.map(classId => ({
    course_enrollment_id: jessieEnrollmentId,
    class_instance_id: classId,
    student_id: jessieStudentId,
    booking_date: new Date().toISOString().split('T')[0],
    status: 'booked',
    booking_type: 'regular',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  const { data: jessieCreated, error: jessieError } = await supabase
    .from('bookings')
    .insert(jessieBookings)
    .select();

  if (jessieError) {
    console.error('❌ Error creating Jessie bookings:', jessieError);
  } else {
    console.log(`✅ Created ${jessieCreated.length} bookings for Jessie`);
  }

  // Create Sabrina's bookings
  console.log('\nCreating bookings for Sabrina (enrollment 4851, student 2249)...');
  const sabrinaBookings = sabrinaClassIds.map(classId => ({
    course_enrollment_id: sabrinaEnrollmentId,
    class_instance_id: classId,
    student_id: sabrinaStudentId,
    booking_date: new Date().toISOString().split('T')[0],
    status: 'booked',
    booking_type: 'regular',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  const { data: sabrinaCreated, error: sabrinaError } = await supabase
    .from('bookings')
    .insert(sabrinaBookings)
    .select();

  if (sabrinaError) {
    console.error('❌ Error creating Sabrina bookings:', sabrinaError);
  } else {
    console.log(`✅ Created ${sabrinaCreated.length} bookings for Sabrina`);
  }

  // Update enrollments with bookings_created_at and course_identifier
  console.log('\nUpdating enrollment records...');
  const now = new Date().toISOString();

  const { error: jessieUpdateError } = await supabase
    .from('course_enrollments')
    .update({
      bookings_created_at: now,
      course_identifier: 'WT2301AM_JL6',
      updated_at: now
    })
    .eq('id', jessieEnrollmentId);

  if (jessieUpdateError) {
    console.error('❌ Error updating Jessie enrollment:', jessieUpdateError);
  } else {
    console.log('✅ Updated Jessie enrollment (WT2301AM_JL6)');
  }

  const { error: sabrinaUpdateError } = await supabase
    .from('course_enrollments')
    .update({
      bookings_created_at: now,
      course_identifier: 'WT2201NT_JL6',
      updated_at: now
    })
    .eq('id', sabrinaEnrollmentId);

  if (sabrinaUpdateError) {
    console.error('❌ Error updating Sabrina enrollment:', sabrinaUpdateError);
  } else {
    console.log('✅ Updated Sabrina enrollment (WT2201NT_JL6)');
  }

  // Check final counts
  console.log('\n=== Final Status ===\n');

  const { data: jessieBookingsCount } = await supabase
    .from('bookings')
    .select('id')
    .eq('student_id', jessieStudentId);

  console.log(`Jessie Ong (ID: 1240): ${jessieBookingsCount?.length || 0} total bookings`);

  const { data: sabrinaBookingsCount } = await supabase
    .from('bookings')
    .select('id')
    .eq('student_id', sabrinaStudentId);

  console.log(`Sabrina Ang (ID: 2249): ${sabrinaBookingsCount?.length || 0} total bookings`);

  // Verify enrollments
  const { data: jessieEnrollment } = await supabase
    .from('course_enrollments')
    .select('course_identifier, bookings_created_at')
    .eq('id', jessieEnrollmentId)
    .single();

  console.log(`\nJessie enrollment: course_identifier=${jessieEnrollment?.course_identifier}, bookings_created=${jessieEnrollment?.bookings_created_at ? 'YES' : 'NO'}`);

  const { data: sabrinaEnrollment } = await supabase
    .from('course_enrollments')
    .select('course_identifier, bookings_created_at')
    .eq('id', sabrinaEnrollmentId)
    .single();

  console.log(`Sabrina enrollment: course_identifier=${sabrinaEnrollment?.course_identifier}, bookings_created=${sabrinaEnrollment?.bookings_created_at ? 'YES' : 'NO'}`);
}

createBookings()
  .then(() => {
    console.log('\n✅ Done! Jessie and Sabrina should now appear as active students.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
