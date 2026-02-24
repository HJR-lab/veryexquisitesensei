require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkJoeyEndedClasses() {
  const email = 'joey.lee2302@gmail.com';
  const now = new Date();
  
  console.log('\n=== JOEY ENDED CLASSES CHECK ===');
  console.log('Current time:', now.toISOString());
  
  // Get customer
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('email', email)
    .single();
  
  // Get bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      attended,
      class_instance:class_instances!bookings_class_instance_id_fkey (
        class_date,
        start_time,
        end_time,
        class_type
      )
    `)
    .eq('student_id', customer.id)
    .order('class_instances(class_date)', { ascending: true });
  
  console.log('\nBookings:', bookings.length);
  
  let endedCount = 0;
  bookings.forEach(b => {
    const classDate = b.class_instance.class_date.split('T')[0];
    const endTime = b.class_instance.end_time;
    
    // Parse end time (e.g., "9:30pm")
    const timeParts = endTime.match(/(\d+):(\d+)(am|pm)/i);
    if (!timeParts) return;
    
    let hours = parseInt(timeParts[1]);
    const minutes = parseInt(timeParts[2]);
    const period = timeParts[3].toLowerCase();
    
    if (period === 'pm' && hours !== 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    
    const [year, month, day] = classDate.split('-');
    const classEndDateTime = new Date(year, month - 1, day, hours, minutes);
    
    const hasEnded = classEndDateTime < now;
    if (hasEnded) endedCount++;
    
    console.log(`\n  ${classDate} ${endTime}:`);
    console.log(`    End DateTime: ${classEndDateTime.toISOString()}`);
    console.log(`    Has Ended: ${hasEnded}`);
    console.log(`    Status: ${b.status}`);
    console.log(`    Attended: ${b.attended}`);
  });
  
  console.log('\n=== SUMMARY ===');
  console.log('Total bookings:', bookings.length);
  console.log('Classes that have ended:', endedCount);
  console.log('Remaining (10 - ended):', 10 - endedCount);
}

checkJoeyEndedClasses().then(() => process.exit());
