require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function fixTuesdayCNY() {
  try {
    console.log('\n🔧 Fixing Tuesday schedule to skip Chinese New Year (Jan 27)...\n');

    // Get current Tuesday schedule
    const { data: classes } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .like('class_type', 'WT2001NT_JL6.%')
      .order('class_date', { ascending: true });

    console.log('Current schedule:');
    classes.forEach(cls => {
      const date = new Date(cls.class_date);
      const holidayMark = cls.cancellation_reason?.includes('Public Holiday') ? ' ⚠️ PUBLIC HOLIDAY' : '';
      console.log(`   ${cls.class_type} - ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${holidayMark}`);
    });

    // Find Jan 27 class (CNY)
    const jan27Class = classes.find(cls => cls.class_date.startsWith('2026-01-27'));

    if (jan27Class) {
      console.log(`\n🗑️  Deleting Jan 27 class (Chinese New Year)...`);

      // Delete bookings
      await supabaseDb.supabase
        .from('bookings')
        .delete()
        .eq('class_instance_id', jan27Class.id);

      // Delete class
      await supabaseDb.supabase
        .from('class_instances')
        .delete()
        .eq('id', jan27Class.id);

      console.log('   ✅ Deleted');
    }

    // Now we need to add Mar 10 as the 6th class
    console.log(`\n➕ Adding Mar 10 as the 6th class...`);

    const newClass = {
      class_date: '2026-03-10T00:00:00.000Z',
      start_time: '7:00pm',
      end_time: '9:30pm',
      class_type: 'WT2001NT_JL6.6',
      instructor: 'Joyce Lim',
      room: 'Studio A',
      max_capacity: 10,
      current_enrollment: 4,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // First delete the existing Mar 3 class if it's .6
    const mar3Class = classes.find(cls => cls.class_date.startsWith('2026-03-03'));
    if (mar3Class && mar3Class.class_type === 'WT2001NT_JL6.6') {
      console.log(`   Renaming Mar 3 from .6 to .5...`);

      // Delete bookings for Mar 3
      await supabaseDb.supabase
        .from('bookings')
        .delete()
        .eq('class_instance_id', mar3Class.id);

      // Delete Mar 3 class
      await supabaseDb.supabase
        .from('class_instances')
        .delete()
        .eq('id', mar3Class.id);

      // Recreate as .5
      const { data: recreated } = await supabaseDb.supabase
        .from('class_instances')
        .insert([{
          ...mar3Class,
          id: undefined,
          class_type: 'WT2001NT_JL6.5',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      // Recreate bookings
      const { data: enrollments } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('id, student_id')
        .eq('schedule_pattern', 'TUESDAY')
        .eq('class_time', '7:00pm - 9:30pm')
        .eq('course_start_date', '2026-01-20');

      if (enrollments && enrollments.length > 0) {
        const now = new Date().toISOString();
        const bookings = enrollments.map(e => ({
          student_id: e.student_id,
          class_instance_id: recreated.id,
          status: 'booked',
          booking_type: 'regular',
          course_enrollment_id: e.id,
          booking_date: now,
          created_at: now,
          updated_at: now
        }));

        await supabaseDb.supabase
          .from('bookings')
          .insert(bookings);
      }

      console.log('   ✅ Recreated Mar 3 as .5');
    }

    // Create Mar 10 as .6
    const { data: mar10Class } = await supabaseDb.supabase
      .from('class_instances')
      .insert([newClass])
      .select()
      .single();

    console.log('   ✅ Created Mar 10 as .6');

    // Create bookings for Mar 10
    const { data: enrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id, student_id')
      .eq('schedule_pattern', 'TUESDAY')
      .eq('class_time', '7:00pm - 9:30pm')
      .eq('course_start_date', '2026-01-20');

    if (enrollments && enrollments.length > 0) {
      const now = new Date().toISOString();
      const bookings = enrollments.map(e => ({
        student_id: e.student_id,
        class_instance_id: mar10Class.id,
        status: 'booked',
        booking_type: 'regular',
        course_enrollment_id: e.id,
        booking_date: now,
        created_at: now,
        updated_at: now
      }));

      const { data: created } = await supabaseDb.supabase
        .from('bookings')
        .insert(bookings)
        .select();

      console.log(`   ✅ Created ${created?.length || 0} bookings for Mar 10`);
    }

    // Show final schedule
    console.log(`\n\n📅 FINAL Tuesday Schedule (WT2001NT_JL6):\n`);

    const { data: finalClasses } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .like('class_type', 'WT2001NT_JL6.%')
      .order('class_date', { ascending: true });

    finalClasses.forEach((cls, idx) => {
      const date = new Date(cls.class_date);
      console.log(`   Week ${idx + 1}: ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} | ${cls.class_type}`);
    });

    console.log(`\n✅ Fixed! Now skips Jan 27 (CNY) and ends Mar 10`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixTuesdayCNY();
