require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createIvyEnrollment() {
  const ivyId = 1186;

  console.log('Creating completed course enrollment for Ivy...');

  const { data, error } = await supabase
    .from('course_enrollments')
    .insert({
      student_id: ivyId,
      course_title: 'Wheelthrowing Beginner/Ext 6 Weeks (Completed)',
      course_identifier: null,
      course_start_date: null,
      course_end_date: null,
      status: 'completed',
      instructor: 'VES Instructor'
    })
    .select();

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('✅ Created enrollment:', data[0]);
  }

  // Verify
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', ivyId);

  console.log(`\nIvy now has ${enrollments.length} enrollments`);
}

createIvyEnrollment().then(() => process.exit());
