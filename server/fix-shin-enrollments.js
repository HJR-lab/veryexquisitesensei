require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixShinEnrollments() {
  console.log('🔧 Fixing Shin N Chan enrollment ID mismatch...\n');

  try {
    const shinId = 2238;

    // Get Shin's enrollments
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', shinId)
      .order('created_at', { ascending: false });

    console.log(`📚 Shin's enrollments:`);
    enrollments.forEach(e => {
      console.log(`  ${e.id}: ${e.status} - Created: ${e.created_at}`);
    });

    // Get Shin's bookings
    const { data: bookings } = await supabase
      .from('bookings')
      .select('*, class_instances!bookings_class_instance_id_fkey(class_type, class_date)')
      .eq('student_id', shinId);

    console.log(`\n📅 Shin's bookings:`);
    bookings.forEach(b => {
      console.log(`  ${b.id}: ${b.class_instances?.class_type} on ${b.class_instances?.class_date} -> enrollment ${b.course_enrollment_id}`);
    });

    // Find the correct enrollment ID (the active one)
    const correctEnrollmentId = enrollments.find(e => e.status === 'active')?.id;

    if (!correctEnrollmentId) {
      console.log('❌ No active enrollment found for Shin');
      return;
    }

    console.log(`\n🎯 Will update all bookings to use enrollment ID: ${correctEnrollmentId}`);

    // Update all bookings to use the correct enrollment ID
    const { data: updateResult, error: updateError } = await supabase
      .from('bookings')
      .update({ course_enrollment_id: correctEnrollmentId })
      .eq('student_id', shinId)
      .select('id');

    if (updateError) {
      console.error('❌ Error updating bookings:', updateError);
      return;
    }

    console.log(`✅ Successfully updated ${updateResult.length} bookings for Shin N Chan`);
    console.log('   Booking IDs updated:', updateResult.map(b => b.id));

    // Also mark the old completed enrollment as inactive since it's not being used
    const oldEnrollmentId = enrollments.find(e => e.status === 'completed')?.id;
    if (oldEnrollmentId && oldEnrollmentId !== correctEnrollmentId) {
      console.log(`\n🗑️  Marking old enrollment ${oldEnrollmentId} as inactive...`);
      const { error: enrollmentUpdateError } = await supabase
        .from('course_enrollments')
        .update({ status: 'inactive' })
        .eq('id', oldEnrollmentId);

      if (enrollmentUpdateError) {
        console.error('Warning: Could not update old enrollment status:', enrollmentUpdateError);
      } else {
        console.log('✅ Old enrollment marked as inactive');
      }
    }

    // Verify the fix
    const { data: verifyBookings } = await supabase
      .from('bookings')
      .select('id, course_enrollment_id')
      .eq('student_id', shinId);

    console.log(`\n✅ Verification - Shin's bookings now point to:`);
    verifyBookings.forEach(b => {
      console.log(`  Booking ${b.id} -> enrollment ${b.course_enrollment_id}`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

fixShinEnrollments();