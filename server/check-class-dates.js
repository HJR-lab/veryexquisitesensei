require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkDates() {
  console.log('\n📅 CLASS DATE RANGE CHECK\n');
  
  // Get min and max class dates
  const { data: classes } = await supabase
    .from('class_instances')
    .select('class_date')
    .order('class_date', { ascending: true });

  if (classes && classes.length > 0) {
    const firstDate = classes[0].class_date;
    const lastDate = classes[classes.length - 1].class_date;
    
    console.log(`First class date: ${firstDate}`);
    console.log(`Last class date: ${lastDate}`);
    console.log(`Total classes: ${classes.length}\n`);

    // Count by year
    const by2024 = classes.filter(c => c.class_date.startsWith('2024')).length;
    const by2025 = classes.filter(c => c.class_date.startsWith('2025')).length;
    
    console.log(`Classes in 2024: ${by2024}`);
    console.log(`Classes in 2025: ${by2025}\n`);

    // Check if there are any November or December enrollments
    const { data: novEnrollments } = await supabase
      .from('course_enrollments')
      .select('course_start_date, course_type, schedule_pattern, class_time')
      .gte('course_start_date', '2024-11-01')
      .lt('course_start_date', '2024-12-01');

    console.log(`\nNovember 2024 enrollments: ${novEnrollments?.length || 0}`);
    if (novEnrollments && novEnrollments.length > 0) {
      console.log('Sample November enrollments:');
      novEnrollments.slice(0, 5).forEach(e => {
        console.log(`   ${e.course_start_date} - ${e.course_type} ${e.schedule_pattern}s ${e.class_time || 'TBD'}`);
      });
    }

    const { data: decEnrollments } = await supabase
      .from('course_enrollments')
      .select('course_start_date, course_type, schedule_pattern, class_time')
      .gte('course_start_date', '2024-12-01')
      .lt('course_start_date', '2025-01-01');

    console.log(`\nDecember 2024 enrollments: ${decEnrollments?.length || 0}`);
  }

  process.exit(0);
}

checkDates().catch(console.error);
