require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkTypes() {
  console.log('\nChecking class_type vs course_type mismatch:\n');

  // Get unique class_types from class_instances
  const { data: classes } = await supabase
    .from('class_instances')
    .select('class_type')
    .limit(1000);

  const classTypes = [...new Set(classes.map(c => c.class_type))];
  console.log('Unique class_type values in class_instances:');
  classTypes.forEach(t => console.log(`   "${t}"`));

  // Get unique course_types from enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('course_type')
    .limit(1000);

  const courseTypes = [...new Set(enrollments.map(e => e.course_type))];
  console.log('\nUnique course_type values in course_enrollments:');
  courseTypes.forEach(t => console.log(`   "${t}"`));

  // Check sample class Wednesday 7pm
  console.log('\n\nSample: Looking for Wednesday 7pm Wheelthrowing Beginner starting 2025-02-13:\n');
  
  const { data: wedClasses } = await supabase
    .from('class_instances')
    .select('*')
    .eq('day_of_week', 'WEDNESDAY')
    .eq('start_time', '7:00pm')
    .gte('class_date', '2025-02-01')
    .lte('class_date', '2025-02-28')
    .order('class_date');

  console.log(`Found ${wedClasses?.length || 0} Wednesday 7pm classes in Feb 2025:`);
  if (wedClasses && wedClasses.length > 0) {
    wedClasses.forEach(c => {
      console.log(`   ${c.class_date} - "${c.class_type}" - ${c.start_time} - ${c.room}`);
    });
  }

  process.exit(0);
}

checkTypes().catch(console.error);
