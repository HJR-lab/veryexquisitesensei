require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function updateAllInstructors() {
  console.log('Updating instructors for all active enrollments...\n');

  // Get all active enrollments without instructor
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_title, instructor')
    .eq('status', 'active')
    .is('instructor', null);

  console.log(`Found ${enrollments.length} enrollments without instructor\n`);

  let updated = 0;

  for (const enrollment of enrollments) {
    // Get first booking to find instructor
    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        class_instances!bookings_class_instance_id_fkey (
          instructor
        )
      `)
      .eq('course_enrollment_id', enrollment.id)
      .limit(1);

    if (bookings && bookings.length > 0 && bookings[0].class_instances?.instructor) {
      const instructor = bookings[0].class_instances.instructor;

      const { error } = await supabase
        .from('course_enrollments')
        .update({ instructor: instructor })
        .eq('id', enrollment.id);

      if (!error) {
        console.log(`✅ Updated enrollment ${enrollment.id}: ${instructor}`);
        updated++;
      }
    }
  }

  console.log(`\n✅ Updated ${updated} enrollments with instructor names`);
}

updateAllInstructors().then(() => process.exit());
