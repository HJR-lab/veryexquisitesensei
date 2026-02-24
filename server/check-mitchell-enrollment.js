require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkMitchellEnrollment() {
  try {
    // Find Mitchell's customer ID
    const { data: mitchell } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    if (!mitchell) {
      console.log('❌ Mitchell not found');
      return;
    }

    console.log('=== Mitchell Chan ===');
    console.log(`ID: ${mitchell.id}`);
    console.log(`Name: ${mitchell.first_name} ${mitchell.last_name}`);
    console.log(`Email: ${mitchell.email}\n`);

    // Get all enrollments
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', mitchell.id)
      .order('created_at', { ascending: false });

    if (!enrollments || enrollments.length === 0) {
      console.log('❌ No enrollments found');
      return;
    }

    console.log(`=== Found ${enrollments.length} Enrollment(s) ===\n`);

    enrollments.forEach((enrollment, index) => {
      console.log(`--- Enrollment ${index + 1} ---`);
      console.log(`ID: ${enrollment.id}`);
      console.log(`Course Title: ${enrollment.course_title}`);
      console.log(`Course Identifier: ${enrollment.course_identifier}`);
      console.log(`Number of Weeks: ${enrollment.number_of_weeks}`);
      console.log(`Status: ${enrollment.status}`);
      console.log(`\nPackage Fields:`);
      console.log(`  package_total_courses: ${enrollment.package_total_courses || 'NULL'}`);
      console.log(`  package_total_classes: ${enrollment.package_total_classes || 'NULL'}`);
      console.log(`  package_courses_remaining: ${enrollment.package_courses_remaining || 'NULL'}`);

      console.log(`\n📊 What Dashboard Will Show:`);
      if (enrollment.package_total_courses === 3) {
        console.log('  ✅ Course Type Badge: "3-Course Package" (green)');
        console.log('  ✅ Structure: "3 x 6-week courses (18 weeks total)"');
        console.log('  ✅ Price: "$1,400"');
        console.log(`  ✅ Progress: ${3 - (enrollment.package_courses_remaining || 0)} enrolled / 3 total`);
        console.log(`  ✅ Remaining: ${enrollment.package_courses_remaining || 0} courses`);
      } else if (enrollment.number_of_weeks === 6) {
        console.log('  📘 Course Type Badge: "6-Week" (blue)');
        console.log('  📘 Structure: "6 classes over 6 weeks"');
      } else {
        console.log('  ❓ Course type will be detected from title/weeks');
      }
      console.log('\n');
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkMitchellEnrollment();
