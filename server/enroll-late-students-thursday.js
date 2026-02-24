require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

/**
 * This script handles "late enrollments" - students who purchase courses
 * after the course start date. They should be enrolled in the REMAINING
 * classes (future classes only, not past ones they missed).
 */

async function enrollLateStudents() {
  console.log('=== ENROLLING LATE STUDENTS IN THURSDAY WHEELTHROWING ===\n');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Students who need enrollment
  const lateStudents = [
    { id: 2320, name: 'Thalia Nawi', enrollmentId: 4912 },
    { id: 1137, name: 'Huiting Koh', enrollmentId: 5047 },
    { id: 1166, name: 'Peilin Liang', enrollmentId: null } // Need to find enrollment ID
  ];

  // Find Peilin's enrollment ID
  const { data: peilinEnrollment } = await supabase
    .from('course_enrollments')
    .select('id')
    .eq('student_id', 1166)
    .eq('course_type', 'Wheelthrowing Beginner')
    .eq('schedule_pattern', 'THURSDAY')
    .eq('course_start_date', '2026-01-21')
    .single();

  if (peilinEnrollment) {
    lateStudents[2].enrollmentId = peilinEnrollment.id;
  }

  // Check what Thursday wheelthrowing classes exist
  const { data: existingClasses } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', today.toISOString())
    .ilike('class_type', '%wheel%')
    .order('class_date');

  // Filter for Thursday classes only
  const thursdayClasses = existingClasses?.filter(c => {
    const date = new Date(c.class_date);
    return date.getDay() === 4; // Thursday
  });

  if (!thursdayClasses || thursdayClasses.length === 0) {
    console.log('❌ No existing Thursday wheelthrowing classes found');
    console.log('\nSolution: Either:');
    console.log('1. Create Thursday classes manually via Admin Panel');
    console.log('2. Add a 4th student to trigger automatic cohort processing');
    console.log('3. Override the threshold and manually create classes for 3 students');
    return;
  }

  console.log(`Found ${thursdayClasses.length} Thursday wheelthrowing classes\n`);

  // Group by time slot
  const byTimeSlot = {};
  thursdayClasses.forEach(c => {
    const key = c.start_time;
    if (!byTimeSlot[key]) {
      byTimeSlot[key] = [];
    }
    byTimeSlot[key].push(c);
  });

  console.log('Available Thursday time slots:');
  Object.entries(byTimeSlot).forEach(([time, classes]) => {
    console.log(`  ${time}: ${classes.length} classes`);
  });
  console.log('');

  // Ask which time slot to use (for manual confirmation)
  const timeSlot = Object.keys(byTimeSlot)[0]; // Use first available
  const classesToBook = byTimeSlot[timeSlot].slice(0, 6); // Book first 6 classes (6-week course)

  console.log(`\nEnrolling students in ${timeSlot} Thursday classes:`);
  console.log(`Total classes to book: ${classesToBook.length}\n`);

  for (const student of lateStudents) {
    if (!student.enrollmentId) {
      console.log(`❌ ${student.name}: No enrollment found, skipping`);
      continue;
    }

    console.log(`Enrolling ${student.name} (ID: ${student.id})...`);

    let successCount = 0;
    let errorCount = 0;

    for (const classInstance of classesToBook) {
      try {
        // Check if already booked
        const { data: existing } = await supabase
          .from('bookings')
          .select('id')
          .eq('student_id', student.id)
          .eq('class_instance_id', classInstance.id)
          .maybeSingle();

        if (existing) {
          console.log(`  ⏭️  ${classInstance.class_date.split('T')[0]}: Already booked`);
          continue;
        }

        // Create booking
        const { error } = await supabase
          .from('bookings')
          .insert([{
            student_id: student.id,
            class_instance_id: classInstance.id,
            course_enrollment_id: student.enrollmentId,
            booking_type: 'regular',
            status: 'booked',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);

        if (error) {
          console.log(`  ❌ ${classInstance.class_date.split('T')[0]}: ${error.message}`);
          errorCount++;
        } else {
          console.log(`  ✅ ${classInstance.class_date.split('T')[0]}: Booked`);
          successCount++;
        }
      } catch (err) {
        console.log(`  ❌ ${classInstance.class_date.split('T')[0]}: ${err.message}`);
        errorCount++;
      }
    }

    console.log(`  Summary: ${successCount} booked, ${errorCount} errors\n`);

    // Mark enrollment as having bookings
    if (successCount > 0) {
      await supabase
        .from('course_enrollments')
        .update({ bookings_created_at: new Date().toISOString() })
        .eq('id', student.enrollmentId);
    }
  }

  console.log('\n✅ Late enrollment complete!');
}

enrollLateStudents().then(() => process.exit());
