require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function findStudentsWithMultipleCourses() {
  console.log('Finding students with multiple course enrollments...\n');

  // Get all students with more than 1 enrollment
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('student_id, status')
    .order('student_id', { ascending: true });

  // Group by student
  const studentCounts = {};
  enrollments.forEach(e => {
    if (!studentCounts[e.student_id]) {
      studentCounts[e.student_id] = { total: 0, active: 0 };
    }
    studentCounts[e.student_id].total++;
    if (e.status === 'active') {
      studentCounts[e.student_id].active++;
    }
  });

  // Find students with multiple courses and at least one active
  const candidates = Object.entries(studentCounts)
    .filter(([id, counts]) => counts.total > 1 && counts.active > 0)
    .slice(0, 5); // Get first 5

  console.log(`Found ${candidates.length} students with multiple courses and active enrollment:\n`);

  for (const [studentId, counts] of candidates) {
    // Get student name
    const { data: customer } = await supabase
      .from('customers')
      .select('first_name, last_name, email')
      .eq('id', studentId)
      .single();

    if (customer) {
      console.log(`${customer.first_name} ${customer.last_name} (ID: ${studentId})`);
      console.log(`  Email: ${customer.email}`);
      console.log(`  Total enrollments: ${counts.total}, Active: ${counts.active}\n`);
    }
  }
}

findStudentsWithMultipleCourses().then(() => process.exit());
