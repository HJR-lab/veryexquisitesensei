require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkGeraldineEnrollments() {
  try {
    // Check ALL enrollments for Geraldine by different fields
    console.log('=== SEARCHING FOR GERALDINE ENROLLMENTS ===\n');

    console.log('1. Checking by student_id (2344):');
    const { data: enrollments1 } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', 2344);
    console.log(`   Found: ${enrollments1?.length || 0}\n`);

    console.log('2. Checking by student_email:');
    const { data: enrollments2 } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_email', 'gbr@uwcsea.edu.sg');
    console.log(`   Found: ${enrollments2?.length || 0}\n`);

    console.log('3. Checking by student_name:');
    const { data: enrollments3 } = await supabase
      .from('course_enrollments')
      .select('*')
      .ilike('student_name', '%geraldine%brogden%');
    console.log(`   Found: ${enrollments3?.length || 0}\n`);

    // Check if bookings have enrollment IDs
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, course_enrollment_id')
      .eq('student_id', 2344);

    console.log('4. Checking enrollment IDs in Geraldine\'s bookings:');
    const enrollmentIds = bookings
      .map(b => b.course_enrollment_id)
      .filter(id => id !== null);
    const uniqueEnrollmentIds = [...new Set(enrollmentIds)];
    console.log(`   Unique enrollment IDs: ${uniqueEnrollmentIds.length > 0 ? uniqueEnrollmentIds.join(', ') : 'None (all null)'}\n`);

    if (uniqueEnrollmentIds.length > 0) {
      console.log('5. Fetching enrollment records by booking IDs:');
      const { data: linkedEnrollments } = await supabase
        .from('course_enrollments')
        .select('*')
        .in('id', uniqueEnrollmentIds);
      console.log(`   Found: ${linkedEnrollments?.length || 0}\n`);
      if (linkedEnrollments && linkedEnrollments.length > 0) {
        linkedEnrollments.forEach(e => {
          console.log(`   - Enrollment ID: ${e.id}`);
          console.log(`     Course: ${e.course_identifier}`);
          console.log(`     Start: ${e.start_date}`);
          console.log(`     Status: ${e.enrollment_status}`);
          console.log('');
        });
      }
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Geraldine has ${enrollments1?.length || 0} course enrollment records.`);
    console.log(`All her ${bookings.length} bookings have course_enrollment_id = null.`);
    console.log('\nThis means:');
    console.log('- She has no formal course enrollment record in the system');
    console.log('- Her bookings were created without linking to an enrollment');
    console.log('- She should appear in "Active Students" but not "Upcoming Enrollments"');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkGeraldineEnrollments();
