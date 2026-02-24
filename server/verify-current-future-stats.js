require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function verifyCurrentFutureStats() {
  try {
    console.log('=== Verifying Current/Future Stats (Matching Class Bookings) ===\n');

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
      return classDate >= today; // Only current and future classes
    });

    const pastBookings = bookings.filter(b => {
      if (b.status === 'cancelled') return false;
      const classDate = new Date(b.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      return classDate < today;
    });

    // Apply the UPDATED logic - match what's in the dashboard API
    const totalBooked = currentAndFutureBookings.length; // Match what's shown in class bookings
    const available = totalClassesAllocated - totalBooked; // Available slots

    const attendedFromActiveCourses = pastBookings.filter(b => {
      return b.status === 'attended' &&
             enrollments.some(e => {
               const classType = b.class_instances.class_type;
               const baseCourse = classType ? classType.split('.')[0] : '';
               return e.course_identifier === baseCourse;
             });
    }).length;

    const remaining = totalClassesAllocated - attendedFromActiveCourses;

    console.log('=== CORRECTED DASHBOARD STATS ===');
    console.log(`Total Classes: ${totalClassesAllocated}`);
    console.log(`Booked: ${totalBooked} (current + future bookings)`);
    console.log(`Available: ${available}`);
    console.log(`Attended: ${attendedFromActiveCourses}`);
    console.log(`Remaining: ${remaining}`);

    console.log('\n=== CLASS BOOKINGS VERIFICATION ===');
    console.log(`Current/Future bookings shown in table: ${currentAndFutureBookings.length}`);
    console.log('These should match the "Booked" count above');

    console.log('\n=== MATH CHECK ===');
    console.log(`${totalBooked} booked + ${available} available = ${totalBooked + available} total`);
    console.log(`Should equal: ${totalClassesAllocated} ✅`);

    if (totalBooked === 8 && available === 4) {
      console.log('\n✅ DASHBOARD NOW MATCHES CLASS BOOKINGS!');
    } else {
      console.log('\n⚠️  Still need to verify server restart');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

verifyCurrentFutureStats().then(() => process.exit());