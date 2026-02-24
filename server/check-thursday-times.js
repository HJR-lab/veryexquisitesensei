require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkThursdayTimes() {
  console.log('=== CHECKING THURSDAY WHEELTHROWING TIME SLOTS ===\n');

  // Get all Thursday wheelthrowing enrollments that DO have start_time
  const { data: allThursday } = await supabase
    .from('course_enrollments')
    .select(`
      id,
      student_id,
      course_type,
      schedule_pattern,
      course_start_date,
      start_time,
      bookings_created_at,
      customers!inner(first_name, last_name)
    `)
    .eq('schedule_pattern', 'THURSDAY')
    .ilike('course_type', '%wheel%')
    .eq('status', 'active')
    .not('start_time', 'is', null)
    .order('course_start_date')
    .order('start_time');

  console.log(`Found ${allThursday?.length || 0} Thursday wheelthrowing enrollments with start_time\n`);

  // Group by start date and time
  const cohorts = {};
  allThursday?.forEach(e => {
    const key = `${e.course_start_date}_${e.start_time}`;
    if (!cohorts[key]) {
      cohorts[key] = {
        startDate: e.course_start_date,
        startTime: e.start_time,
        students: []
      };
    }
    cohorts[key].students.push({
      id: e.student_id,
      name: `${e.customers.first_name} ${e.customers.last_name}`,
      hasBookings: !!e.bookings_created_at
    });
  });

  Object.entries(cohorts).forEach(([key, cohort]) => {
    console.log(`Cohort starting ${cohort.startDate} at ${cohort.startTime}:`);
    console.log(`  Total students: ${cohort.students.length}`);
    cohort.students.forEach(s => {
      const status = s.hasBookings ? '✅' : '❌';
      console.log(`    ${status} ${s.name} (ID: ${s.id})`);
    });

    const withBookings = cohort.students.filter(s => s.hasBookings).length;
    if (withBookings === cohort.students.length && cohort.students.length >= 4) {
      console.log(`  ✅ Classes created for all ${cohort.students.length} students`);
    } else if (cohort.students.length >= 4) {
      console.log(`  ⚠️  ${cohort.students.length} students >= 4, but only ${withBookings} have bookings`);
    } else {
      console.log(`  ⏳ Only ${cohort.students.length} students (needs ${4 - cohort.students.length} more)`);
    }
    console.log('');
  });

  // Also check what time slots exist for existing Thursday classes
  console.log('\n=== EXISTING THURSDAY CLASS TIME SLOTS ===\n');
  const { data: classes } = await supabase
    .from('class_instances')
    .select('class_date, start_time, end_time, class_type, instructor, room')
    .gte('class_date', '2026-01-01')
    .lte('class_date', '2026-03-31')
    .ilike('class_type', '%wheel%')
    .order('class_date')
    .limit(50);

  const thursdayClasses = classes?.filter(c => {
    const date = new Date(c.class_date);
    return date.getDay() === 4;
  });

  if (thursdayClasses?.length > 0) {
    const timeSlots = new Set();
    thursdayClasses.forEach(c => timeSlots.add(c.start_time));

    console.log('Available Thursday time slots:');
    Array.from(timeSlots).sort().forEach(time => {
      console.log(`  - ${time}`);
    });
  } else {
    console.log('No existing Thursday wheelthrowing classes found');
  }
}

checkThursdayTimes().then(() => process.exit());
