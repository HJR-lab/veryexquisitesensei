require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createWT2308Bookings() {
  console.log('=== CREATING WT2308 BOOKINGS FOR EDITH ===\n');

  const studentId = 1225;
  const enrollmentId = 4956;

  // Get all WT2308AM_JL6 class instances
  const { data: classes, error: classError } = await supabase
    .from('class_instances')
    .select('*')
    .ilike('class_type', '%WT2308AM_JL6%')
    .order('class_date', { ascending: true });

  if (classError) {
    console.error('Error fetching classes:', classError);
    return;
  }

  console.log(`Found ${classes?.length || 0} WT2308AM_JL6 classes\n`);

  if (!classes || classes.length === 0) {
    console.log('No WT2308AM_JL6 classes found!');
    return;
  }

  // Display classes to be booked
  console.log('Classes to create bookings for:');
  classes.forEach((c, idx) => {
    console.log(`  ${idx + 1}. ${c.class_date} ${c.start_time}-${c.end_time} [ID: ${c.id}]`);
  });

  console.log('\nCreating bookings...\n');

  // Create bookings for each class
  for (const classInstance of classes) {
    const now = new Date().toISOString();
    const booking = {
      student_id: studentId,
      class_instance_id: classInstance.id,
      course_enrollment_id: enrollmentId,
      status: 'attended',
      attended: null,
      booking_date: '2025-08-01',
      updated_at: now
    };

    const { data, error } = await supabase
      .from('bookings')
      .insert(booking)
      .select()
      .single();

    if (error) {
      console.error(`❌ Error creating booking for ${classInstance.class_date}:`, error);
    } else {
      console.log(`✅ Created booking ${data.id} for ${classInstance.class_date}`);
    }
  }

  console.log('\n=== DONE ===');
}

createWT2308Bookings().then(() => process.exit());
