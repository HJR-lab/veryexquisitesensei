require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fix() {
  // Find all enrollments with 2025 dates that were created in late 2024 or 2025
  const { data: badEnrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .gte('created_at', '2024-11-01')
    .lte('course_start_date', '2025-12-31')
    .gte('course_start_date', '2025-01-01');
    
  console.log(`Found ${badEnrollments.length} enrollments with 2025 course dates\n`);
  
  let updated = 0;
  
  for (const enrollment of badEnrollments) {
    // Convert 2025-XX-XX to 2026-XX-XX
    const oldDate = enrollment.course_start_date;
    const newDate = oldDate.replace('2025-', '2026-');
    
    const oldEndDate = enrollment.course_end_date;
    const newEndDate = oldEndDate ? oldEndDate.replace('2025-', '2026-') : null;
    
    console.log(`Updating enrollment ${enrollment.id}:`);
    console.log(`  ${oldDate} → ${newDate}`);
    
    const { error } = await supabase
      .from('course_enrollments')
      .update({
        course_start_date: newDate,
        course_end_date: newEndDate
      })
      .eq('id', enrollment.id);
      
    if (error) {
      console.error('Error:', error);
    } else {
      updated++;
    }
  }
  
  console.log(`\n✅ Updated ${updated} enrollments to 2026 dates`);
  
  process.exit(0);
}

fix();
