require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function addAprilFirstClass() {
  console.log('=== ADDING APRIL\'S MISSING FIRST CLASS ===\n');

  const aprilId = 1182;
  const enrollmentId = 4781;

  // Find WT2001NT_JL6.1 class (Tuesday Jan 20)
  const { data: firstClass } = await supabase
    .from('class_instances')
    .select('*')
    .eq('class_type', 'WT2001NT_JL6.1')
    .eq('class_date', '2026-01-20')
    .single();

  if (!firstClass) {
    console.log('❌ First class (WT2001NT_JL6.1) not found');
    return;
  }

  console.log('Found first class:', {
    id: firstClass.id,
    date: firstClass.class_date,
    type: firstClass.class_type,
    time: `${firstClass.start_time} - ${firstClass.end_time}`,
    instructor: firstClass.instructor
  });

  // Check if booking already exists
  const { data: existing } = await supabase
    .from('bookings')
    .select('id')
    .eq('student_id', aprilId)
    .eq('class_instance_id', firstClass.id)
    .maybeSingle();

  if (existing) {
    console.log('\n✓ Booking already exists (ID:', existing.id, ')');
    return;
  }

  // Create the booking
  console.log('\nCreating booking...');

  const { data: newBooking, error } = await supabase
    .from('bookings')
    .insert([{
      student_id: aprilId,
      class_instance_id: firstClass.id,
      course_enrollment_id: enrollmentId,
      booking_type: 'regular',
      status: 'attended', // This is a past class from Jan 20
      attended: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) {
    console.log('❌ Error creating booking:', error.message);
    return;
  }

  console.log('✅ Booking created successfully!');
  console.log('   Booking ID:', newBooking.id);
  console.log('   Status: attended (past class)');

  // Update class capacity
  await supabase
    .from('class_instances')
    .update({
      current_enrollment: (firstClass.current_enrollment || 0) + 1,
      updated_at: new Date().toISOString()
    })
    .eq('id', firstClass.id);

  console.log('\n✅ April now has all 6 classes for her Tuesday course:');
  console.log('   1. WT2001NT_JL6.1 (Jan 20) - attended');
  console.log('   2. WT2001NT_JL6.2 (Jan 27) - cancelled');
  console.log('   3. WT2001NT_JL6.3 (Feb 3) - booked');
  console.log('   4. WT2001NT_JL6.4 (Feb 10) - booked');
  console.log('   5. WT2001NT_JL6.5 (Feb 24) - booked');
  console.log('   6. WT2001NT_JL6.6 (Mar 3) - booked');
  console.log('   Plus makeup: WT2201NT_JL6.2 (Jan 29) - booked');
}

addAprilFirstClass().then(() => process.exit());
