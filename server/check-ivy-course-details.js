require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkIvyCourse() {
  const ivyId = 1186;

  // Get Ivy's active enrollment
  const { data: enrollment } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', ivyId)
    .eq('status', 'active')
    .single();

  console.log('Active Enrollment:', enrollment);

  // Get bookings for this enrollment
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      *,
      class_instances!bookings_class_instance_id_fkey (
        id,
        class_date,
        class_type,
        instructor,
        start_time,
        end_time
      )
    `)
    .eq('student_id', ivyId)
    .eq('course_enrollment_id', enrollment.id)
    .order('class_instances(class_date)', { ascending: true });

  console.log('\nBookings:');
  bookings.forEach(b => {
    console.log(`  ${b.class_instances.class_date} - ${b.class_instances.instructor} (${b.class_instances.start_time})`);
  });

  // Get first booking's instructor
  if (bookings.length > 0) {
    const instructor = bookings[0].class_instances.instructor;
    console.log(`\n✅ Instructor: ${instructor}`);

    // Update enrollment with instructor
    const { error } = await supabase
      .from('course_enrollments')
      .update({ instructor: instructor })
      .eq('id', enrollment.id);

    if (!error) {
      console.log('✅ Updated enrollment with instructor');
    }
  }
}

checkIvyCourse().then(() => process.exit());
