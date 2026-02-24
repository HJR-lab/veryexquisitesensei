require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function restorePackages() {
  try {
    console.log('=== Restoring Package Enrollments ===\n');

    // Delete the individual upcoming courses we just created
    console.log('Deleting recently created individual upcoming courses...');

    const { error: deleteMitchellError } = await supabase
      .from('course_enrollments')
      .delete()
      .eq('id', 5057); // Mitchell's upcoming course

    const { error: deleteSarahError } = await supabase
      .from('course_enrollments')
      .delete()
      .eq('id', 5058); // Sarah's upcoming course

    if (deleteMitchellError) console.error('Error deleting Mitchell upcoming:', deleteMitchellError);
    if (deleteSarahError) console.error('Error deleting Sarah upcoming:', deleteSarahError);

    // Restore Mitchell's 3-course package
    console.log('Restoring Mitchell\'s 3-course package...');
    const { data: mitchellPackage, error: mitchellError } = await supabase
      .from('course_enrollments')
      .insert({
        student_id: 1116,
        course_title: 'Wheelthrowing Beginner/Ext 6 Weeks - 3 Course Package',
        course_identifier: 'WT2802PM_DL6',
        package_total_courses: 3,
        package_total_classes: 18,
        package_courses_remaining: 2,
        status: 'active',
        number_of_weeks: 6,
        instructor: 'VES Instructor'
      })
      .select()
      .single();

    // Restore Sarah's 3-course package
    console.log('Restoring Sarah\'s 3-course package...');
    const { data: sarahPackage, error: sarahError } = await supabase
      .from('course_enrollments')
      .insert({
        student_id: 2228,
        course_title: 'Wheelthrowing Beginner/Ext 6 Weeks - 3 Course Package',
        course_identifier: 'WT2802PM_DL6',
        package_total_courses: 3,
        package_total_classes: 18,
        package_courses_remaining: 2,
        status: 'active',
        number_of_weeks: 6,
        instructor: 'VES Instructor'
      })
      .select()
      .single();

    if (mitchellError) {
      console.error('❌ Error restoring Mitchell package:', mitchellError);
    } else {
      console.log('✅ Restored Mitchell\'s 3-course package');
    }

    if (sarahError) {
      console.error('❌ Error restoring Sarah package:', sarahError);
    } else {
      console.log('✅ Restored Sarah\'s 3-course package');
    }

    console.log('\n=== VERIFICATION ===');

    // Check Mitchell's enrollments
    const { data: mitchellEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', 1116)
      .eq('status', 'active');

    console.log('Mitchell\'s active enrollments:');
    mitchellEnrollments.forEach(e => {
      console.log(`  - ${e.course_title} (${e.course_identifier || 'NULL'})`);
    });

    // Check Sarah's enrollments
    const { data: sarahEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', 2228)
      .eq('status', 'active');

    console.log('Sarah\'s active enrollments:');
    sarahEnrollments.forEach(e => {
      console.log(`  - ${e.course_title} (${e.course_identifier || 'NULL'})`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

restorePackages().then(() => process.exit());