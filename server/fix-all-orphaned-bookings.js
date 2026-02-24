require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixAllOrphanedBookings() {
  console.log('Finding all students with orphaned bookings (course_enrollment_id = null)...\n');

  // Get all orphaned bookings
  const { data: orphanedBookings } = await supabase
    .from('bookings')
    .select(`
      student_id,
      class_instances!bookings_class_instance_id_fkey (
        class_type,
        class_date,
        instructor
      )
    `)
    .is('course_enrollment_id', null);

  if (!orphanedBookings || orphanedBookings.length === 0) {
    console.log('✅ No orphaned bookings found!');
    return;
  }

  // Group by student
  const studentGroups = {};
  orphanedBookings.forEach(b => {
    if (!studentGroups[b.student_id]) {
      studentGroups[b.student_id] = [];
    }
    studentGroups[b.student_id].push(b);
  });

  console.log(`Found ${Object.keys(studentGroups).length} students with orphaned bookings:\n`);

  let fixedStudents = 0;
  let fixedBookings = 0;

  for (const [studentId, bookings] of Object.entries(studentGroups)) {
    // Get student name
    const { data: customer } = await supabase
      .from('customers')
      .select('first_name, last_name, email')
      .eq('id', studentId)
      .single();

    if (!customer) continue;

    console.log(`\n${customer.first_name} ${customer.last_name} (${customer.email})`);
    console.log(`  ${bookings.length} orphaned bookings`);

    // Get date range
    const dates = bookings.map(b => new Date(b.class_instances.class_date)).sort((a, b) => a - b);
    const startDate = dates[0].toISOString().split('T')[0];
    const endDate = dates[dates.length - 1].toISOString().split('T')[0];
    const instructor = bookings[0].class_instances.instructor || 'VES Instructor';
    const classType = bookings[0].class_instances.class_type;

    // Determine course type from class_type
    let courseIdentifier = null;
    let courseTitle = 'Course';
    if (classType) {
      if (classType.match(/^WT/)) {
        courseTitle = 'Wheelthrowing Beginner/Ext 6 Weeks';
        courseIdentifier = classType;
      } else if (classType.match(/^HB/)) {
        courseTitle = 'Handbuilding 4 Weeks';
        courseIdentifier = classType;
      }
    }

    console.log(`  Course: ${courseTitle} (${startDate} to ${endDate})`);
    console.log(`  Instructor: ${instructor}`);

    // Create completed course enrollment
    const { data: newEnrollment, error: enrollmentError } = await supabase
      .from('course_enrollments')
      .insert({
        student_id: parseInt(studentId),
        course_title: courseTitle,
        course_identifier: courseIdentifier,
        course_start_date: startDate,
        course_end_date: endDate,
        status: 'completed',
        instructor: instructor,
        created_at: startDate
      })
      .select()
      .single();

    if (enrollmentError) {
      console.error(`  ❌ Error creating enrollment:`, enrollmentError.message);
      continue;
    }

    console.log(`  ✅ Created completed enrollment: ID ${newEnrollment.id}`);

    // Link all orphaned bookings to this enrollment
    const { data: updated, error: updateError } = await supabase
      .from('bookings')
      .update({ course_enrollment_id: newEnrollment.id })
      .eq('student_id', parseInt(studentId))
      .is('course_enrollment_id', null)
      .select();

    if (updateError) {
      console.error(`  ❌ Error updating bookings:`, updateError.message);
      continue;
    }

    console.log(`  ✅ Linked ${updated.length} bookings to enrollment`);

    fixedStudents++;
    fixedBookings += updated.length;
  }

  console.log(`\n========================================`);
  console.log(`✅ Fixed ${fixedStudents} students`);
  console.log(`✅ Linked ${fixedBookings} orphaned bookings`);
  console.log(`========================================\n`);
}

fixAllOrphanedBookings().then(() => process.exit());
