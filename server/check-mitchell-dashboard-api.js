require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkMitchellDashboard() {
  try {
    // Get Mitchell
    const { data: mitchell } = await supabase
      .from('customers')
      .select('*')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    console.log('=== Mitchell Chan ===');
    console.log(`ID: ${mitchell.id}`);
    console.log('');

    // Simulate what the backend endpoint does
    // Get enrollments
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', mitchell.id)
      .eq('enrollment_status', 'active')
      .order('created_at', { ascending: false });

    console.log(`Total Active Enrollments: ${enrollments.length}\n`);

    for (const enrollment of enrollments) {
      // Get bookings for this enrollment
      const { data: bookings } = await supabase
        .from('bookings')
        .select(`
          *,
          class_instances!bookings_class_instance_id_fkey (
            class_date,
            class_type,
            start_time,
            end_time
          )
        `)
        .eq('course_enrollment_id', enrollment.id);

      console.log(`Enrollment ${enrollment.id}:`);
      console.log(`  Course: ${enrollment.course_identifier || enrollment.course_title}`);
      console.log(`  Start: ${enrollment.course_start_date}`);
      console.log(`  Bookings: ${bookings?.length || 0}`);

      if (bookings && bookings.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const allDates = bookings.map(b => new Date(b.class_instances.class_date));
        const earliestDate = new Date(Math.min(...allDates));
        const latestDate = new Date(Math.max(...allDates));

        earliestDate.setHours(0, 0, 0, 0);
        latestDate.setHours(0, 0, 0, 0);

        console.log(`  First class: ${earliestDate.toISOString().split('T')[0]}`);
        console.log(`  Last class: ${latestDate.toISOString().split('T')[0]}`);
        console.log(`  Today: ${today.toISOString().split('T')[0]}`);

        let status = 'pending';
        if (earliestDate > today) {
          status = 'upcoming';
        } else if (latestDate < today) {
          status = 'completed';
        } else {
          status = 'active';
        }

        console.log(`  *** STATUS: ${status.toUpperCase()} ***`);
      } else {
        console.log(`  *** STATUS: PENDING (no bookings) ***`);
      }
      console.log('');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkMitchellDashboard();
