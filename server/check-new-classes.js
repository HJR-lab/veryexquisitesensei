require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkNewClasses() {
  console.log('=== CHECKING NEWLY CREATED CLASSES ===\n');
  
  // Get recent classes created today
  const today = new Date().toISOString().split('T')[0];
  
  const { data: classes, error } = await supabase
    .from('class_instances')
    .select('*')
    .gte('created_at', today)
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  if (!classes || classes.length === 0) {
    console.log('No classes created today');
    return;
  }
  
  console.log(`Found ${classes.length} classes created today:\n`);
  
  for (const cls of classes) {
    console.log(`ID: ${cls.id}`);
    console.log(`Identifier: ${cls.class_identifier}`);
    console.log(`Type: ${cls.class_type}`);
    console.log(`Date: ${cls.class_date}`);
    console.log(`Status: ${cls.status}`);
    console.log(`Instructor: ${cls.instructor}`);
    console.log(`Room: ${cls.room}`);
    console.log(`Capacity: ${cls.current_enrollment}/${cls.max_capacity}`);
    
    // Get bookings for this class
    const { count: bookingCount } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('class_instance_id', cls.id);
      
    console.log(`Bookings: ${bookingCount}`);
    console.log('---');
  }
  
  process.exit(0);
}

checkNewClasses().catch(console.error);
