/**
 * LINK ORPHANED ENROLLMENTS TO EXISTING CLASSES
 * Find enrollments without bookings and link them to existing classes
 */

require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');
const { createMultipleBookings, updateCourseEnrollment } = require('./utils/supabaseDb');

async function linkOrphanedEnrollments() {
  console.log('\n🔗 LINKING ORPHANED ENROLLMENTS\n');
  console.log('==========================================\n');

  // Get all enrollments without bookings
  const { data: orphaned } = await supabase
    .from('course_enrollments')
    .select('*')
    .is('bookings_created_at', null);

  if (!orphaned || orphaned.length === 0) {
    console.log('No orphaned enrollments found.');
    process.exit(0);
  }

  console.log(`Found ${orphaned.length} orphaned enrollments\n`);

  let linked = 0;
  let bookingsCreated = 0;

  for (const enrollment of orphaned) {
    // Skip if missing required fields
    if (!enrollment.class_time || enrollment.class_time === 'TBD') {
      continue;
    }

    console.log(`\nChecking: ${enrollment.course_type} - ${enrollment.schedule_pattern}s ${enrollment.class_time} starting ${enrollment.course_start_date}`);

    try {
      // Find existing classes for this cohort based on the dates and times
      const startDate = new Date(enrollment.course_start_date);
      const endDate = enrollment.course_end_date ? new Date(enrollment.course_end_date) : null;

      // Find classes matching the cohort criteria
      const { data: classes } = await supabase
        .from('class_instances')
        .select('*')
        .eq('class_type', enrollment.course_type)
        .eq('start_time', enrollment.class_time.split(' - ')[0])
        .gte('class_date', enrollment.course_start_date)
        .order('class_date', { ascending: true });

      if (!classes || classes.length === 0) {
        console.log(`   ⚠️  No existing classes found`);
        continue;
      }

      // Filter classes that match the schedule pattern (day of week)
      const dayOfWeek = enrollment.schedule_pattern.replace(/s$/i, '').toUpperCase();
      const matchingClasses = classes.filter(c => 
        c.day_of_week && c.day_of_week.toUpperCase() === dayOfWeek
      );

      if (matchingClasses.length === 0) {
        console.log(`   ⚠️  No classes match day of week ${dayOfWeek}`);
        continue;
      }

      // Limit to number of weeks for this course
      const classesToBook = matchingClasses.slice(0, enrollment.number_of_weeks);

      console.log(`   ✅ Found ${classesToBook.length} matching classes`);

      // Check if bookings already exist for this enrollment
      const { data: existingBookings } = await supabase
        .from('bookings')
        .select('*')
        .eq('student_id', enrollment.student_id)
        .eq('course_enrollment_id', enrollment.id);

      if (existingBookings && existingBookings.length > 0) {
        console.log(`   ℹ️  Bookings already exist (${existingBookings.length}), updating enrollment`);
        
        // Update enrollment with timestamp
        await updateCourseEnrollment(enrollment.id, {
          status: 'active',
          bookingsCreatedAt: new Date().toISOString()
        });
        
        linked++;
        continue;
      }

      // Create bookings for this student
      const bookingsToCreate = classesToBook.map(classInstance => ({
        student_id: enrollment.student_id,
        class_instance_id: classInstance.id,
        status: 'booked',
        booking_type: 'regular',
        course_enrollment_id: enrollment.id,
        booking_date: new Date().toISOString()
      }));

      console.log(`   📚 Creating ${bookingsToCreate.length} bookings...`);
      
      try {
        const createdBookings = await createMultipleBookings(bookingsToCreate);
        
        // Update enrollment
        await updateCourseEnrollment(enrollment.id, {
          status: 'active',
          bookingsCreatedAt: new Date().toISOString()
        });

        // Update class enrollment counts
        for (const classInstance of classesToBook) {
          const { data: currentClass } = await supabase
            .from('class_instances')
            .select('current_enrollment')
            .eq('id', classInstance.id)
            .single();

          await supabase
            .from('class_instances')
            .update({ current_enrollment: (currentClass.current_enrollment || 0) + 1 })
            .eq('id', classInstance.id);
        }

        console.log(`   ✅ Created ${createdBookings.length} bookings`);
        linked++;
        bookingsCreated += createdBookings.length;
      } catch (error) {
        if (error.message && error.message.includes('duplicate')) {
          console.log(`   ℹ️  Bookings already exist`);
        } else {
          console.log(`   ❌ Error: ${error.message}`);
        }
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  console.log('\n\n✅ LINKING COMPLETE!\n');
  console.log('==========================================\n');
  console.log(`📊 Summary:`);
  console.log(`   Enrollments linked: ${linked}`);
  console.log(`   Bookings created: ${bookingsCreated}\n`);

  process.exit(0);
}

linkOrphanedEnrollments().catch(error => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
