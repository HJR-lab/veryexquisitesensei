require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkCohorts() {
  console.log('=== CHECKING THALIA & HUITING COHORT STATUS ===\n');

  const thaliaId = 2320;
  const huitingId = 1137;

  // Get their enrollments
  const { data: thaliaEnrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', thaliaId);

  const { data: huitingEnrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', huitingId);

  console.log('THALIA NAWI (ID: 2320):');
  thaliaEnrollments?.forEach(e => {
    console.log(`  Enrollment ${e.id}:`);
    console.log(`    Course Type: ${e.course_type}`);
    console.log(`    Status: ${e.status}`);
    console.log(`    Start Date: ${e.course_start_date}`);
    console.log(`    Schedule: ${e.schedule_pattern}`);
    console.log(`    Bookings Created: ${e.bookings_created_at || 'NO'}`);
    console.log('');
  });

  console.log('HUITING KOH (ID: 1137):');
  huitingEnrollments?.forEach(e => {
    console.log(`  Enrollment ${e.id}:`);
    console.log(`    Course Type: ${e.course_type}`);
    console.log(`    Status: ${e.status}`);
    console.log(`    Start Date: ${e.course_start_date}`);
    console.log(`    Schedule: ${e.schedule_pattern}`);
    console.log(`    Bookings Created: ${e.bookings_created_at || 'NO'}`);
    console.log('');
  });

  // Check if there are other students in their cohorts
  const allEnrollments = [...(thaliaEnrollments || []), ...(huitingEnrollments || [])];

  for (const enrollment of allEnrollments) {
    console.log(`\nChecking cohort for enrollment ${enrollment.id}:`);
    console.log(`  ${enrollment.course_type} - ${enrollment.schedule_pattern} starting ${enrollment.course_start_date}`);

    const { data: cohortMembers } = await supabase
      .from('course_enrollments')
      .select('id, student_id, customers!inner(first_name, last_name)')
      .eq('course_type', enrollment.course_type)
      .eq('schedule_pattern', enrollment.schedule_pattern)
      .eq('course_start_date', enrollment.course_start_date)
      .eq('status', 'active')
      .is('bookings_created_at', null);

    console.log(`  Total students in cohort: ${cohortMembers?.length || 0}`);
    cohortMembers?.forEach(m => {
      console.log(`    - ${m.customers.first_name} ${m.customers.last_name} (ID: ${m.student_id})`);
    });

    if (enrollment.course_type.toLowerCase().includes('wheelthrowing')) {
      if (cohortMembers?.length >= 4) {
        console.log(`  ✅ Cohort is ready! (${cohortMembers.length} >= 4 students)`);
      } else {
        console.log(`  ⏳ Cohort needs ${4 - (cohortMembers?.length || 0)} more students`);
      }
    } else if (enrollment.course_type.toLowerCase().includes('handbuilding')) {
      console.log(`  ℹ️  Handbuilding uses credit system (no cohort threshold)`);
    }
  }
}

checkCohorts().then(() => process.exit());
