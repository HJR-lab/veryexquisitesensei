require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

/**
 * Enroll Thalia Nawi and Huiting Koh in ALL WT2201NT_JL6 classes
 * (Thursday nights with Joyce Lim, 6-week course starting Jan 22, 2026)
 * Admin will handle makeup scheduling for missed classes
 */

async function enrollStudentsInAllClasses() {
  console.log('=== ENROLLING THALIA & HUITING IN WT2201NT_JL6 ===\n');

  const students = [
    { id: 2320, name: 'Thalia Nawi', enrollmentId: 4912 },
    { id: 1137, name: 'Huiting Koh', enrollmentId: 5047 }
  ];

  // Course details: WT2201NT_JL6
  // WT = Wheelthrowing, 2201 = Jan 22, NT = Night, JL = Joyce Lim, 6 = 6 weeks
  const courseStartDate = new Date('2026-01-22');
  const instructor = 'Joyce Lim';
  const startTime = '19:00'; // 7:00pm night class
  const endTime = '21:30'; // 9:30pm
  const room = '1'; // Main studio

  // Generate 6 Thursday class dates
  const classDates = [];
  for (let i = 0; i < 6; i++) {
    const classDate = new Date(courseStartDate);
    classDate.setDate(classDate.getDate() + (i * 7)); // Add 7 days for each week
    classDates.push(classDate);
  }

  console.log('Target classes:');
  classDates.forEach((date, i) => {
    console.log(`  Week ${i + 1}: ${date.toLocaleDateString('en-SG')} (Thursday)`);
  });
  console.log('');

  // Check if classes already exist, if not create them
  const classInstances = [];

  for (let i = 0; i < classDates.length; i++) {
    const classDate = classDates[i];
    const classDateStr = classDate.toISOString().split('T')[0];
    const classType = `WT2201NT_JL6.${i + 1}`; // WT2201NT_JL6.1, .2, .3, etc.

    // Check if class exists
    const { data: existing } = await supabase
      .from('class_instances')
      .select('*')
      .eq('class_date', classDateStr)
      .eq('class_type', classType)
      .maybeSingle();

    if (existing) {
      console.log(`✓ Class ${i + 1} already exists (ID: ${existing.id})`);
      classInstances.push(existing);
    } else {
      // Create class
      console.log(`Creating class ${i + 1}...`);
      const { data: newClass, error } = await supabase
        .from('class_instances')
        .insert([{
          class_date: classDateStr,
          class_type: classType,
          start_time: startTime,
          end_time: endTime,
          instructor: instructor,
          room: room,
          max_capacity: 10,
          current_capacity: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) {
        console.error(`  ❌ Error creating class ${i + 1}:`, error.message);
      } else {
        console.log(`  ✅ Created class ${i + 1} (ID: ${newClass.id})`);
        classInstances.push(newClass);
      }
    }
  }

  console.log(`\nTotal classes ready: ${classInstances.length}\n`);

  // Now enroll both students in ALL classes
  for (const student of students) {
    console.log(`Enrolling ${student.name} (ID: ${student.id})...`);

    let enrolled = 0;
    let skipped = 0;

    for (let i = 0; i < classInstances.length; i++) {
      const classInstance = classInstances[i];

      // Check if already enrolled
      const { data: existing } = await supabase
        .from('bookings')
        .select('id')
        .eq('student_id', student.id)
        .eq('class_instance_id', classInstance.id)
        .maybeSingle();

      if (existing) {
        console.log(`  Week ${i + 1}: Already booked`);
        skipped++;
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
        console.log(`  Week ${i + 1}: ❌ ${error.message}`);
      } else {
        console.log(`  Week ${i + 1}: ✅ Booked`);
        enrolled++;

        // Update class capacity
        await supabase
          .from('class_instances')
          .update({
            current_capacity: classInstance.current_capacity + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', classInstance.id);
      }
    }

    console.log(`  Summary: ${enrolled} enrolled, ${skipped} already booked\n`);

    // Mark enrollment as having bookings
    if (enrolled > 0 || skipped > 0) {
      await supabase
        .from('course_enrollments')
        .update({
          bookings_created_at: new Date().toISOString(),
          start_time: startTime,
          end_time: endTime
        })
        .eq('id', student.enrollmentId);
    }
  }

  console.log('✅ Enrollment complete!');
  console.log('\nNote: Admin can now use the makeup feature to reschedule');
  console.log('any classes that were missed (Jan 22 and Jan 29).');
}

enrollStudentsInAllClasses().then(() => process.exit());
