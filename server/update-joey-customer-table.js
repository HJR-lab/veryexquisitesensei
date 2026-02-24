require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function updateJoeyCustomerTable() {
  const email = 'joey.lee2302@gmail.com';

  console.log('\n=== UPDATING JOEY CUSTOMER TABLE ===');

  // Update customer table to match actual bookings
  const { error } = await supabase
    .from('customers')
    .update({
      classes_allocated: 6,  // 6 bookings
      classes_used: 0         // 0 attended
    })
    .eq('email', email);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('✅ Updated Joey\'s customer record:');
    console.log('   classes_allocated: 10 → 6');
    console.log('   classes_used: 0 (no change)');
  }

  // Verify
  const { data: customer } = await supabase
    .from('customers')
    .select('classes_allocated, classes_used')
    .eq('email', email)
    .single();

  console.log('\n=== VERIFIED ===');
  console.log('classes_allocated:', customer.classes_allocated);
  console.log('classes_used:', customer.classes_used);
  console.log('remaining:', customer.classes_allocated - customer.classes_used);
}

updateJoeyCustomerTable().then(() => process.exit());
