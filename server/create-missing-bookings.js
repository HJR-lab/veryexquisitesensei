require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function createMissingBookings() {
  try {
    console.log('\n🔧 Creating missing bookings...\n');

    const courses = [
      { id: 'WT1701PM_DL6', day: 'SATURDAY', time: '1:00pm - 3:30pm', start: '2026-01-17' },
      { id: 'WT2001NT_JL6', day: 'TUESDAY', time: '7:00pm - 9:30pm', start: '2026-01-20' }
    ];

    for (const course of courses) {
      console.log(`\n📚 ${course.id} - ${course.day}s ${course.time}`);

      // Get enrollments for this cohort
      const { data: enrollments } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('*, customers(first_name, last_name, email)')
        .eq('schedule_pattern', course.day)
        .eq('class_time', course.time)
        .eq('course_start_date', course.start)
        .eq('status', 'active');

      console.log(`   Found ${enrollments?.length || 0} enrollments`);

      // Get class instances for this course
      const { data: classes } = await supabaseDb.supabase
        .from('class_instances')
        .select('id, class_date, class_type')
        .like('class_type', `${course.id}.%`)
        .order('class_date', { ascending: true });

      console.log(`   Found ${classes?.length || 0} classes`);

      if (!classes || classes.length === 0) {
        console.log(`   ⚠️  No classes found!`);
        continue;
      }

      // Create bookings for each enrollment
      for (const enrollment of enrollments) {
        // Check if bookings already exist
        const { data: existingBookings } = await supabaseDb.supabase
          .from('bookings')
          .select('id')
          .eq('course_enrollment_id', enrollment.id);

        if (!existingBookings || existingBookings.length === 0) {
          console.log(`\n   Creating bookings for: ${enrollment.customers?.first_name} ${enrollment.customers?.last_name}`);

          // Create bookings for all classes
          const now = new Date().toISOString();
          const bookingsToCreate = classes.map(cls => ({
            student_id: enrollment.student_id,
            class_instance_id: cls.id,
            status: 'booked',
            booking_type: 'regular',
            course_enrollment_id: enrollment.id,
            booking_date: now,
            created_at: now,
            updated_at: now
          }));

          const { data: created, error } = await supabaseDb.supabase
            .from('bookings')
            .insert(bookingsToCreate)
            .select();

          if (error) {
            console.log(`      ❌ Error: ${error.message}`);
          } else {
            console.log(`      ✅ Created ${created.length} bookings`);

            // Update enrollment
            await supabaseDb.supabase
              .from('course_enrollments')
              .update({ bookings_created_at: new Date().toISOString() })
              .eq('id', enrollment.id);
          }
        } else {
          console.log(`   ✅ ${enrollment.customers?.first_name} ${enrollment.customers?.last_name} already has ${existingBookings.length} bookings`);
        }
      }
    }

    console.log('\n\n✅ All missing bookings created!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

createMissingBookings();
