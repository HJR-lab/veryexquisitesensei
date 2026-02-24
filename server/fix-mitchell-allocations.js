require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixMitchellAllocations() {
  try {
    const mitchellEmail = 'Mitchell.chandx@gmail.com';
    const sarahEmail = 'Mitchell.chandx+dup@gmail.com';

    // Get Mitchell and Sarah
    const { data: students } = await supabase
      .from('customers')
      .select('*')
      .in('email', [mitchellEmail, sarahEmail]);

    for (const student of students) {
      console.log(`\n=== Fixing ${student.first_name} ${student.last_name} ===`);

      // Update classes_allocated to 24 (6 single + 18 package)
      const { error: updateError } = await supabase
        .from('customers')
        .update({
          classes_allocated: 24,
          course_purchase_count: 4  // 1 single + 3-course package
        })
        .eq('id', student.id);

      if (updateError) {
        console.error('Error updating customer:', updateError);
      } else {
        console.log(`✅ Updated classes_allocated: 6 → 24`);
        console.log(`✅ Updated course_purchase_count: 2 → 4`);
      }

      // Find the package enrollment (most recent one with "3 Course Package" in title)
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('*')
        .eq('student_id', student.id)
        .ilike('course_title', '%3 Course Package%');

      if (enrollments && enrollments.length > 0) {
        const packageEnrollment = enrollments[0];
        console.log(`\nUpdating package enrollment ID ${packageEnrollment.id}...`);

        // Update with package metadata
        const { error: enrollError } = await supabase
          .from('course_enrollments')
          .update({
            package_total_courses: 3,
            package_total_classes: 18,
            package_courses_remaining: 2  // First course is this enrollment, 2 remaining
          })
          .eq('id', packageEnrollment.id);

        if (enrollError) {
          console.error('Error updating enrollment:', enrollError);
        } else {
          console.log(`✅ Updated package metadata: 3 courses, 18 classes, 2 remaining`);
        }
      }
    }

    console.log('\n✅ All fixes applied!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

fixMitchellAllocations();
