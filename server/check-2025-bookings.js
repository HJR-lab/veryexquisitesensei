require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function check2025Bookings() {
  console.log('=== 2025+ CLASS INSTANCES WITH BOOKINGS ===\n');
  
  // Get class instances for 2025+
  const { data: classes, error: classError } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2025-01-01')
    .neq('status', 'draft')
    .order('class_date', { ascending: true })
    .limit(15);
    
  if (classError) {
    console.error('Error fetching classes:', classError);
    return;
  }
  
  if (!classes || classes.length === 0) {
    console.log('No classes found for 2025+');
    return;
  }
  
  // For each class, get bookings
  for (const cls of classes) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        *,
        student:customers(email, first_name, last_name)
      `)
      .eq('class_instance_id', cls.id)
      .in('status', ['booked', 'completed']);
      
    const bookingCount = bookings ? bookings.length : 0;
    
    console.log(`${cls.class_identifier || cls.id}`);
    console.log(`  Date: ${cls.class_date} | Type: ${cls.class_type}`);
    console.log(`  Status: ${cls.status} | Enrolled: ${bookingCount}/${cls.max_capacity}`);
    
    if (bookings && bookings.length > 0) {
      bookings.slice(0, 3).forEach(b => {
        const email = b.student ? b.student.email : 'Unknown';
        const name = b.student ? `${b.student.first_name} ${b.student.last_name}` : 'Unknown';
        console.log(`    - ${name} (${email})`);
      });
      if (bookings.length > 3) {
        console.log(`    ... and ${bookings.length - 3} more students`);
      }
    }
    console.log('---');
  }
  
  // Total stats
  const { count: totalClasses } = await supabase
    .from('class_instances')
    .select('*', { count: 'exact', head: true })
    .gte('class_date', '2025-01-01')
    .neq('status', 'draft');
    
  const { count: totalBookings } = await supabase
    .from('bookings')
    .select('*, class_instance:class_instances!inner(class_date)', { count: 'exact', head: true })
    .gte('class_instance.class_date', '2025-01-01')
    .in('status', ['booked', 'completed']);
  
  console.log(`\nTotal non-draft classes for 2025+: ${totalClasses}`);
  console.log(`Total bookings for 2025+ classes: ${totalBookings}`);
  
  // Check enrollment status breakdown
  console.log('\n=== ENROLLMENT STATUS BREAKDOWN ===\n');
  
  const statuses = ['active', 'confirmed', 'pending', 'cancelled', 'completed'];
  
  for (const status of statuses) {
    const { count } = await supabase
      .from('course_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('status', status);
      
    console.log(`${status.toUpperCase()}: ${count}`);
  }
  
  process.exit(0);
}

check2025Bookings().catch(console.error);
