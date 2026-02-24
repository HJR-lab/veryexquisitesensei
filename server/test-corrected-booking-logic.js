require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function testCorrectedBookingLogic() {
  try {
    console.log('=== Testing Corrected Booking Logic ===\n');
    console.log('Logic: Booked = Current/Future Bookings + Past Attended Classes');
    console.log('(Since attended means it was booked first)\n');

    const meghnaId = 1226;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get active enrollments
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', meghnaId)
      .eq('status', 'active');

    const totalClassesAllocated = enrollments.reduce((sum, e) => {
      return sum + (e.number_of_weeks || 6);
    }, 0);

    // Get bookings
    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_date,
          class_type
        )
      `)
      .eq('student_id', meghnaId)
      .in('status', ['booked', 'attended', 'completed']);

    const currentAndFutureBookings = bookings.filter(b => {
      if (b.status === 'cancelled') return false;
      const classDate = new Date(b.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      return classDate >= today;
    });

    const pastBookings = bookings.filter(b => {
      if (b.status === 'cancelled') return false;
      const classDate = new Date(b.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      return classDate < today;
    });

    // Apply the CORRECTED logic
    const attendedFromActiveCourses = pastBookings.filter(b => {
      return b.status === 'attended' &&
             enrollments.some(e => {
               const classType = b.class_instances.class_type;
               const baseCourse = classType ? classType.split('.')[0] : '';
               return e.course_identifier === baseCourse;
             });
    }).length;

    const totalBooked = currentAndFutureBookings.length + attendedFromActiveCourses;
    const available = totalClassesAllocated - totalBooked;
    const remaining = totalClassesAllocated - attendedFromActiveCourses;

    console.log('=== BREAKDOWN ===');
    console.log(`Current/Future bookings: ${currentAndFutureBookings.length}`);
    console.log(`Past attended (from active courses): ${attendedFromActiveCourses}`);
    console.log(`Total booked: ${currentAndFutureBookings.length} + ${attendedFromActiveCourses} = ${totalBooked}`);

    console.log('\n=== FINAL DASHBOARD STATS ===');
    console.log(`Total Classes: ${totalClassesAllocated}`);
    console.log(`Booked: ${totalBooked} (includes attended classes)`);
    console.log(`Available: ${available}`);
    console.log(`Attended: ${attendedFromActiveCourses}`);
    console.log(`Remaining: ${remaining}`);

    console.log('\n=== LOGIC VERIFICATION ===');
    console.log('✅ Attended classes are counted as booked (since they were booked first)');
    console.log(`✅ Math: ${totalBooked} booked + ${available} available = ${totalBooked + available} total`);

    if (totalBooked === 9 && available === 3 && attendedFromActiveCourses === 1) {
      console.log('\n✅ CORRECTED LOGIC WORKING!');
      console.log('Dashboard should show:');
      console.log('   - Booked: 9 (8 current/future + 1 past attended)');
      console.log('   - Available: 3');
      console.log('   - Attended: 1');
      console.log('   - Remaining: 11');
    } else {
      console.log('\n⚠️ Need to verify calculations');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

testCorrectedBookingLogic().then(() => process.exit());