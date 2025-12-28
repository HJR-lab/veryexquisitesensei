require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkHBSept() {
  console.log('\n📊 HANDBUILDING - WEDNESDAYS FROM SEPT 17, 2025\n');

  // Get HB enrollments from Aug 2025 onwards
  const { data: hbEnrollments } = await supabase
    .from('course_enrollments')
    .select('*, customer:customers(email, first_name, last_name)')
    .ilike('course_type', '%handbuilding%')
    .gte('course_start_date', '2025-08-01')
    .order('course_start_date');

  console.log(`HB enrollments from Aug 2025+: ${hbEnrollments?.length || 0}\n`);

  if (hbEnrollments && hbEnrollments.length > 0) {
    hbEnrollments.forEach((e, i) => {
      console.log(`${i + 1}. ${e.customer.first_name} ${e.customer.last_name} (${e.customer.email})`);
      console.log(`   Title: ${e.course_title}`);
      console.log(`   Variant: ${e.course_variant_title}`);
      console.log(`   Schedule: ${e.schedule_pattern}s ${e.class_time || 'TBD'}`);
      console.log(`   Start: ${e.course_start_date}`);
      console.log(`   Weeks: ${e.number_of_weeks}\n`);
    });
  }

  // Get HB classes - Wednesdays 7pm from Sept 2025
  const { data: hbClasses } = await supabase
    .from('class_instances')
    .select('*')
    .ilike('class_type', '%HB%')
    .eq('day_of_week', 'WEDNESDAY')
    .gte('class_date', '2025-09-01')
    .order('class_date');

  console.log(`\nHB Wednesday classes from Sept 2025: ${hbClasses?.length || 0}\n`);

  if (hbClasses && hbClasses.length > 0) {
    hbClasses.forEach(c => {
      console.log(`   ${c.class_date} ${c.start_time} - ${c.class_type} (${c.current_enrollment}/${c.max_capacity})`);
    });
  }

  process.exit(0);
}

checkHBSept().catch(console.error);
