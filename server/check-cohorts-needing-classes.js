require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkCohorts() {
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .gte('created_at', '2025-11-25')
    .eq('status', 'active')
    .ilike('course_type', '%wheelthrowing%');

  const cohorts = {};
  enrollments.forEach(e => {
    const key = `${e.course_type}|${e.course_start_date}|${e.schedule_pattern}|${e.class_time}`;
    if (!cohorts[key]) {
      cohorts[key] = {
        courseType: e.course_type,
        startDate: e.course_start_date,
        schedule: e.schedule_pattern,
        time: e.class_time,
        enrollments: [],
        hasClasses: e.bookings_created_at ? true : false
      };
    }
    cohorts[key].enrollments.push(e);
  });

  console.log('Wheelthrowing Cohorts (since Nov 25, 2025):\n');
  
  let needsClasses = [];
  
  Object.values(cohorts).forEach(cohort => {
    const count = cohort.enrollments.length;
    const hasClasses = cohort.hasClasses;
    const meetsThreshold = count >= 4;
    
    console.log(`${cohort.schedule}s ${cohort.time} starting ${cohort.startDate}`);
    console.log(`  Students: ${count}${meetsThreshold ? ' ✅ THRESHOLD MET' : ' ⏳ WAITING'}`);
    console.log(`  Classes created: ${hasClasses ? '✅ YES' : '❌ NO'}`);
    
    if (meetsThreshold && !hasClasses) {
      console.log(`  ⚠️  NEEDS CLASSES CREATED!`);
      needsClasses.push(cohort);
    }
    console.log();
  });
  
  if (needsClasses.length > 0) {
    console.log(`\n⚠️  ${needsClasses.length} cohorts need classes created!`);
  } else {
    console.log('\n✅ All cohorts are properly set up!');
  }
  
  process.exit(0);
}

checkCohorts().catch(console.error);
