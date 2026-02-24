require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixMitchellSingleCourse() {
  try {
    console.log('=== Making Mitchell show only 1 course (the package) ===\n');

    // Find Mitchell's customer ID
    const { data: mitchell } = await supabase
      .from('customers')
      .select('id')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    // Deactivate the individual course (ID: 4801) since he should only see the package
    console.log('1. Deactivating individual course (ID: 4801)...');

    const { error: deactivateError } = await supabase
      .from('course_enrollments')
      .update({
        status: 'completed'
      })
      .eq('id', 4801);

    if (deactivateError) {
      console.error('Error deactivating individual course:', deactivateError);
      return;
    }

    console.log('✅ Individual course deactivated!');

    // Keep the package course (ID: 5054) as active
    console.log('\n2. Keeping package course (ID: 5054) as active...');

    const { error: packageError } = await supabase
      .from('course_enrollments')
      .update({
        status: 'active'
      })
      .eq('id', 5054);

    if (packageError) {
      console.error('Error updating package course:', packageError);
      return;
    }

    console.log('✅ Package course kept as active!');

    // Verify the result
    console.log('\n3. Verifying final state...');

    const { data: finalEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', mitchell.id)
      .eq('status', 'active');

    console.log('\n=== FINAL ACTIVE ENROLLMENTS ===');
    console.log(`Active enrollments: ${finalEnrollments.length}`);
    finalEnrollments.forEach(e => {
      console.log(`  - ${e.course_title} (${e.course_identifier || 'NULL'})`);
    });

    console.log('\n✅ Mitchell should now see only the 3-Course Package on his dashboard!');

  } catch (error) {
    console.error('Error:', error);
  }
}

fixMitchellSingleCourse().then(() => process.exit());