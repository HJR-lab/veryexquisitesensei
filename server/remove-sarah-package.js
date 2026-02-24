require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function removeSarahPackage() {
  try {
    console.log('=== Removing Sarah\'s 3-Course Package Enrollment ===\n');

    // Find Sarah's package enrollment
    const { data: packageEnrollment } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', 2228)
      .gt('package_total_courses', 1)
      .single();

    if (!packageEnrollment) {
      console.log('❌ No package enrollment found for Sarah');
      return;
    }

    console.log('Found package enrollment:');
    console.log(`  ID: ${packageEnrollment.id}`);
    console.log(`  Title: ${packageEnrollment.course_title}`);
    console.log(`  Package Total: ${packageEnrollment.package_total_courses}`);
    console.log(`  Status: ${packageEnrollment.status}\n`);

    // Delete the package enrollment
    const { error } = await supabase
      .from('course_enrollments')
      .delete()
      .eq('id', packageEnrollment.id);

    if (error) {
      console.error('❌ Error deleting package enrollment:', error);
    } else {
      console.log('✅ Successfully removed Sarah\'s 3-course package enrollment');
      console.log('💡 Sarah will now only show individual courses on dashboard');
    }

    // Create upcoming individual course for Sarah (matching Mitchell)
    const { data: newCourse, error: courseError } = await supabase
      .from('course_enrollments')
      .insert({
        student_id: 2228,
        course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
        course_identifier: 'WT2802PM_DL6',
        status: 'active',
        number_of_weeks: 6,
        instructor: 'VES Instructor',
        course_start_date: '2026-02-28'
      })
      .select()
      .single();

    if (courseError) {
      console.error('❌ Error creating upcoming course:', courseError);
    } else {
      console.log('✅ Created upcoming individual course for Sarah!');
      console.log(`   Course ID: ${newCourse.id}`);
    }

    // Verify final state
    const { data: remainingEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', 2228)
      .eq('status', 'active')
      .order('course_start_date', { ascending: true });

    console.log('\n=== SARAH\'S FINAL ACTIVE ENROLLMENTS ===');
    remainingEnrollments.forEach((e, i) => {
      console.log(`${i + 1}. ${e.course_title} (${e.course_identifier || 'NULL'})`);
      console.log(`   Start Date: ${e.course_start_date || 'NULL'}`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

removeSarahPackage().then(() => process.exit());