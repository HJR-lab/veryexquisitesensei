require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function enrollAmy() {
  try {
    // Find Amy Xiao Liu
    console.log('Searching for Amy Xiao Liu...');
    const { data: students, error: searchError } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .or('first_name.ilike.%xiao%,last_name.ilike.%liu%');

    if (searchError) throw searchError;

    console.log('Found students:', JSON.stringify(students, null, 2));

    if (students.length === 0) {
      console.log('No student found with name matching Xiao Liu');
      return;
    }

    // Find the student with both Xiao and Liu
    const amy = students.find(s =>
      (s.first_name?.toLowerCase().includes('xiao') || s.last_name?.toLowerCase().includes('xiao')) &&
      (s.first_name?.toLowerCase().includes('liu') || s.last_name?.toLowerCase().includes('liu'))
    );

    if (!amy) {
      console.log('Could not find student with both Xiao and Liu in name');
      console.log('Available students:', students.map(s => `${s.first_name} ${s.last_name}`));
      return;
    }

    console.log(`\nFound Amy: ${amy.first_name} ${amy.last_name} (ID: ${amy.id}, Email: ${amy.email})`);

    // Find all Friday classes for WT2301AM_JL6
    console.log('\nSearching for Friday WT2301AM_JL6 classes...');
    const { data: classes, error: classError } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .ilike('class_type', 'WT2301AM_JL6%')
      .order('class_date', { ascending: true });

    if (classError) throw classError;

    if (classes.length === 0) {
      console.log('No classes found for WT2301AM_JL6');
      return;
    }

    console.log(`Found ${classes.length} classes for WT2301AM_JL6:`);
    classes.forEach(cls => {
      const date = new Date(cls.class_date);
      const day = date.toLocaleDateString('en-US', { weekday: 'long' });
      console.log(`  - ${cls.class_type} on ${day} ${cls.class_date} at ${cls.start_time}`);
    });

    // Filter only Friday classes
    const fridayClasses = classes.filter(cls => {
      const date = new Date(cls.class_date);
      return date.getDay() === 5; // Friday
    });

    console.log(`\n${fridayClasses.length} Friday classes found.`);

    if (fridayClasses.length === 0) {
      console.log('No Friday classes found for WT2301AM_JL6');
      return;
    }

    // Create bookings for all Friday classes
    console.log(`\nCreating ${fridayClasses.length} bookings for Amy...`);

    for (const cls of fridayClasses) {
      const now = new Date().toISOString();
      const bookingData = {
        student_id: amy.id,
        class_instance_id: cls.id,
        status: 'booked',
        booking_type: 'regular',
        created_at: now,
        updated_at: now
      };

      const { data: booking, error: bookingError } = await supabaseDb.supabase
        .from('bookings')
        .insert(bookingData)
        .select()
        .single();

      if (bookingError) {
        console.error(`Error creating booking for ${cls.class_date}:`, bookingError);
      } else {
        console.log(`✓ Booked: ${cls.class_type} on ${cls.class_date}`);
      }
    }

    // Update Amy's classes_allocated to 6 if not already set
    if (!amy.classes_allocated || amy.classes_allocated < 6) {
      const { error: updateError } = await supabaseDb.supabase
        .from('customers')
        .update({ classes_allocated: 6 })
        .eq('id', amy.id);

      if (updateError) {
        console.error('Error updating classes_allocated:', updateError);
      } else {
        console.log('\n✓ Updated Amy\'s classes_allocated to 6');
      }
    }

    console.log('\n✅ Enrollment complete!');
    console.log(`Amy Xiao Liu has been enrolled in ${fridayClasses.length} Friday classes for WT2301AM_JL6`);

  } catch (error) {
    console.error('Error enrolling Amy:', error);
  } finally {
    process.exit(0);
  }
}

enrollAmy();
