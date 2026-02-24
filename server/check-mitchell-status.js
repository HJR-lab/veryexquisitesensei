require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkMitchellStatus() {
  try {
    const { data: mitchell } = await supabase
      .from('customers')
      .select('id')
      .eq('email', 'Mitchell.chandx@gmail.com')
      .single();

    console.log('=== Mitchell Current Enrollments Status ===\n');

    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', mitchell.id)
      .order('created_at', { ascending: false });

    enrollments.forEach((e, i) => {
      console.log(`${i + 1}. ID: ${e.id}, Status: ${e.status}`);
      console.log(`   Title: ${e.course_title}`);
      console.log(`   Identifier: ${e.course_identifier || 'NULL'}`);
      console.log(`   Package: ${e.package_total_courses || 'NULL'}`);
      console.log(`   Created: ${e.created_at}`);
      console.log('');
    });

    // Check which ones should show on dashboard
    console.log('=== SHOULD SHOW ON DASHBOARD ===');
    const activeOnly = enrollments.filter(e => e.status === 'active');
    console.log(`Active enrollments: ${activeOnly.length}`);
    activeOnly.forEach(e => {
      console.log(`  - ${e.course_title} (${e.course_identifier || 'NULL'})`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

checkMitchellStatus().then(() => process.exit());