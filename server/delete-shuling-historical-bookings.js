require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function deleteHistoricalBookings() {
  const studentId = 1631; // Shuling Tan

  // Delete bookings for the historical class instances (IDs 13516-13527)
  const { data, error } = await supabase
    .from('bookings')
    .delete()
    .eq('student_id', studentId)
    .in('class_instance_id', [13516, 13517, 13518, 13519, 13520, 13521, 13522, 13523, 13524, 13525, 13526, 13527])
    .select();

  if (error) {
    console.error('Error deleting bookings:', error);
    return;
  }

  console.log(`✅ Deleted ${data.length} historical bookings for Shuling`);

  // Also delete the historical class instances
  const { data: classes, error: classError } = await supabase
    .from('class_instances')
    .delete()
    .in('id', [13516, 13517, 13518, 13519, 13520, 13521, 13522, 13523, 13524, 13525, 13526, 13527])
    .select();

  if (classError) {
    console.error('Error deleting class instances:', classError);
    return;
  }

  console.log(`✅ Deleted ${classes.length} historical class instances`);

  // Reset classes_used back to 0
  const { error: updateError } = await supabase
    .from('customers')
    .update({ classes_used: 0 })
    .eq('id', studentId);

  if (updateError) {
    console.error('Error resetting classes_used:', updateError);
    return;
  }

  console.log('✅ Reset Shuling classes_used to 0');
  console.log('\nShuling now has only her current Jan-Mar 2026 bookings');
}

deleteHistoricalBookings().then(() => process.exit());
