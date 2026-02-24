require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function fixTuesdaySchedule() {
  try {
    console.log('\n🔧 Fixing WT2001NT_JL6 schedule (skip Feb 17, end Mar 3)...\n');

    // Get all current Tuesday 7pm classes
    const { data: classes } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .like('class_type', 'WT2001NT_JL6.%')
      .order('class_date', { ascending: true });

    console.log(`Found ${classes.length} classes:\n`);
    classes.forEach(cls => {
      const date = new Date(cls.class_date);
      console.log(`   ${cls.class_type} - ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`);
    });

    // Current schedule should be:
    // Jan 20, Jan 27, Feb 3, Feb 10, Feb 17 (DELETE), Feb 24 (becomes .5)
    // Need to add: Mar 3 (becomes .6)

    console.log('\n📝 Applying fixes...\n');

    // Step 1: Find and delete Feb 17 class
    const feb17Class = classes.find(cls => cls.class_date.startsWith('2026-02-17'));
    if (feb17Class) {
      console.log(`1. Deleting Feb 17 class (${feb17Class.class_type})...`);

      // Delete bookings first
      const { error: deleteBookingsError } = await supabaseDb.supabase
        .from('bookings')
        .delete()
        .eq('class_instance_id', feb17Class.id);

      if (deleteBookingsError) {
        console.log(`   ❌ Error deleting bookings: ${deleteBookingsError.message}`);
        return;
      }

      // Delete class
      const { error: deleteClassError } = await supabaseDb.supabase
        .from('class_instances')
        .delete()
        .eq('id', feb17Class.id);

      if (deleteClassError) {
        console.log(`   ❌ Error deleting class: ${deleteClassError.message}`);
        return;
      }

      console.log(`   ✅ Deleted Feb 17 class and its bookings`);
    } else {
      console.log(`1. ⚠️  Feb 17 class not found (may already be deleted)`);
    }

    // Step 2: Rename Feb 24 from .6 to .5
    const feb24Class = classes.find(cls => cls.class_date.startsWith('2026-02-24'));
    if (feb24Class && feb24Class.class_type === 'WT2001NT_JL6.6') {
      console.log(`\n2. Renaming Feb 24 class from .6 to .5...`);

      const { error: updateError } = await supabaseDb.supabase
        .from('class_instances')
        .update({ class_type: 'WT2001NT_JL6.5' })
        .eq('id', feb24Class.id);

      if (updateError) {
        console.log(`   ❌ Error: ${updateError.message}`);
      } else {
        console.log(`   ✅ Renamed to WT2001NT_JL6.5`);
      }
    } else {
      console.log(`\n2. ⚠️  Feb 24 class status: ${feb24Class ? feb24Class.class_type : 'not found'}`);
    }

    // Step 3: Create Mar 3 class as .6
    console.log(`\n3. Creating Mar 3 class (WT2001NT_JL6.6)...`);

    const newClass = {
      class_date: '2026-03-03T00:00:00.000Z',
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

    const { data: createdClass, error: createError } = await supabaseDb.supabase
      .from('class_instances')
      .insert([newClass])
      .select()
      .single();

    if (createError) {
      console.log(`   ❌ Error: ${createError.message}`);
      return;
    }

    console.log(`   ✅ Created WT2001NT_JL6.6 on Mar 3`);

    // Step 4: Create bookings for all students in this course
    console.log(`\n4. Creating bookings for Mar 3 class...`);

    // Get all enrollments for this course
    const { data: enrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id, student_id')
      .eq('schedule_pattern', 'TUESDAY')
      .eq('class_time', '7:00pm - 9:30pm')
      .eq('course_start_date', '2026-01-20')
      .eq('status', 'active');

    console.log(`   Found ${enrollments?.length || 0} enrollments`);

    if (enrollments && enrollments.length > 0) {
      const now = new Date().toISOString();
      const bookings = enrollments.map(e => ({
        student_id: e.student_id,
        class_instance_id: createdClass.id,
        status: 'booked',
        booking_type: 'regular',
        course_enrollment_id: e.id,
        booking_date: now,
        created_at: now,
        updated_at: now
      }));

      const { data: createdBookings, error: bookingError } = await supabaseDb.supabase
        .from('bookings')
        .insert(bookings)
        .select();

      if (bookingError) {
        console.log(`   ❌ Error creating bookings: ${bookingError.message}`);
      } else {
        console.log(`   ✅ Created ${createdBookings.length} bookings`);
      }
    }

    // Verify final schedule
    console.log(`\n\n📅 Final WT2001NT_JL6 Schedule:\n`);

    const { data: finalClasses } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .like('class_type', 'WT2001NT_JL6.%')
      .order('class_date', { ascending: true });

    finalClasses.forEach(cls => {
      const date = new Date(cls.class_date);
      console.log(`   ${cls.class_type} - ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} | ${cls.start_time}`);
    });

    console.log(`\n✅ Tuesday schedule fixed!`);
    console.log(`   - Skips Feb 17 (Chinese New Year)`);
    console.log(`   - Ends Mar 3 (6 weeks total)`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixTuesdaySchedule();
