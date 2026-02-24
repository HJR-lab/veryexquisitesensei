require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkMeghnaDashboardStats() {
  try {
    console.log('=== Checking Meghna Dashboard Stats Logic ===\n');

    const meghnaId = 1226;

    // Get all bookings for Meghna
    const { data: allBookings } = await supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_date,
          class_type
        )
      `)
      .eq('student_id', meghnaId)
      .order('class_instances(class_date)', { ascending: true });

    console.log(`=== ALL BOOKINGS (${allBookings.length}) ===`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let pastBookings = 0;
    let currentUpcomingBookings = 0;

    allBookings.forEach((booking, i) => {
      const classDate = new Date(booking.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      const isPast = classDate < today;

      console.log(`${i + 1}. ${booking.class_instances.class_type}`);
      console.log(`   Date: ${booking.class_instances.class_date}`);
      console.log(`   Status: ${booking.status}`);
      console.log(`   Past: ${isPast ? 'YES' : 'NO'}`);
      console.log('');

      if (isPast) {
        pastBookings++;
      } else {
        currentUpcomingBookings++;
      }
    });

    console.log(`=== BREAKDOWN ===`);
    console.log(`Total bookings: ${allBookings.length}`);
    console.log(`Past bookings: ${pastBookings}`);
    console.log(`Current/Upcoming bookings: ${currentUpcomingBookings}`);

    console.log(`\n=== ISSUE IDENTIFICATION ===`);
    console.log(`Dashboard showing: 24 booked - 18 available`);
    console.log(`Should only show: ${currentUpcomingBookings} total (current + upcoming)`);

    // Check active enrollments
    const { data: activeEnrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', meghnaId)
      .eq('status', 'active');

    console.log(`\n=== ACTIVE ENROLLMENTS ===`);
    activeEnrollments.forEach(e => {
      console.log(`   - ${e.course_title} (${e.course_identifier})`);
    });

    // Calculate what stats should be for current/upcoming only
    const futureBookings = allBookings.filter(b => {
      const classDate = new Date(b.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      return classDate >= today && b.status !== 'cancelled';
    });

    const bookedFuture = futureBookings.filter(b => b.status === 'booked' || b.status === 'attended').length;
    const totalClassesForFuture = activeEnrollments.reduce((sum, e) => sum + (e.number_of_weeks || 6), 0);
    const availableFuture = totalClassesForFuture - bookedFuture;

    console.log(`\n=== CORRECTED STATS (Future Only) ===`);
    console.log(`Total classes allocated: ${totalClassesForFuture}`);
    console.log(`Booked (future): ${bookedFuture}`);
    console.log(`Available: ${availableFuture}`);

  } catch (error) {
    console.error('Error:', error);
  }
}

checkMeghnaDashboardStats().then(() => process.exit());