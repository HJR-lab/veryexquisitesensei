require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function verifyQuantity() {
  console.log('\n🔍 VERIFYING QUANTITY ENROLLMENTS\n');

  // Check lizleeyw@gmail.com (ordered quantity 2)
  const { data: lizEnrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', (await supabase.from('customers').select('id').eq('email', 'lizleeyw@gmail.com').single()).data?.id);

  console.log(`lizleeyw@gmail.com enrollments: ${lizEnrollments?.length || 0}`);
  if (lizEnrollments) {
    lizEnrollments.forEach(e => {
      console.log(`   ${e.course_type} - ${e.schedule_pattern}s ${e.class_time} starting ${e.course_start_date}`);
    });
  }

  // Check deniselai97@hotmail.com (ordered quantity 2)
  const { data: deniseEnrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', (await supabase.from('customers').select('id').eq('email', 'deniselai97@hotmail.com').single()).data?.id);

  console.log(`\ndeniselai97@hotmail.com enrollments: ${deniseEnrollments?.length || 0}`);
  if (deniseEnrollments) {
    deniseEnrollments.forEach(e => {
      console.log(`   ${e.course_type} - ${e.schedule_pattern}s ${e.class_time} starting ${e.course_start_date}`);
    });
  }

  // Check total count
  const { count } = await supabase
    .from('course_enrollments')
    .select('*', { count: 'exact', head: true });

  console.log(`\nTotal enrollments in database: ${count}\n`);

  process.exit(0);
}

verifyQuantity().catch(console.error);
