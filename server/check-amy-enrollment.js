require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkAmyEnrollment() {
  try {
    // Get Amy Xiao Liu
    const { data: amy } = await supabase
      .from('customers')
      .select('*')
      .eq('email', 'amy1210liu1210@gamil.com')
      .single();

    console.log(`=== Amy Xiao Liu (ID: ${amy.id}) ===\n`);

    // Check all enrollments
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', amy.id);

    console.log(`Total enrollments: ${enrollments?.length || 0}\n`);

    if (enrollments && enrollments.length > 0) {
      enrollments.forEach(e => {
        console.log(`Enrollment ID: ${e.id}`);
        console.log(`  Course: ${e.course_identifier}`);
        console.log(`  Status: ${e.status}`);
        console.log(`  Weeks remaining: ${e.weeks_remaining}`);
        console.log(`  Credits remaining: ${e.class_credits_remaining}`);
        console.log('');
      });
    }

    // Check paused enrollments specifically
    const { data: pausedEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', amy.id)
      .eq('status', 'paused');

    console.log(`Paused enrollments: ${pausedEnrollments?.length || 0}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkAmyEnrollment();
