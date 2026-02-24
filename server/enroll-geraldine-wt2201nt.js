require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function enrollGeraldine() {
  try {
    console.log('Enrolling Geraldine Brogden in WT2201NT_JL6...\n');

    // Step 1: Find Geraldine
    const { data: geraldine, error: geraldineError } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'gbr@uwcsea.edu.sg')
      .single();

    if (geraldineError) throw geraldineError;
    console.log(`✓ Found Geraldine: ${geraldine.first_name} ${geraldine.last_name} (ID: ${geraldine.id})`);

    // Step 2: Find all WT2201NT_JL6 classes (Thursday nights)
    console.log('\nFinding WT2201NT_JL6 classes...');
    const { data: classes, error: classError } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .ilike('class_type', 'WT2201NT_JL6%')
      .order('class_date', { ascending: true });

    if (classError) throw classError;

    console.log(`Found ${classes.length} classes:`);
    classes.forEach(cls => {
      const date = new Date(cls.class_date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      console.log(`  - ${cls.class_type} on ${dayName} ${cls.class_date} at ${cls.start_time}`);
    });

    if (classes.length === 0) {
      console.log('\n❌ No WT2201NT_JL6 classes found!');
      return;
    }

    // Step 3: Create bookings for all 6 classes
    console.log(`\nCreating ${classes.length} bookings for Geraldine...`);
    const now = new Date().toISOString();

    for (const cls of classes) {
      const classDate = new Date(cls.class_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      classDate.setHours(0, 0, 0, 0);
      const isPast = classDate < today;

      const bookingData = {
        student_id: geraldine.id,
        class_instance_id: cls.id,
        status: isPast ? 'attended' : 'booked',
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
        console.error(`  ✗ Failed: ${cls.class_type} - ${bookingError.message}`);
      } else {
        console.log(`  ✓ ${bookingData.status === 'attended' ? 'Attended' : 'Booked'}: ${cls.class_type} on ${cls.class_date}`);
      }
    }

    console.log('\n✅ Geraldine Brogden enrolled in WT2201NT_JL6!');
    console.log('   She will now appear in the Active Students list.');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

enrollGeraldine();
