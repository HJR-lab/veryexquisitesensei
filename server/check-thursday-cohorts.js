require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkThursdayCohorts() {
  console.log('=== CHECKING ALL THURSDAY COHORTS ===\n');

  // Get all Thursday wheelthrowing enrollments starting around Jan 2026
  const { data: thursdayEnrollments } = await supabase
    .from('course_enrollments')
    .select(`
      id,
      student_id,
      course_type,
      schedule_pattern,
      course_start_date,
      start_time,
      status,
      bookings_created_at,
      customers!inner(first_name, last_name)
    `)
    .ilike('course_type', '%wheelthrowing%')
    .eq('schedule_pattern', 'THURSDAY')
    .gte('course_start_date', '2026-01-01')
    .lte('course_start_date', '2026-02-28')
    .eq('status', 'active')
    .order('course_start_date')
    .order('start_time');

  console.log(`Total Thursday enrollments: ${thursdayEnrollments?.length || 0}\n`);

  // Group by start date and time
  const cohorts = {};
  thursdayEnrollments?.forEach(e => {
    const key = `${e.course_start_date}_${e.start_time || 'NO_TIME'}`;
    if (!cohorts[key]) {
      cohorts[key] = {
        startDate: e.course_start_date,
        startTime: e.start_time,
        courseType: e.course_type,
        students: [],
        hasBookings: []
      };
    }
    cohorts[key].students.push({
      id: e.student_id,
      name: `${e.customers.first_name} ${e.customers.last_name}`,
      hasBookings: !!e.bookings_created_at
    });
    if (e.bookings_created_at) {
      cohorts[key].hasBookings.push(e.student_id);
    }
  });

  Object.entries(cohorts).forEach(([key, cohort]) => {
    console.log(`Cohort: ${cohort.courseType}`);
    console.log(`  Start: ${cohort.startDate} at ${cohort.startTime || 'NO TIME SPECIFIED'}`);
    console.log(`  Students: ${cohort.students.length}`);
    cohort.students.forEach(s => {
      const status = s.hasBookings ? '✅ HAS BOOKINGS' : '❌ NO BOOKINGS';
      console.log(`    - ${s.name} (ID: ${s.id}) ${status}`);
    });

    if (cohort.hasBookings.length > 0 && cohort.hasBookings.length < cohort.students.length) {
      console.log(`  ⚠️  MIXED STATE: ${cohort.hasBookings.length}/${cohort.students.length} have bookings`);
    } else if (cohort.hasBookings.length === cohort.students.length) {
      console.log(`  ✅ All students have bookings (classes created)`);
    } else {
      console.log(`  ⏳ No bookings yet - ${cohort.students.length >= 4 ? 'READY TO PROCESS' : `needs ${4 - cohort.students.length} more`}`);
    }
    console.log('');
  });

  // Check if there are any existing Thursday classes around Jan 21
  const { data: existingClasses } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2026-01-21')
    .lte('class_date', '2026-03-31')
    .ilike('class_type', '%wheelthrowing%')
    .order('class_date');

  console.log('\n=== EXISTING THURSDAY CLASSES ===\n');
  const thursdayClasses = existingClasses?.filter(c => {
    const date = new Date(c.class_date);
    return date.getDay() === 4; // Thursday
  });

  if (thursdayClasses?.length > 0) {
    const byDate = {};
    thursdayClasses.forEach(c => {
      const dateKey = c.class_date.split('T')[0];
      if (!byDate[dateKey]) {
        byDate[dateKey] = [];
      }
      byDate[dateKey].push(c);
    });

    Object.entries(byDate).forEach(([date, classes]) => {
      console.log(`${date} (Thursday):`);
      classes.forEach(c => {
        console.log(`  ${c.start_time} - ${c.end_time} | ${c.class_type} | Room ${c.room} | ${c.instructor}`);
      });
      console.log('');
    });
  } else {
    console.log('No existing Thursday classes found in Jan-Mar 2026');
  }
}

checkThursdayCohorts().then(() => process.exit());
