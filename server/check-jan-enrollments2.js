require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkJanEnrollments() {
  try {
    console.log('\n🔍 Checking January 2026 enrollments...\n');

    const { data: enrollments, error } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*, customers(first_name, last_name, email)')
      .eq('status', 'active')
      .ilike('course_type', '%wheelthrowing%')
      .gte('course_start_date', '2026-01-01')
      .lt('course_start_date', '2026-02-01')
      .order('course_start_date', { ascending: true });

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    console.log(`Found ${enrollments.length} enrollments in January 2026\n`);

    // Group by cohort
    const cohorts = {};
    enrollments.forEach(e => {
      const key = `${e.schedule_pattern}|${e.course_start_date}|${e.class_time}`;
      if (!cohorts[key]) {
        cohorts[key] = {
          schedule: e.schedule_pattern,
          startDate: e.course_start_date,
          time: e.class_time,
          enrollments: []
        };
      }
      cohorts[key].enrollments.push(e);
    });

    Object.entries(cohorts).forEach(([key, cohort]) => {
      console.log(`\n📚 ${cohort.schedule}s ${cohort.time} starting ${cohort.startDate}`);
      console.log(`   Students: ${cohort.enrollments.length}`);
      cohort.enrollments.forEach(e => {
        console.log(`   - ${e.customers?.first_name} ${e.customers?.last_name} (${e.customers?.email})`);
        console.log(`     Bookings created: ${e.bookings_created_at ? 'Yes' : 'No'}`);
      });
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkJanEnrollments();
