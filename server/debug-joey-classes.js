require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function debugJoeyClasses() {
  const email = 'joey.lee2302@gmail.com';

  console.log('\n=== DEBUGGING JOEY CLASSES ===\n');

  // Get customer
  const { data: customer } = await supabase
    .from('customers')
    .select('id, email, first_name, last_name, classes_allocated')
    .eq('email', email)
    .single();

  console.log('Customer:', customer);

  // Get active enrollments
  const { data: activeEnrollments } = await supabase
    .from('course_enrollments')
    .select('id, status, course_title')
    .eq('student_id', customer.id)
    .eq('status', 'active');

  console.log('\nActive Enrollments:', activeEnrollments);

  if (activeEnrollments && activeEnrollments.length > 0) {
    const enrollmentIds = activeEnrollments.map(e => e.id);

    // Get bookings WITH class instance data
    // Use explicit relationship to avoid ambiguity
    const { data: currentBookings, error } = await supabase
      .from('bookings')
      .select('id, status, class_instance:class_instances!bookings_class_instance_id_fkey(class_date, end_time)')
      .eq('student_id', customer.id)
      .in('course_enrollment_id', enrollmentIds)
      .in('status', ['booked', 'attended']);

    console.log('\nBookings Query Error:', error);
    console.log('\nBookings with class_instance:', JSON.stringify(currentBookings, null, 2));

    if (currentBookings) {
      console.log('\n=== ANALYZING EACH BOOKING ===');
      const now = new Date();
      console.log('Current time:', now.toISOString());

      currentBookings.forEach((b, index) => {
        console.log(`\nBooking ${index + 1}:`);
        console.log('  ID:', b.id);
        console.log('  Status:', b.status);
        console.log('  class_instance:', b.class_instance);

        if (!b.class_instance) {
          console.log('  ❌ No class_instance data');
          return;
        }

        const classDate = b.class_instance.class_date.split('T')[0];
        const endTime = b.class_instance.end_time;
        console.log('  Class date:', classDate);
        console.log('  End time:', endTime);

        const timeParts = endTime.match(/(\d+):(\d+)(am|pm)/i);
        if (!timeParts) {
          console.log('  ❌ Could not parse end time');
          return;
        }

        let hours = parseInt(timeParts[1]);
        const minutes = parseInt(timeParts[2]);
        const period = timeParts[3].toLowerCase();

        if (period === 'pm' && hours !== 12) hours += 12;
        if (period === 'am' && hours === 12) hours = 0;

        const [year, month, day] = classDate.split('-');
        const classEndDateTime = new Date(year, month - 1, day, hours, minutes);

        console.log('  Class end datetime:', classEndDateTime.toISOString());
        console.log('  Has ended?:', classEndDateTime < now);
      });

      const endedCount = currentBookings.filter(b => {
        if (!b.class_instance) return false;
        const classDate = b.class_instance.class_date.split('T')[0];
        const endTime = b.class_instance.end_time;

        const timeParts = endTime.match(/(\d+):(\d+)(am|pm)/i);
        if (!timeParts) return false;

        let hours = parseInt(timeParts[1]);
        const minutes = parseInt(timeParts[2]);
        const period = timeParts[3].toLowerCase();

        if (period === 'pm' && hours !== 12) hours += 12;
        if (period === 'am' && hours === 12) hours = 0;

        const [year, month, day] = classDate.split('-');
        const classEndDateTime = new Date(year, month - 1, day, hours, minutes);

        return classEndDateTime < now;
      }).length;

      console.log('\n=== RESULT ===');
      console.log('Total bookings:', currentBookings.length);
      console.log('Ended classes:', endedCount);
    }
  }
}

debugJoeyClasses().then(() => process.exit());
