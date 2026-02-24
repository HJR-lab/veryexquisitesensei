require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createMissingEnrollments() {
  console.log('Finding students with missing course enrollments...\n');

  // Get all students
  const { data: students, error: studentsError } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email, course_purchase_count')
    .gt('course_purchase_count', 0);

  if (studentsError) {
    console.error('Error fetching students:', studentsError);
    return;
  }

  console.log(`Checking ${students.length} students...\n`);

  let totalCreated = 0;

  for (const student of students) {
    // Get existing enrollments
    const { data: enrollments, error: enrollError } = await supabase
      .from('course_enrollments')
      .select('id')
      .eq('student_id', student.id);

    if (enrollError) {
      console.error(`Error fetching enrollments for ${student.first_name}:`, enrollError);
      continue;
    }

    const missingCount = student.course_purchase_count - enrollments.length;

    if (missingCount > 0) {
      console.log(`${student.first_name} ${student.last_name}: ${enrollments.length} enrollments, ${student.course_purchase_count} purchased → Creating ${missingCount} completed course(s)`);

      // Create placeholder completed enrollments
      for (let i = 0; i < missingCount; i++) {
        const { error: createError } = await supabase
          .from('course_enrollments')
          .insert({
            student_id: student.id,
            course_title: 'Wheelthrowing Beginner/Ext 6 Weeks (Completed)',
            course_identifier: null,
            start_date: null,
            end_date: null,
            status: 'completed',
            classes_allocated: 6,
            classes_used: 6
          });

        if (createError) {
          console.error(`  ❌ Error creating enrollment: ${createError.message}`);
        } else {
          console.log(`  ✅ Created completed course enrollment`);
          totalCreated++;
        }
      }
    }
  }

  console.log(`\n✅ Created ${totalCreated} placeholder completed course enrollments`);
}

createMissingEnrollments().then(() => process.exit());
