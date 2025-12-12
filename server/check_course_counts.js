require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkCourseCounts() {
  const { data: students } = await supabase
    .from('customers')
    .select('email, first_name, last_name, course_purchase_count, course_expiry_date')
    .eq('customer_type', 'student')
    .gt('course_purchase_count', 1)
    .order('course_purchase_count', { ascending: false });

  console.log(`\n📊 Returning Students (course_purchase_count > 1): ${students?.length || 0}\n`);

  if (students && students.length > 0) {
    console.log('Top returning students:');
    students.slice(0, 10).forEach(s => {
      console.log(`  ${s.email} - ${s.course_purchase_count} courses purchased`);
    });
  } else {
    console.log('⚠️  No returning students found. Course purchase counts may not be populated.');
  }

  process.exit(0);
}

checkCourseCounts();
