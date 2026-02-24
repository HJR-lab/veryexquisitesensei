require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkEnrollments() {
  // Check Ivy's enrollments
  const { data: ivy } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email, course_purchase_count')
    .ilike('first_name', 'Ivy')
    .ilike('last_name', 'Tan')
    .single();

  console.log('Ivy Tan:', ivy);

  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', ivy.id)
    .order('start_date', { ascending: false });

  console.log(`\nCourse Enrollments (${enrollments.length}):`);
  enrollments.forEach(e => {
    console.log(`  - ${e.course_title} (${e.course_identifier})`);
    console.log(`    Start: ${e.start_date}, Status: ${e.status}`);
    console.log(`    Classes allocated: ${e.classes_allocated}, used: ${e.classes_used}`);
  });

  console.log(`\nExpected: ${ivy.course_purchase_count} courses`);
  console.log(`Actual: ${enrollments.length} courses`);

  if (enrollments.length < ivy.course_purchase_count) {
    console.log(`\n❌ Missing ${ivy.course_purchase_count - enrollments.length} historical course enrollment(s)`);
  }
}

checkEnrollments().then(() => process.exit());
