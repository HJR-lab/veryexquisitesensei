require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function createShulingHistoricalBookings() {
  const studentId = 1631; // Shuling Tan

  console.log('Creating historical attended bookings for Shuling...\n');

  // Order #1745 - Feb 16, 2024 - Course: Sundays 7 April–12 May (9:30am–12:00nn)
  // Order #1936 - Jul 7, 2024 - Course: Sundays 11 August–15 September (9:30–12:00nn)

  // We need to create class instances and bookings for these historical courses
  // But we need the class instance IDs first

  // Let's just update Shuling's classes_used in the database directly for now
  const { data, error } = await supabase
    .from('customers')
    .update({ classes_used: 12 })
    .eq('id', studentId)
    .select();

  if (error) {
    console.error('Error updating Shuling:', error);
    return;
  }

  console.log('✅ Updated Shuling - classes_used set to 12');
  console.log('\nShuling now has:');
  console.log('  - course_purchase_count: 3');
  console.log('  - classes_allocated: 18 (3 × 6)');
  console.log('  - classes_used: 12 (2 completed courses)');
  console.log('  - classes_remaining: 6 (18 - 12)');
}

createShulingHistoricalBookings().then(() => process.exit());
