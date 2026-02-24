require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkIvy() {
  // Get Ivy's info
  const { data: ivy } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email, course_purchase_count')
    .ilike('email', '%ironyv%')
    .single();

  console.log('Ivy Tan:', ivy);

  // Get course enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', ivy.id)
    .order('created_at', { ascending: false });

  console.log(`\nCourse Enrollments (${enrollments.length}):`);
  enrollments.forEach(e => {
    console.log(`  ID: ${e.id}`);
    console.log(`  Title: ${e.course_title}`);
    console.log(`  Status: ${e.status}`);
    console.log(`  Start: ${e.course_start_date}`);
    console.log(`  Classes allocated: ${e.classes_allocated}, used: ${e.classes_used}`);
    console.log('');
  });

  console.log(`Course Purchase Count: ${ivy.course_purchase_count}`);
  console.log(`Actual Enrollments: ${enrollments.length}`);

  if (enrollments.length < ivy.course_purchase_count) {
    console.log(`\n❌ Missing ${ivy.course_purchase_count - enrollments.length} enrollment(s)`);
  } else {
    console.log(`\n✅ All enrollments present`);
  }
}

checkIvy().then(() => process.exit());
