require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createBookings() {
  console.log('Creating bookings for January 2026 enrollments...\n');

  // Get all January 2026 wheelthrowing enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('status', 'active')
    .ilike('course_type', '%wheelthrowing%')
    .is('bookings_created_at', null)
    .gte('course_start_date', '2026-01-15')
    .lte('course_start_date', '2026-01-31');

  console.log('Found', enrollments.length, 'enrollments without bookings\n');

  // Group by cohort
  const cohorts = {};
  enrollments.forEach(e => {
    const key = `${e.course_start_date}|${e.schedule_pattern}|${e.class_time || ''}`;
    if (!cohorts[key]) cohorts[key] = [];
    cohorts[key].push(e);
  });

  console.log('Cohorts:', Object.keys(cohorts).length, '\n');

  let totalBookings = 0;

  for (const [cohortKey, cohortEnrollments] of Object.entries(cohorts)) {
    const [startDate, schedule, time] = cohortKey.split('|');
    const count = cohortEnrollments.length;

    console.log(`${schedule} ${time} starting ${startDate}: ${count} students`);

    if (count < 4) {
      console.log('  ⏳ Below threshold\n');
      continue;
    }

    // Find matching classes for this exact cohort
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 42); // 6 weeks

    // Match by start date and schedule
    const dayOfWeek = new Date(startDate).getDay();

    const { data: classes } = await supabase
      .from('class_instances')
      .select('*')
      .gte('class_date', startDate)
      .lte('class_date', endDate.toISOString().split('T')[0])
      .ilike('class_type', '%WT%');

    if (!classes || classes.length === 0) {
      console.log('  ❌ No classes found\n');
      continue;
    }

    // Filter to only classes on the same day of week
    const matchingClasses = classes.filter(c => {
      const classDay = new Date(c.class_date).getDay();
      return classDay === dayOfWeek;
    });

    console.log(`  Found ${matchingClasses.length} matching classes`);

    // Create bookings
    const bookings = [];
    const now = new Date().toISOString();

    for (const enrollment of cohortEnrollments) {
      for (const classInstance of matchingClasses) {
        bookings.push({
          student_id: enrollment.student_id,
          class_instance_id: classInstance.id,
          status: 'booked',
          booking_type: 'regular',
          course_enrollment_id: enrollment.id,
          booking_date: now,
          created_at: now,
          updated_at: now
        });
      }
    }

    if (bookings.length > 0) {
      const { data: created, error } = await supabase
        .from('bookings')
        .insert(bookings)
        .select();

      if (error) {
        console.log('  ❌ Error:', error.message);
      } else {
        console.log(`  ✅ Created ${created.length} bookings`);
        totalBookings += created.length;

        // Mark enrollments
        for (const enrollment of cohortEnrollments) {
          await supabase
            .from('course_enrollments')
            .update({ bookings_created_at: now })
            .eq('id', enrollment.id);
        }
      }
    }

    console.log();
  }

  console.log(`✅ Total bookings created: ${totalBookings}`);
  process.exit(0);
}

createBookings();
