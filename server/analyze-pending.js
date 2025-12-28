require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function analyzePending() {
  console.log('\n📊 PENDING ENROLLMENTS ANALYSIS\n');
  console.log('==========================================\n');

  // Get enrollments without bookings
  const { data: pending } = await supabase
    .from('course_enrollments')
    .select('*')
    .is('bookings_created_at', null);

  console.log(`Total enrollments without bookings: ${pending?.length || 0}\n`);

  if (pending && pending.length > 0) {
    // Group by course type
    const byType = {};
    pending.forEach(e => {
      const key = e.course_type || 'Unknown';
      if (!byType[key]) byType[key] = [];
      byType[key].push(e);
    });

    console.log('Breakdown by course type:');
    Object.keys(byType).sort().forEach(type => {
      console.log(`   ${type}: ${byType[type].length} enrollments`);
    });

    // Group by reason (TBD time, waiting for threshold, etc)
    console.log('\nBreakdown by issue:');
    const withTBD = pending.filter(e => !e.class_time || e.class_time === 'TBD');
    const wheelthrowing = pending.filter(e => 
      e.course_type && 
      (e.course_type.includes('Wheelthrowing') || e.course_type.includes('wheelthrowing')) &&
      e.class_time && e.class_time !== 'TBD'
    );
    const handbuilding = pending.filter(e => 
      e.course_type && 
      e.course_type.toLowerCase().includes('handbuilding') &&
      e.class_time && e.class_time !== 'TBD'
    );

    console.log(`   Missing class_time (TBD): ${withTBD.length}`);
    console.log(`   Wheelthrowing waiting for 4+ students: ${wheelthrowing.length}`);
    console.log(`   Handbuilding (should have classes): ${handbuilding.length}`);

    // Show cohort counts for wheelthrowing
    if (wheelthrowing.length > 0) {
      console.log('\n📊 Wheelthrowing cohorts waiting for more students:');
      
      // Group by cohort
      const cohorts = {};
      wheelthrowing.forEach(e => {
        const key = `${e.course_type}|${e.course_start_date}|${e.schedule_pattern}|${e.class_time}`;
        if (!cohorts[key]) {
          cohorts[key] = {
            courseType: e.course_type,
            startDate: e.course_start_date,
            schedule: e.schedule_pattern,
            time: e.class_time,
            count: 0
          };
        }
        cohorts[key].count++;
      });

      Object.values(cohorts).forEach(cohort => {
        console.log(`   ${cohort.courseType} - ${cohort.schedule}s ${cohort.time} starting ${cohort.startDate}: ${cohort.count}/4 students`);
      });
    }

    // Sample of TBD enrollments
    if (withTBD.length > 0) {
      console.log('\nSample enrollments with TBD time:');
      withTBD.slice(0, 5).forEach(e => {
        console.log(`   ${e.course_type} - ${e.schedule_pattern} starting ${e.course_start_date}`);
      });
    }
  }

  process.exit(0);
}

analyzePending().catch(console.error);
