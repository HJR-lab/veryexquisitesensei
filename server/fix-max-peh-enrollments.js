require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixMaxPehEnrollments() {
  console.log('🔧 Fixing Max Peh enrollment ID mismatch...\n');

  try {
    const maxId = 1110;

    // Get Max's active enrollments
    const { data: maxEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', maxId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    console.log(`📚 Max's active enrollments (${maxEnrollments.length}):`);
    maxEnrollments.forEach(e => {
      console.log(`  ${e.id}: ${e.course_title} - Created: ${e.created_at}`);
    });

    // Get Max's bookings
    const { data: maxBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*, class_instances!bookings_class_instance_id_fkey(class_type, class_date)')
      .eq('student_id', maxId);

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      return;
    }

    console.log(`\n📅 Max's bookings (${maxBookings.length}):`);
    maxBookings.forEach(b => {
      console.log(`  ${b.id}: ${b.class_instances?.class_type} on ${b.class_instances?.class_date} -> enrollment ${b.course_enrollment_id}`);
    });

    // Find the most appropriate enrollment ID (newest one)
    const correctEnrollmentId = maxEnrollments[0]?.id;

    if (!correctEnrollmentId) {
      console.log('❌ No active enrollment found for Max');
      return;
    }

    console.log(`\n🎯 Will update all bookings to use enrollment ID: ${correctEnrollmentId}`);

    // Update all bookings to use the correct enrollment ID
    const { data: updateResult, error: updateError } = await supabase
      .from('bookings')
      .update({ course_enrollment_id: correctEnrollmentId })
      .eq('student_id', maxId)
      .select('id');

    if (updateError) {
      console.error('❌ Error updating bookings:', updateError);
      return;
    }

    console.log(`✅ Successfully updated ${updateResult.length} bookings for Max Peh`);
    console.log('   Booking IDs updated:', updateResult.map(b => b.id));

    // Verify the fix
    const { data: verifyBookings } = await supabase
      .from('bookings')
      .select('id, course_enrollment_id')
      .eq('student_id', maxId);

    console.log(`\n✅ Verification - Max's bookings now point to:`);
    verifyBookings.forEach(b => {
      console.log(`  Booking ${b.id} -> enrollment ${b.course_enrollment_id}`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

fixMaxPehEnrollments();