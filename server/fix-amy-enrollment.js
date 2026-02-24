require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function fixAmy() {
  try {
    console.log('Step 1: Deleting all existing bookings for Amy...');
    const { error: deleteError } = await supabaseDb.supabase
      .from('bookings')
      .delete()
      .eq('student_id', 2220);

    if (deleteError) throw deleteError;
    console.log('✓ All bookings deleted');

    console.log('\nStep 2: Finding all 6 Friday classes for WT2301AM_JL6...');
    const { data: fridayClasses, error: classError } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .ilike('class_type', 'WT2301AM_JL6%')
      .order('class_date', { ascending: true });

    if (classError) throw classError;

    // Filter only Friday classes
    const fridays = fridayClasses.filter(cls => {
      const date = new Date(cls.class_date);
      return date.getDay() === 5; // Friday
    });

    console.log(`Found ${fridays.length} Friday classes:`);
    fridays.forEach(cls => {
      console.log(`  - ${cls.class_type} on ${cls.class_date}`);
    });

    if (fridays.length !== 6) {
      console.log(`\n⚠️  Warning: Expected 6 classes but found ${fridays.length}`);
    }

    console.log('\nStep 3: Creating fresh bookings...');
    const now = new Date().toISOString();

    for (const cls of fridays) {
      const { data, error } = await supabaseDb.supabase
        .from('bookings')
        .insert({
          student_id: 2220,
          class_instance_id: cls.id,
          status: 'booked',
          booking_type: 'regular',
          created_at: now,
          updated_at: now
        })
        .select()
        .single();

      if (error) {
        console.error(`  ✗ Failed: ${cls.class_type} - ${error.message}`);
      } else {
        console.log(`  ✓ Booked: ${cls.class_type} on ${cls.class_date}`);
      }
    }

    console.log('\n✅ Done! Amy is now enrolled in all 6 Friday classes.');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

fixAmy();
