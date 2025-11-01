const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkState() {
  // Check class_instances
  const { data: classes, error: classError } = await supabase
    .from('class_instances')
    .select('*');
  
  console.log('Class instances:', classes?.length || 0);
  if (classError) console.log('Error:', classError.message);
  
  // Check bookings
  const { data: bookings, error: bookingError } = await supabase
    .from('bookings')
    .select('*');
  
  console.log('Bookings:', bookings?.length || 0);
  if (bookingError) console.log('Error:', bookingError.message);
  
  // Check waitlist
  const { data: waitlist, error: waitlistError } = await supabase
    .from('waitlist')
    .select('*');
  
  console.log('Waitlist:', waitlist?.length || 0);
  if (waitlistError) console.log('Error:', waitlistError.message);
}

checkState();
