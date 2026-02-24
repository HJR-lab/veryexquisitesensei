require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixMitchellCourseIdentifier() {
  try {
    // Find Mitchell's customer ID
    const { data: mitchell } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    if (!mitchell) {
      console.log('❌ Mitchell not found');
      return;
    }

    console.log('=== Mitchell Chan ===');
    console.log(`ID: ${mitchell.id}`);
    console.log(`Name: ${mitchell.first_name} ${mitchell.last_name}`);
    console.log(`Email: ${mitchell.email}\n`);

    // Get all enrollments
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
      console.log(`   Package Total: ${e.package_total_courses || 'NULL'}`);
      console.log(`   Created: ${e.created_at}`);
      console.log('');
    });

    // Update the most recent individual course (non-package) with the identifier
    const individualCourses = enrollments.filter(e => !e.package_total_courses || e.package_total_courses === null);

    if (individualCourses.length > 0) {
      const targetEnrollment = individualCourses[0]; // Most recent individual course

      console.log(`=== Updating Enrollment ID: ${targetEnrollment.id} ===`);
      console.log(`Setting course_identifier to: WT1701PM_DL6`);

      const { error: updateError } = await supabase
        .from('course_enrollments')
        .update({
          course_identifier: 'WT1701PM_DL6'
        })
        .eq('id', targetEnrollment.id);

      if (updateError) {
        console.error('❌ Error updating:', updateError);
      } else {
        console.log('✅ Successfully updated course identifier!');
      }
    } else {
      console.log('❌ No individual courses found to update');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

fixMitchellCourseIdentifier();