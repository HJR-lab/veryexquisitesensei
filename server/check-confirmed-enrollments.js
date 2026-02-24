require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkConfirmedEnrollments() {
  console.log('=== CONFIRMED COURSE ENROLLMENTS (2025+) ===\n');
  
  // Get confirmed enrollments
  const { data: enrollments, error } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('status', 'confirmed')
    .gte('course_start_date', '2025-01-01')
    .order('course_start_date', { ascending: true })
    .limit(10);
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  if (enrollments && enrollments.length > 0) {
    enrollments.forEach(e => {
      console.log(`Course: ${e.course_type}`);
      console.log(`Start: ${e.course_start_date}`);
      console.log(`Schedule: ${e.schedule_pattern}`);
      console.log(`Cohort ID: ${e.cohort_id}`);
      console.log('---');
    });
  } else {
    console.log('No confirmed enrollments found for 2025+');
  }
  
  // Get total count
  const { count } = await supabase
    .from('course_enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'confirmed')
    .gte('course_start_date', '2025-01-01');
    
  console.log(`\nTotal confirmed enrollments for 2025+: ${count}\n`);
  
  // Get class instances with bookings (scheduled and confirmed, not draft)
  console.log('=== CLASS INSTANCES WITH BOOKINGS (2025+) ===\n');
  
  const { data: classes, error: classError } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2025-01-01')
    .neq('status', 'draft')
    .order('class_date', { ascending: true })
    .limit(15);
    
  if (classError) {
    console.error('Error:', classError);
    return;
  }
  
  if (classes && classes.length > 0) {
    for (const c of classes) {
      // Get booking count for this class
      const { count: bookingCount } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('class_instance_id', c.class_identifier);
        
      console.log(`${c.class_identifier} | ${c.class_date}`);
      console.log(`  Type: ${c.class_type} | Status: ${c.status}`);
      console.log(`  Bookings: ${bookingCount}/${c.max_capacity}`);
      console.log('---');
    }
    
    // Total count
    const { count: totalClasses } = await supabase
      .from('class_instances')
      .select('*', { count: 'exact', head: true })
      .gte('class_date', '2025-01-01')
      .neq('status', 'draft');
      
    console.log(`\nTotal non-draft class instances for 2025+: ${totalClasses}`);
  } else {
    console.log('No confirmed/scheduled class instances found for 2025+');
  }
  
  process.exit(0);
}

checkConfirmedEnrollments().catch(console.error);
