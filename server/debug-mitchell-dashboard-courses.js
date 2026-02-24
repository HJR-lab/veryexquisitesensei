require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function debugMitchellDashboard() {
  try {
    // Find Mitchell's customer ID
    const { data: mitchell } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    console.log('=== Mitchell Chan Dashboard Debug ===');
    console.log(`Customer ID: ${mitchell.id}\n`);

    // Get all active enrollments
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', mitchell.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    console.log('=== Active Enrollments (What Dashboard Shows) ===');
    enrollments.forEach((e, i) => {
      console.log(`${i + 1}. ID: ${e.id}`);
      console.log(`   Title: ${e.course_title}`);
      console.log(`   Identifier: ${e.course_identifier || 'NULL'}`);
      console.log(`   Package Total: ${e.package_total_courses || 'NULL'}`);
      console.log(`   Package Current: ${e.package_current_course || 'NULL'}`);
      console.log(`   Package Remaining: ${e.package_courses_remaining || 'NULL'}`);
      console.log(`   Type: ${e.package_total_courses ? 'PACKAGE' : 'INDIVIDUAL'}`);
      console.log(`   Created: ${e.created_at}`);
      console.log('');
    });

    // Check what the API currently returns for "current enrollment"
    console.log('=== What Current Enrollment API Returns ===');
    const individualCourses = enrollments.filter(e => !e.package_total_courses || e.package_total_courses === null);
    const packageCourses = enrollments.filter(e => e.package_total_courses && e.package_total_courses > 0);

    console.log(`Individual Courses: ${individualCourses.length}`);
    individualCourses.forEach(e => {
      console.log(`  - ${e.course_title} (${e.course_identifier || 'NULL'})`);
    });

    console.log(`Package Courses: ${packageCourses.length}`);
    packageCourses.forEach(e => {
      console.log(`  - ${e.course_title} (${e.course_identifier || 'NULL'})`);
    });

    console.log('\n=== EXPECTED DASHBOARD STRUCTURE ===');
    console.log('1. Current Course: WT1701PM_DL6 (individual 6-week course)');
    console.log('2. Next Course: WT2802PM_DL6 (part of 3-course package)');
    console.log('\n=== RECOMMENDATION ===');
    console.log('- Update WT2802PM_DL6 to be linked to the 3-course package enrollment');
    console.log('- Or create proper enrollment structure where package shows upcoming courses');

  } catch (error) {
    console.error('Error:', error);
  }
}

debugMitchellDashboard().then(() => process.exit());