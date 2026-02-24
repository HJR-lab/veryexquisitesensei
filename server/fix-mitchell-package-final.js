require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixMitchellPackageFinal() {
  try {
    // Find Mitchell's customer ID
    const { data: mitchell } = await supabase
      .from('customers')
      .select('id')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    console.log('=== Fixing Mitchell\'s Course Display ===\n');

    // Step 1: Update the 3-course package enrollment to show WT2802PM_DL6
    console.log('1. Updating package enrollment (ID: 5054) to show WT2802PM_DL6...');

    const { error: packageUpdateError } = await supabase
      .from('course_enrollments')
      .update({
        course_identifier: 'WT2802PM_DL6'
      })
      .eq('id', 5054);

    if (packageUpdateError) {
      console.error('Error updating package:', packageUpdateError);
      return;
    }

    console.log('✅ Package enrollment updated with WT2802PM_DL6!');

    // Step 2: Deactivate the duplicate individual course (ID: 4769)
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

    console.log('✅ Duplicate individual course deactivated!');

    // Step 3: Verify the final structure
    console.log('\n3. Verifying final structure...');

    const { data: finalEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', mitchell.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    console.log('\n=== Final Active Enrollments ===');
    finalEnrollments.forEach((e, i) => {
      console.log(`${i + 1}. ID: ${e.id} - ${e.status}`);
      console.log(`   Title: ${e.course_title}`);
      console.log(`   Identifier: ${e.course_identifier || 'NULL'}`);
      console.log(`   Type: ${e.package_total_courses ? 'PACKAGE' : 'INDIVIDUAL'}`);
      if (e.package_total_courses) {
        console.log(`   Package: ${e.package_total_courses} courses, ${e.package_courses_remaining || 0} remaining`);
      }
      console.log('');
    });

    // Step 4: Test the enrollment API logic
    console.log('=== Testing Enrollment API Logic ===');
    const individualCourses = finalEnrollments.filter(e => !e.package_total_courses || e.package_total_courses === null);
    const packageCourses = finalEnrollments.filter(e => e.package_total_courses && e.package_total_courses > 0);

    console.log(`Individual courses found: ${individualCourses.length}`);
    if (individualCourses.length > 0) {
      console.log(`✅ Current course (API will return): ${individualCourses[0].course_title} (${individualCourses[0].course_identifier})`);
    }

    console.log(`Package courses found: ${packageCourses.length}`);
    if (packageCourses.length > 0) {
      console.log(`📦 Package course available: ${packageCourses[0].course_title} (${packageCourses[0].course_identifier})`);
    }

    console.log('\n=== Expected Dashboard Result ===');
    console.log('✅ Current Course: Wheelthrowing Beginner/Ext 6 Weeks (WT1701PM_DL6)');
    console.log('✅ Package Course: Wheelthrowing Beginner/Ext 6 Weeks - 3 Course Package (WT2802PM_DL6)');

  } catch (error) {
    console.error('Error:', error);
  }
}

fixMitchellPackageFinal().then(() => process.exit());