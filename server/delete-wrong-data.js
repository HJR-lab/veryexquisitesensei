require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function cleanup() {
  // Reset bookings_created_at for enrollments
  const { error: resetError } = await supabase
    .from('course_enrollments')
    .update({ bookings_created_at: null })
    .not('bookings_created_at', 'is', null);
    
  console.log('✅ Reset bookings_created_at flags');
  
  // Delete bookings created today (they have wrong dates)
  const today = new Date().toISOString().split('T')[0];
  const { data: badBookings } = await supabase
    .from('bookings')
    .delete()
    .gte('created_at', today)
    .select();
    
  console.log(`✅ Deleted ${badBookings ? badBookings.length : 0} bookings from today`);
  
  process.exit(0);
}

cleanup();
