require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function removeNACourse() {
  try {
    console.log('=== Removing the N/A Course Identifier Enrollment ===\n');

    // Find Mitchell's customer ID
    const { data: mitchell } = await supabase
      .from('customers')
      .select('id')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    // Check current enrollments
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', mitchell.id)
      .order('created_at', { ascending: false });

    console.log('=== Current Enrollments ===');
    enrollments.forEach((e, i) => {
      console.log(`${i + 1}. ID: ${e.id}, Status: ${e.status}`);
      console.log(`   Title: ${e.course_title}`);
      console.log(`   Identifier: ${e.course_identifier || 'NULL'}`);
      console.log(`   Package: ${e.package_total_courses || 'NULL'}`);
      console.log('');
    });

    // Find the enrollment with NULL course_identifier that's causing the N/A display
    const naEnrollment = enrollments.find(e =>
      !e.course_identifier &&
      !e.package_total_courses &&
      e.course_title === 'Wheelthrowing Beginner/Ext 6 Weeks'
    );

    if (naEnrollment) {
      console.log(`Found N/A enrollment: ID ${naEnrollment.id}`);
      console.log(`Current status: ${naEnrollment.status}`);

      // Permanently set it to completed if it's not already
      if (naEnrollment.status !== 'completed') {
        console.log('Setting N/A enrollment to completed...');

        const { error } = await supabase
          .from('course_enrollments')
          .update({ status: 'completed' })
          .eq('id', naEnrollment.id);

        if (error) {
          console.error('Error updating enrollment:', error);
          return;
        }

        console.log('✅ N/A enrollment set to completed!');
      } else {
        console.log('N/A enrollment is already completed.');
      }

      // Double-check there are no bookings associated with this enrollment
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, status')
        .eq('course_enrollment_id', naEnrollment.id);

      if (bookings && bookings.length > 0) {
        console.log(`⚠️  WARNING: Found ${bookings.length} bookings still linked to N/A enrollment:`);
        bookings.forEach(b => {
          console.log(`  - Booking ID: ${b.id}, Status: ${b.status}`);
        });
        console.log('These bookings should be reassigned or cancelled.');
      } else {
        console.log('✅ No bookings linked to N/A enrollment.');
      }
    } else {
      console.log('No N/A enrollment found.');
    }

    // Verify final active enrollments
    console.log('\n=== Final Active Enrollments ===');
    const { data: activeEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', mitchell.id)
      .eq('status', 'active');

    console.log(`Active enrollments: ${activeEnrollments.length}`);
    activeEnrollments.forEach(e => {
      console.log(`  - ${e.course_title} (${e.course_identifier || 'NULL'})`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

removeNACourse().then(() => process.exit());