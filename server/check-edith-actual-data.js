require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkEdithActualData() {
  console.log('\n=== CHECKING EDITH\'S ACTUAL DATA AFTER SYNC ===\n');

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('email', 'edithlmq@gmail.com')
    .single();

  console.log('Customer ID:', customer.id);

  // Get enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', customer.id)
    .order('course_start_date', { ascending: false });

  console.log(`\n📋 ENROLLMENTS: ${enrollments?.length || 0}\n`);
  enrollments?.forEach((e, i) => {
    console.log(`${i + 1}. Enrollment ID: ${e.id}`);
    console.log(`   Course: ${e.course_title}`);
    console.log(`   Type: ${e.course_type}`);
    console.log(`   Identifier: ${e.course_identifier}`);
    console.log(`   Start: ${e.course_start_date}`);
    console.log(`   End: ${e.course_end_date}`);
    console.log(`   Weeks: ${e.number_of_weeks}`);
    console.log(`   Instructor: ${e.instructor || 'N/A'}`);
    console.log(`   Status: ${e.status}`);
    console.log('');
  });

  // Get all bookings with class details
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      attended,
      course_enrollment_id,
      class_instances!bookings_class_instance_id_fkey (
        id,
        class_type,
        class_date,
        start_time,
        end_time,
        instructor_name
      )
    `)
    .eq('student_id', customer.id)
    .order('class_instances(class_date)', { ascending: true });

  console.log(`\n📚 BOOKINGS: ${bookings?.length || 0}\n`);

  // Group by enrollment
  enrollments?.forEach((enrollment) => {
    const enrollmentBookings = bookings?.filter(b => b.course_enrollment_id === enrollment.id) || [];

    console.log(`\n📘 ${enrollment.course_identifier} (Enrollment ${enrollment.id})`);
    console.log(`   Total Bookings: ${enrollmentBookings.length}`);

    const attendedCount = enrollmentBookings.filter(b => b.attended === true).length;
    const now = new Date();
    const endedCount = enrollmentBookings.filter(b => {
      if (!b.class_instances) return false;
      const classDate = b.class_instances.class_date.split('T')[0];
      const endTime = b.class_instances.end_time;
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

    console.log(`   Attended (field): ${attendedCount}`);
    console.log(`   Ended (calculated): ${endedCount}`);
    console.log(`   Instructor: ${enrollment.instructor || 'From class instances'}`);

    console.log('\n   Classes:');
    enrollmentBookings.forEach((b, idx) => {
      const ci = b.class_instances;
      if (!ci) return;

      const classDate = ci.class_date.split('T')[0];
      const timeParts = ci.end_time.match(/(\d+):(\d+)(am|pm)/i);
      let hasEnded = false;

      if (timeParts) {
        let hours = parseInt(timeParts[1]);
        const minutes = parseInt(timeParts[2]);
        const period = timeParts[3].toLowerCase();

        if (period === 'pm' && hours !== 12) hours += 12;
        if (period === 'am' && hours === 12) hours = 0;

        const [year, month, day] = classDate.split('-');
        const classEndDateTime = new Date(year, month - 1, day, hours, minutes);
        hasEnded = classEndDateTime < now;
      }

      console.log(`     ${idx + 1}. ${classDate} ${ci.start_time}-${ci.end_time}`);
      console.log(`        Type: ${ci.class_type}`);
      console.log(`        Status: ${b.status}`);
      console.log(`        Attended: ${b.attended ? '✅' : '❌'}`);
      console.log(`        Has Ended: ${hasEnded ? '✅' : '❌'}`);
      console.log(`        Instructor: ${ci.instructor_name || 'N/A'}`);
    });
  });

  // Check standalone bookings (no enrollment)
  const standaloneBookings = bookings?.filter(b => !b.course_enrollment_id) || [];
  if (standaloneBookings.length > 0) {
    console.log(`\n\n⚠️  STANDALONE BOOKINGS (No Enrollment): ${standaloneBookings.length}`);
    standaloneBookings.forEach(b => {
      console.log(`   - ${b.class_instances?.class_date}: ${b.class_instances?.class_type}`);
    });
  }
}

checkEdithActualData().then(() => process.exit());
