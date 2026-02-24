require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function fixInstructorsAndEnrollments() {
  try {
    console.log('\n🔧 Fixing instructor assignments and identifiers...\n');

    // Step 1: Fix weekend classes - should be Dillon Lin (DL), not Joyce Lim (JL)
    console.log('Step 1: Updating weekend classes to Dillon Lin...\n');

    const weekendCourses = [
      { old: 'WT1701PM_JL6', new: 'WT1701PM_DL6', day: 'Saturday', time: '1:00pm' },
      { old: 'WT1701AM_JL6', new: 'WT1701AM_DL6', day: 'Saturday', time: '9:30am' },
      { old: 'WT1801AM_JL6', new: 'WT1801AM_DL6', day: 'Sunday', time: '9:30am' }
    ];

    for (const course of weekendCourses) {
      // Update class instances
      const { data: classes } = await supabaseDb.supabase
        .from('class_instances')
        .select('*')
        .like('class_type', `${course.old}.%`);

      if (classes && classes.length > 0) {
        for (const cls of classes) {
          const newType = cls.class_type.replace(course.old, course.new);

          await supabaseDb.supabase
            .from('class_instances')
            .update({
              class_type: newType,
              instructor: 'Dillon Lin'
            })
            .eq('id', cls.id);
        }

        console.log(`✅ Updated ${classes.length} classes: ${course.old} → ${course.new} (Dillon Lin)`);
      }
    }

    // Step 2: Check enrollments for each course
    console.log('\n\nStep 2: Checking enrollments...\n');

    const courses = [
      { id: 'WT1701PM_DL6', day: 'SATURDAY', time: '1:00pm - 3:30pm', start: '2026-01-17' },
      { id: 'WT1701AM_DL6', day: 'SATURDAY', time: '9:30am - 12:00pm', start: '2026-01-17' },
      { id: 'WT1801AM_DL6', day: 'SUNDAY', time: '9:30am - 12:00pm', start: '2026-01-18' },
      { id: 'WT2001NT_JL6', day: 'TUESDAY', time: '7:00pm - 9:30pm', start: '2026-01-20' },
      { id: 'WT2201NT_JL6', day: 'THURSDAY', time: '7:00pm - 9:30pm', start: '2026-01-22' },
      { id: 'WT2301AM_JL6', day: 'FRIDAY', time: '9:30am - 12:00pm', start: '2026-01-23' }
    ];

    for (const course of courses) {
      // Get enrollments for this cohort
      const { data: enrollments } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('*, customers(first_name, last_name, email)')
        .eq('schedule_pattern', course.day)
        .eq('class_time', course.time)
        .eq('course_start_date', course.start)
        .eq('status', 'active');

      console.log(`\n📚 ${course.id} - ${course.day}s ${course.time}`);
      console.log(`   Enrollments: ${enrollments?.length || 0}`);

      if (enrollments && enrollments.length > 0) {
        // Get class instances for this course
        const { data: classes } = await supabaseDb.supabase
          .from('class_instances')
          .select('id')
          .like('class_type', `${course.id}.%`)
          .order('class_date', { ascending: true });

        if (!classes || classes.length === 0) {
          console.log(`   ⚠️  No classes found!`);
          continue;
        }

        // Check bookings for each enrollment
        let missingBookings = 0;
        for (const enrollment of enrollments) {
          const { data: bookings } = await supabaseDb.supabase
            .from('bookings')
            .select('id')
            .eq('course_enrollment_id', enrollment.id);

          if (!bookings || bookings.length === 0) {
            console.log(`   ⚠️  Missing bookings for: ${enrollment.customers?.first_name} ${enrollment.customers?.last_name}`);

            // Create bookings for this enrollment
            const bookingsToCreate = classes.map(cls => ({
              student_id: enrollment.student_id,
              class_instance_id: cls.id,
              status: 'booked',
              booking_type: 'regular',
              course_enrollment_id: enrollment.id,
              booking_date: new Date().toISOString()
            }));

            const { data: created } = await supabaseDb.supabase
              .from('bookings')
              .insert(bookingsToCreate)
              .select();

            if (created) {
              console.log(`      ✅ Created ${created.length} bookings`);

              // Update enrollment
              await supabaseDb.supabase
                .from('course_enrollments')
                .update({ bookings_created_at: new Date().toISOString() })
                .eq('id', enrollment.id);

              missingBookings++;
            }
          } else {
            console.log(`   ✅ ${enrollment.customers?.first_name} ${enrollment.customers?.last_name} - ${bookings.length} bookings`);
          }
        }

        if (missingBookings > 0) {
          console.log(`   📝 Fixed ${missingBookings} enrollment(s)`);
        }
      } else {
        console.log(`   ⚠️  NO ENROLLMENTS FOUND`);
      }
    }

    console.log('\n\n✅ All fixes complete!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixInstructorsAndEnrollments();
