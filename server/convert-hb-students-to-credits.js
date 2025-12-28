require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function convertHBStudentsToCredits() {
  console.log('\n🔄 CONVERTING EXISTING HB STUDENTS TO CREDIT SYSTEM\n');
  console.log('==========================================\n');

  // Find all HB enrollments
  const { data: hbEnrollments, error } = await supabase
    .from('course_enrollments')
    .select('*, student:customers!course_enrollments_student_id_fkey(*)')
    .ilike('course_type', '%handbuilding%');

  if (error) {
    console.error('Error fetching HB enrollments:', error);
    process.exit(1);
  }

  console.log(`Found ${hbEnrollments?.length || 0} HB enrollments\n`);

  if (!hbEnrollments || hbEnrollments.length === 0) {
    console.log('No HB enrollments to convert\n');
    process.exit(0);
  }

  // Show current students
  console.log('Current HB students:');
  hbEnrollments.forEach(e => {
    console.log(`   ${e.student.first_name} ${e.student.last_name} (${e.student.email})`);
    console.log(`   - Course: ${e.course_variant_title}`);
    console.log(`   - Weeks: ${e.number_of_weeks}`);
    console.log(`   - Start: ${e.course_start_date}\n`);
  });

  // Update each enrollment to credit system
  for (const enrollment of hbEnrollments) {
    const credits = enrollment.number_of_weeks || 4; // Default to 4 if not specified

    console.log(`Converting: ${enrollment.student.first_name} ${enrollment.student.last_name}`);
    console.log(`   Allocating ${credits} credits...`);

    // Update enrollment with credits
    const { error: updateError } = await supabase
      .from('course_enrollments')
      .update({
        class_credits_allocated: credits,
        class_credits_used: 0,
        class_credits_remaining: credits,
        glazing_class_used: false,
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollment.id);

    if (updateError) {
      console.error(`   ✗ Error updating enrollment:`, updateError);
      continue;
    }

    console.log(`   ✓ Credits allocated: ${credits}\n`);

    // Delete any auto-created bookings for this enrollment
    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('id')
      .eq('course_enrollment_id', enrollment.id);

    if (existingBookings && existingBookings.length > 0) {
      console.log(`   Found ${existingBookings.length} auto-created bookings to remove...`);

      const { error: deleteError } = await supabase
        .from('bookings')
        .delete()
        .eq('course_enrollment_id', enrollment.id);

      if (deleteError) {
        console.error(`   ✗ Error deleting bookings:`, deleteError);
      } else {
        console.log(`   ✓ Removed ${existingBookings.length} bookings (students will self-register)\n`);
      }
    }
  }

  console.log('✅ Conversion complete!\n');

  // Verify final state
  const { data: updatedEnrollments } = await supabase
    .from('course_enrollments')
    .select('*, student:customers!course_enrollments_student_id_fkey(first_name, last_name, email)')
    .ilike('course_type', '%handbuilding%');

  console.log('Updated HB enrollments:');
  updatedEnrollments?.forEach(e => {
    console.log(`   ${e.student.first_name} ${e.student.last_name}:`);
    console.log(`   - Credits: ${e.class_credits_remaining}/${e.class_credits_allocated}`);
    console.log(`   - Glazing used: ${e.glazing_class_used ? 'Yes' : 'No'}\n`);
  });

  process.exit(0);
}

convertHBStudentsToCredits().catch(error => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
