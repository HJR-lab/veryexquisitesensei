require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function removeMitchellPackage() {
  try {
    console.log('=== Removing Mitchell\'s 3-Course Package Enrollment ===\n');

    // Find Mitchell's package enrollment
    const { data: packageEnrollment } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', 1116)
      .gt('package_total_courses', 1)
      .single();

    if (!packageEnrollment) {
      console.log('❌ No package enrollment found for Mitchell');
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
      console.log('✅ Successfully removed Mitchell\'s 3-course package enrollment');
      console.log('💡 Mitchell will now only show individual courses on dashboard');
    }

    // Verify final state
    const { data: remainingEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', 1116)
      .eq('status', 'active');

    console.log('\n=== MITCHELL\'S REMAINING ACTIVE ENROLLMENTS ===');
    remainingEnrollments.forEach(e => {
      console.log(`  - ${e.course_title} (${e.course_identifier || 'NULL'})`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

removeMitchellPackage().then(() => process.exit());