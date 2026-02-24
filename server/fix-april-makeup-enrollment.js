require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixAprilMakeupEnrollment() {
  console.log('=== FIXING APRIL\'S MAKEUP BOOKING ENROLLMENT ===\n');

  const aprilId = 1182;
  const activeEnrollmentId = 4781;

  // Find the makeup booking - get all bookings and filter
  const { data: allBookings } = await supabase
    .from('bookings')
    .select(`
      id,
      course_enrollment_id,
      class_instance:class_instances!bookings_class_instance_id_fkey (
        id,
        class_date,
        class_type
      )
    `)
    .eq('student_id', aprilId);

  const makeupBooking = allBookings?.find(b =>
    b.class_instance?.class_type === 'WT2201NT_JL6.2'
  );

  if (!makeupBooking) {
    console.log('❌ Makeup booking not found');
    return;
  }

  console.log('Found makeup booking:', {
    id: makeupBooking.id,
    date: makeupBooking.class_instance.class_date,
    type: makeupBooking.class_instance.class_type,
    current_enrollment_id: makeupBooking.course_enrollment_id || 'NULL'
  });

  if (makeupBooking.course_enrollment_id === activeEnrollmentId) {
    console.log('\n✅ Already linked to correct enrollment');
    return;
  }

  // Update the booking to link it to the active enrollment
  console.log(`\nUpdating enrollment_id from ${makeupBooking.course_enrollment_id || 'NULL'} to ${activeEnrollmentId}...`);

  const { error } = await supabase
    .from('bookings')
    .update({ course_enrollment_id: activeEnrollmentId })
    .eq('id', makeupBooking.id);

  if (error) {
    console.log('❌ Error updating booking:', error.message);
    return;
  }

  console.log('✅ Successfully updated makeup booking enrollment!');
  console.log('\nApril should now see 7 bookings:');
  console.log('  1. WT2001NT_JL6.1 (Jan 20 Tue) - attended');
  console.log('  2. WT2001NT_JL6.2 (Jan 27 Tue) - cancelled');
  console.log('  3. WT2201NT_JL6.2 (Jan 29 Thu) - makeup ✅');
  console.log('  4. WT2001NT_JL6.3 (Feb 3 Tue) - booked');
  console.log('  5. WT2001NT_JL6.4 (Feb 10 Tue) - booked');
  console.log('  6. WT2001NT_JL6.5 (Feb 24 Tue) - booked');
  console.log('  7. WT2001NT_JL6.6 (Mar 3 Tue) - booked');
}

fixAprilMakeupEnrollment().then(() => process.exit());
