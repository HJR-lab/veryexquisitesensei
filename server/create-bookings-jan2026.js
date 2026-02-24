require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createBookings() {
  console.log('Creating bookings for January 2026 enrollments...\n');

  // Get enrollments starting in January 2026 without bookings
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('status', 'active')
    .ilike('course_type', '%wheelthrowing%')
    .is('bookings_created_at', null)
    .gte('course_start_date', '2026-01-01')
    .lte('course_start_date', '2026-01-31');

  if (!enrollments || enrollments.length === 0) {
    console.log('No enrollments found');
    process.exit(0);
  }

  // Group by cohort
  const cohorts = {};
  enrollments.forEach(e => {
    const key = `${e.course_start_date}|${e.schedule_pattern}|${e.class_time || ''}`;
    if (!cohorts[key]) cohorts[key] = [];
    cohorts[key].push(e);
  });

  console.log(`Found ${enrollments.length} enrollments in ${Object.keys(cohorts).length} cohorts\n`);

  let totalBookings = 0;

  for (const [cohortKey, cohortEnrollments] of Object.entries(cohorts)) {
    const [startDate, schedule, time] = cohortKey.split('|');
    const count = cohortEnrollments.length;

    console.log(`${schedule} ${time} - ${count} students`);

    if (count < 4) {
      console.log(`  ⏳ Below threshold\n`);
      continue;
    }

    // Find matching class instances
    // The classes run for 6 weeks from the start date
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 42); // 6 weeks

    const { data: classes } = await supabase
      .from('class_instances')
      .select('*')
      .gte('class_date', startDate)
      .lte('class_date', end.toISOString().split('T')[0])
      .ilike('class_type', '%WT%');

    if (!classes || classes.length === 0) {
      console.log(`  ❌ No classes found\n`);
      continue;
    }

    console.log(`  Found ${classes.length} classes`);

    // Create bookings for all students in this cohort
    const bookingsToCreate = [];
    for (const enrollment of cohortEnrollments) {
      for (const classInstance of classes) {
        bookingsToCreate.push({
          student_id: enrollment.student_id,
          class_instance_id: classInstance.id,
          status: 'booked',
          booking_type: 'regular',
          course_enrollment_id: enrollment.id,
          booking_date: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    }

    if (bookingsToCreate.length > 0) {
      const { data: created, error } = await supabase
        .from('bookings')
        .insert(bookingsToCreate)
        .select();

      if (error) {
        console.log(`  ❌ Error:`, error.message);
      } else {
        console.log(`  ✅ Created ${created.length} bookings`);
        totalBookings += created.length;

        // Mark enrollments as having bookings created
        const now = new Date().toISOString();
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
