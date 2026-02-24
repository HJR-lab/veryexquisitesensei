require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixMitchellCurrentClasses() {
  try {
    console.log('=== URGENT: Restoring Mitchell\'s Current Class Access ===\n');

    // Reactivate his current individual course (WT1701PM_DL6) so he can see his current classes
    console.log('1. Reactivating Mitchell\'s current course (ID: 4801) - WT1701PM_DL6...');

    const { error: reactivateError } = await supabase
      .from('course_enrollments')
      .update({
        status: 'active'
      })
      .eq('id', 4801);

    if (reactivateError) {
      console.error('❌ Error reactivating current course:', reactivateError);
      return;
    }

    console.log('✅ Current course (WT1701PM_DL6) reactivated!');

    // Check current status
    console.log('\n2. Checking current bookings access...');

    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date
        )
      `)
      .eq('student_id', 1116)
      .eq('course_enrollment_id', 4801)
      .in('status', ['booked', 'attended']);

    console.log(`✅ Mitchell can now access ${bookings.length} bookings for WT1701PM_DL6`);

    // Show current active enrollments
    const { data: activeEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', 1116)
      .eq('status', 'active');

    console.log('\n=== ACTIVE ENROLLMENTS (will show on dashboard) ===');
    activeEnrollments.forEach(e => {
      console.log(`  - ${e.course_title} (${e.course_identifier || 'NULL'})`);
    });

    console.log('\n🚨 ISSUE: Mitchell now has 2 active enrollments again.');
    console.log('💡 SOLUTION NEEDED: We need a frontend fix to show them properly, not a database fix.');
    console.log('💡 The package should show as "upcoming" while individual shows as "current".');

  } catch (error) {
    console.error('Error:', error);
  }
}

fixMitchellCurrentClasses().then(() => process.exit());