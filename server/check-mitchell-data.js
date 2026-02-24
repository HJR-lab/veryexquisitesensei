require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkMitchellData() {
  try {
    // Get Mitchell
    const { data: mitchell } = await supabase
      .from('customers')
      .select('*')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    console.log('=== Mitchell Chan ===');
    console.log(`ID: ${mitchell.id}`);
    console.log(`Email: ${mitchell.email}`);
    console.log(`classes_allocated: ${mitchell.classes_allocated}`);
    console.log(`course_purchase_count: ${mitchell.course_purchase_count}`);
    console.log('');

    // Get all enrollments
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', mitchell.id)
      .order('created_at', { ascending: true });

    console.log(`Total Enrollments: ${enrollments.length}\n`);

    enrollments.forEach((e, idx) => {
      console.log(`Enrollment ${idx + 1}:`);
      console.log(`  ID: ${e.id}`);
      console.log(`  Course: ${e.course_identifier || e.course_title}`);
      console.log(`  Type: ${e.course_type}`);
      console.log(`  Weeks: ${e.number_of_weeks}`);
      console.log(`  Start: ${e.course_start_date}`);
      console.log(`  Package Info:`);
      console.log(`    - Total Courses: ${e.package_total_courses || 'N/A'}`);
      console.log(`    - Total Classes: ${e.package_total_classes || 'N/A'}`);
      console.log(`    - Courses Remaining: ${e.package_courses_remaining || 'N/A'}`);
      console.log(`  Created: ${e.created_at}`);
      console.log('');
    });

    // Calculate what it should be
    const totalClassesFromEnrollments = enrollments.reduce((sum, e) => {
      return sum + (e.number_of_weeks || 6);
    }, 0);

    console.log(`\n=== CALCULATION ===`);
    console.log(`Total classes from enrollments: ${totalClassesFromEnrollments}`);
    console.log(`Database classes_allocated: ${mitchell.classes_allocated}`);
    console.log(`Should be: 24 (6 single + 18 package)`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkMitchellData();
