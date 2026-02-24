require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixSarahBookingStatus() {
  console.log('=== FIXING SARAH CHER BOOKING STATUS ===\n');

  const sarahId = 1197;

  // Update all cancelled bookings to attended
  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'attended',
      attended: true
    })
    .eq('student_id', sarahId)
    .eq('status', 'cancelled')
    .select();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`✅ Updated ${data?.length || 0} bookings from 'cancelled' to 'attended'\n`);

  // Verify
  const { data: allBookings } = await supabase
    .from('bookings')
    .select('status')
    .eq('student_id', sarahId);

  const statusCounts = {};
  allBookings?.forEach(b => {
    statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
  });

  console.log('Final booking status counts:');
  Object.keys(statusCounts).forEach(status => {
    console.log(`  ${status}: ${statusCounts[status]}`);
  });

  console.log('\n✅ All bookings updated successfully!');
}

fixSarahBookingStatus().then(() => process.exit());
