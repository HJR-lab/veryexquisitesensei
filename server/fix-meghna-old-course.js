require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixMeghnaOldCourse() {
  const meghnaId = 1198;

  console.log('Fixing Meghna\'s old course enrollment...\n');

  // Get the orphaned bookings
  const { data: orphanedBookings } = await supabase
    .from('bookings')
    .select(`
      id,
      class_instances!bookings_class_instance_id_fkey (
        class_type,
        class_date,
        instructor
      )
    `)
    .eq('student_id', meghnaId)
    .is('course_enrollment_id', null);

  console.log(`Found ${orphanedBookings.length} orphaned bookings`);

  if (orphanedBookings.length > 0) {
    // Get the first and last date
    const dates = orphanedBookings.map(b => new Date(b.class_instances.class_date)).sort((a, b) => a - b);
    const startDate = dates[0].toISOString().split('T')[0];
    const endDate = dates[dates.length - 1].toISOString().split('T')[0];
    const instructor = orphanedBookings[0].class_instances.instructor;

    console.log(`Course dates: ${startDate} to ${endDate}`);
    console.log(`Instructor: ${instructor}`);

    // Create a completed course enrollment
    const { data: newEnrollment, error: enrollmentError } = await supabase
      .from('course_enrollments')
      .insert({
        student_id: meghnaId,
        course_title: 'Wheelthrowing Beginner/Ext 6 Weeks',
        course_identifier: 'WT3108AM_JL6',
        course_start_date: startDate,
        course_end_date: endDate,
        status: 'completed',
        instructor: instructor,
        created_at: new Date('2025-08-31').toISOString()
      })
      .select()
      .single();

    if (enrollmentError) {
      console.error('Error creating enrollment:', enrollmentError);
      return;
    }

    console.log(`\n✅ Created completed enrollment: ID ${newEnrollment.id}`);

    // Link all orphaned bookings to this enrollment
    const { data: updated, error: updateError } = await supabase
      .from('bookings')
      .update({ course_enrollment_id: newEnrollment.id })
      .eq('student_id', meghnaId)
      .is('course_enrollment_id', null)
      .select();

    if (updateError) {
      console.error('Error updating bookings:', updateError);
      return;
    }

    console.log(`✅ Linked ${updated.length} bookings to the completed enrollment`);

    // Verify
    const { data: verifyEnrollments } = await supabase
      .from('course_enrollments')
      .select('id, status, course_title')
      .eq('student_id', meghnaId);

    console.log(`\n✅ Meghna now has ${verifyEnrollments.length} enrollments:`);
    verifyEnrollments.forEach(e => {
      console.log(`  - ${e.course_title} (${e.status}) - ID: ${e.id}`);
    });

    // Count bookings per enrollment
    const { data: allBookings } = await supabase
      .from('bookings')
      .select('course_enrollment_id')
      .eq('student_id', meghnaId)
      .in('status', ['booked', 'attended']);

    const counts = {};
    allBookings.forEach(b => {
      const id = b.course_enrollment_id || 'null';
      counts[id] = (counts[id] || 0) + 1;
    });

    console.log('\nBookings per enrollment:');
    Object.entries(counts).forEach(([enrollmentId, count]) => {
      console.log(`  Enrollment ${enrollmentId}: ${count} bookings`);
    });
  }
}

fixMeghnaOldCourse().then(() => process.exit());
