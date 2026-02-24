require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkEnrollmentDates() {
  // Check one of the cohorts that needs classes
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('course_start_date', '2025-08-22')
    .ilike('schedule_pattern', '%SATURDAY%')
    .ilike('class_time', '%9:30am%')
    .eq('status', 'active')
    .order('created_at', { ascending: true });
    
  console.log('=== SATURDAY 9:30am-12:00pm starting 2025-08-22 (5 students) ===\n');
  
  if (enrollments) {
    enrollments.forEach((e, i) => {
      console.log(`Student ${i + 1}:`);
      console.log(`  Created: ${e.created_at}`);
      console.log(`  Bookings created: ${e.bookings_created_at || 'NOT YET'}`);
      console.log(`  Student count tracked: ${e.pending_student_count || 'unknown'}`);
      console.log();
    });
    
    console.log(`Total: ${enrollments.length} students`);
    console.log(`\nAll enrolled BEFORE automated system ran!`);
  }
  
  process.exit(0);
}

checkEnrollmentDates().catch(console.error);
