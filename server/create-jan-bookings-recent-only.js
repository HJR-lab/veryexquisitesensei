require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  console.log('Creating bookings for January 2026 - RECENT ENROLLMENTS ONLY...\n');

  // Get ONLY enrollments created after Nov 1, 2025
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('status', 'active')
    .ilike('course_type', '%wheelthrowing%')
    .gte('created_at', '2025-11-01')
    .gte('course_start_date', '2026-01-15')
    .lte('course_start_date', '2026-01-31')
    .is('bookings_created_at', null);

  console.log('Found', enrollments.length, 'recent enrollments\n');

  // Remove duplicates (same student + start date + schedule)
  const seen = new Map();
  const unique = [];

  for (const e of enrollments) {
    const key = `${e.student_id}|${e.course_start_date}|${e.schedule_pattern}|${e.class_time || ''}`;
    if (!seen.has(key)) {
      seen.set(key, true);
      unique.push(e);
    } else {
      console.log('Skipping duplicate enrollment:', e.id, 'for student', e.student_id);
    }
  }

  console.log('\nProcessing', unique.length, 'unique enrollments\n');

  // Group by cohort
  const cohorts = {};
  unique.forEach(e => {
    const key = `${e.course_start_date}|${e.schedule_pattern}|${e.class_time || ''}`;
    if (!cohorts[key]) cohorts[key] = [];
    cohorts[key].push(e);
  });

  let totalBookings = 0;

  for (const [cohortKey, cohortEnrollments] of Object.entries(cohorts)) {
    const [startDate, schedule, time] = cohortKey.split('|');
    console.log(`${schedule} ${time} - ${startDate}: ${cohortEnrollments.length} students`);

    if (cohortEnrollments.length < 4 && schedule !== 'FRIDAY') {
      console.log('  ⏳ Below threshold\n');
      continue;
    }

    // Find classes
    const dayOfWeek = new Date(startDate).getDay();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 42);

    const { data: allClasses } = await supabase
      .from('class_instances')
      .select('*')
      .gte('class_date', startDate)
      .lte('class_date', endDate.toISOString().split('T')[0])
      .ilike('class_type', '%WT%');

    const classes = allClasses.filter(c => new Date(c.class_date).getDay() === dayOfWeek);

    if (classes.length === 0) {
      console.log('  ❌ No classes found\n');
      continue;
    }

    console.log(`  Found ${classes.length} classes`);

    // Create bookings
    const bookings = [];
    const now = new Date().toISOString();

    for (const e of cohortEnrollments) {
      for (const c of classes) {
        bookings.push({
          student_id: e.student_id,
          class_instance_id: c.id,
          status: 'booked',
          booking_type: 'regular',
          course_enrollment_id: e.id,
          booking_date: now,
          created_at: now,
          updated_at: now
        });
      }
    }

    const { data: created, error } = await supabase
      .from('bookings')
      .insert(bookings)
      .select();

    if (error) {
      console.log('  ❌ Error:', error.message);
    } else {
      console.log(`  ✅ Created ${created.length} bookings`);
      totalBookings += created.length;

      // Update class enrollment counts
      const studentCount = cohortEnrollments.length;
      for (const c of classes) {
        await supabase
          .from('class_instances')
          .update({ current_enrollment: studentCount })
          .eq('id', c.id);
      }

      // Mark enrollments
      for (const e of cohortEnrollments) {
        await supabase
          .from('course_enrollments')
          .update({ bookings_created_at: now })
          .eq('id', e.id);
      }
    }

    console.log();
  }

  console.log(`✅ Total bookings created: ${totalBookings}`);
  process.exit(0);
})();
