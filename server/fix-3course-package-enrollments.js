require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fix3CoursePackageEnrollments() {
  try {
    console.log('=== Fixing 3-Course Package Enrollments ===\n');

    // Find Mitchell Chan
    const { data: mitchell } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    console.log('Found Mitchell:', mitchell);

    // Find Sarah Cher
    const { data: sarah } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email')
      .ilike('first_name', 'sarah')
      .ilike('last_name', 'cher')
      .single();

    console.log('Found Sarah:', sarah);

    // Find their 3-course package enrollments
    for (const student of [mitchell, sarah]) {
      console.log(`\n--- Processing ${student.first_name} ${student.last_name} ---`);

      // Get all enrollments
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('*')
        .eq('student_id', student.id)
        .order('created_at', { ascending: true });

      console.log(`Total enrollments: ${enrollments.length}`);

      // Find the 3-course package enrollment (should contain "3 Course Package" in course_title)
      const packageEnrollment = enrollments.find(e =>
        e.course_title?.includes('3 Course Package') ||
        e.course_title?.includes('3-Course Package')
      );

      if (!packageEnrollment) {
        console.log(`⚠️  No 3-course package enrollment found for ${student.first_name}`);
        continue;
      }

      console.log(`\nFound package enrollment:`, {
        id: packageEnrollment.id,
        course_title: packageEnrollment.course_title,
        course_identifier: packageEnrollment.course_identifier,
        package_total_courses: packageEnrollment.package_total_courses,
        package_courses_remaining: packageEnrollment.package_courses_remaining
      });

      // Update the package enrollment with proper fields
      const { data: updated, error: updateError } = await supabase
        .from('course_enrollments')
        .update({
          package_total_courses: 3,
          package_total_classes: 18, // 3 courses × 6 weeks
          package_courses_remaining: 2 // Started course 1 (WT2802PM_DL6), 2 remain
        })
        .eq('id', packageEnrollment.id)
        .select()
        .single();

      if (updateError) {
        console.error(`❌ Error updating ${student.first_name}'s enrollment:`, updateError);
      } else {
        console.log(`✅ Updated ${student.first_name}'s package enrollment:`, {
          id: updated.id,
          package_total_courses: updated.package_total_courses,
          package_total_classes: updated.package_total_classes,
          package_courses_remaining: updated.package_courses_remaining
        });
      }
    }

    console.log('\n=== Complete ===');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

fix3CoursePackageEnrollments();
