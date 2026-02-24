require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixMitchellPackageStructure() {
  try {
    // Find Mitchell's customer ID
    const { data: mitchell } = await supabase
      .from('customers')
      .select('id')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    console.log('=== Fixing Mitchell\'s Package Structure ===\n');

    // Step 1: Update the package enrollment to show WT2802PM_DL6 as the current/next course
    console.log('1. Updating package enrollment (ID: 5054) to include WT2802PM_DL6...');

    const { error: packageUpdateError } = await supabase
      .from('course_enrollments')
      .update({
        course_identifier: 'WT2802PM_DL6',
        package_current_course: 2, // He's on course 2 of 3
        package_courses_remaining: 2 // 2 remaining courses in package
      })
      .eq('id', 5054);

    if (packageUpdateError) {
      console.error('Error updating package:', packageUpdateError);
      return;
    }

    console.log('✅ Package enrollment updated successfully!');

    // Step 2: Remove or deactivate the duplicate individual course (ID: 4769)
    console.log('\n2. Deactivating duplicate individual course (ID: 4769)...');

    const { error: deactivateError } = await supabase
      .from('course_enrollments')
      .update({
        status: 'completed'
      })
      .eq('id', 4769);

    if (deactivateError) {
      console.error('Error deactivating course:', deactivateError);
      return;
    }

    console.log('✅ Duplicate course deactivated!');

    // Step 3: Verify the new structure
    console.log('\n3. Verifying new structure...');

    const { data: updatedEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', mitchell.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    console.log('\n=== Updated Active Enrollments ===');
    updatedEnrollments.forEach((e, i) => {
      console.log(`${i + 1}. ID: ${e.id}`);
      console.log(`   Title: ${e.course_title}`);
      console.log(`   Identifier: ${e.course_identifier || 'NULL'}`);
      console.log(`   Type: ${e.package_total_courses ? 'PACKAGE' : 'INDIVIDUAL'}`);
      if (e.package_total_courses) {
        console.log(`   Package: ${e.package_current_course || 1}/${e.package_total_courses} courses`);
        console.log(`   Remaining: ${e.package_courses_remaining || 0} courses`);
      }
      console.log('');
    });

    console.log('=== Expected Dashboard Result ===');
    console.log('✅ Current Course: Wheelthrowing Beginner/Ext 6 Weeks (WT1701PM_DL6)');
    console.log('✅ Next Course: Wheelthrowing Beginner/Ext 6 Weeks - 3 Course Package (WT2802PM_DL6)');

  } catch (error) {
    console.error('Error:', error);
  }
}

fixMitchellPackageStructure().then(() => process.exit());