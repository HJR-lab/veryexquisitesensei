require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function analyzeMeghnaBreakdown() {
  try {
    console.log('=== Analyzing Meghna Booking Breakdown ===\n');

    const meghnaId = 1226;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all bookings with detailed analysis
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
      .in('status', ['booked', 'attended', 'completed'])
      .order('class_instances(class_date)', { ascending: true });

    console.log(`=== ALL BOOKINGS (${bookings.length}) ===`);

    let pastAttended = 0;
    let currentFutureBooked = 0;
    let currentFutureAttended = 0;

    bookings.forEach((booking, i) => {
      const classDate = new Date(booking.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      const isPast = classDate < today;
      const isToday = classDate.getTime() === today.getTime();

      console.log(`${i + 1}. ${booking.class_instances.class_type}`);
      console.log(`   Date: ${booking.class_instances.class_date}`);
      console.log(`   Status: ${booking.status}`);
      console.log(`   Category: ${isPast ? 'PAST' : (isToday ? 'TODAY' : 'FUTURE')}`);

      if (isPast) {
        if (booking.status === 'attended') {
          pastAttended++;
        }
      } else {
        // Current and future
        if (booking.status === 'attended') {
          currentFutureAttended++;
        } else if (booking.status === 'booked') {
          currentFutureBooked++;
        }
      }
      console.log('');
    });

    console.log(`=== BREAKDOWN ANALYSIS ===`);
    console.log(`Past attended: ${pastAttended}`);
    console.log(`Current/Future booked: ${currentFutureBooked}`);
    console.log(`Current/Future attended: ${currentFutureAttended}`);
    console.log(`Total current/future: ${currentFutureBooked + currentFutureAttended}`);

    console.log(`\n=== CURRENT DASHBOARD SHOWS ===`);
    console.log(`Booked: 8 (current + future bookings)`);
    console.log(`Available: 4`);
    console.log(`Attended: 16 (all past bookings)`);
    console.log(`Remaining: 4`);

    console.log(`\n=== DESIRED BREAKDOWN ===`);
    console.log(`Booked: 12 (should be ALL current/future including attended today?)`);
    console.log(`Available: 0`);
    console.log(`Attended: 4`);
    console.log(`Remaining: 8`);

    // Active enrollments for context
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', meghnaId)
      .eq('status', 'active');

    const totalClasses = enrollments.reduce((sum, e) => sum + (e.number_of_weeks || 6), 0);

    console.log(`\n=== CONTEXT ===`);
    console.log(`Total classes in active enrollments: ${totalClasses}`);
    console.log(`Total bookings (all time): ${bookings.length}`);
    console.log(`Current/future bookings: ${currentFutureBooked + currentFutureAttended}`);

    // What should the logic be?
    console.log(`\n=== PROPOSED LOGIC ===`);
    console.log(`Total Classes: ${totalClasses} (from active enrollments)`);
    console.log(`Booked: ${currentFutureBooked + currentFutureAttended} (current + future)`);
    console.log(`Available: ${totalClasses - (currentFutureBooked + currentFutureAttended)}`);
    console.log(`Attended: ${pastAttended} (past classes only)`);
    console.log(`Remaining: ${totalClasses - pastAttended} (total - past attended)`);

  } catch (error) {
    console.error('Error:', error);
  }
}

analyzeMeghnaBreakdown().then(() => process.exit());