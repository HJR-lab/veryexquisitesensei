require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createMitchellUpcomingCourse() {
  try {
    console.log('=== Creating Mitchell\'s Upcoming Individual Course ===\n');

    // Create the upcoming individual course enrollment
    const { data: newCourse, error: courseError } = await supabase
      .from('course_enrollments')
      .insert({
        student_id: 1116,
        course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
        course_identifier: 'WT2802PM_DL6',
        status: 'active',
        number_of_weeks: 6,
        instructor: 'VES Instructor',
        course_start_date: '2026-02-28' // February 28, 2026
      })
      .select()
      .single();

    if (courseError) {
      console.error('❌ Error creating upcoming course:', courseError);
    } else {
      console.log('✅ Created upcoming individual course enrollment!');
      console.log(`   Course ID: ${newCourse.id}`);
      console.log(`   Identifier: ${newCourse.course_identifier}`);
      console.log('✅ Mitchell now has two individual courses');
    }

    // Verify final state
    const { data: finalEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', 1116)
      .eq('status', 'active')
      .order('course_start_date', { ascending: true });

    console.log('\n=== MITCHELL\'S FINAL ACTIVE ENROLLMENTS ===');
    finalEnrollments.forEach((e, i) => {
      console.log(`${i + 1}. ${e.course_title} (${e.course_identifier || 'NULL'})`);
      console.log(`   Start Date: ${e.course_start_date || 'NULL'}`);
    });

    console.log('\n💡 Mitchell should now show:');
    console.log('   - Current: Wheelthrowing 6wks 17 Jan - 21 Feb (WT1701PM_DL6)');
    console.log('   - Upcoming: Wheelthrowing 6wks 28 Feb - 4 Apr (WT2802PM_DL6)');

  } catch (error) {
    console.error('Error:', error);
  }
}

createMitchellUpcomingCourse().then(() => process.exit());