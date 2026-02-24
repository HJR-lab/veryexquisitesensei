require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function revertJoeyCustomer() {
  const email = 'joey.lee2302@gmail.com';

  console.log('\n=== REVERTING JOEY CUSTOMER TABLE ===');

  // Revert customer table back to 10 allocated
  const { error } = await supabase
    .from('customers')
    .update({
      classes_allocated: 10,  // 10 total classes in package
      classes_used: 0          // 0 attended
    })
    .eq('email', email);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('✅ Reverted Joey\'s customer record:');
    console.log('   classes_allocated: 6 → 10');
    console.log('   classes_used: 0 (no change)');
  }

  // Verify
  const { data: customer } = await supabase
    .from('customers')
    .select('classes_allocated, classes_used')
    .eq('email', email)
    .single();

  console.log('\n=== VERIFIED ===');
  console.log('Total allocated:', customer.classes_allocated);
  console.log('Classes used:', customer.classes_used);
  console.log('Remaining:', customer.classes_allocated - customer.classes_used);
}

revertJoeyCustomer().then(() => process.exit());
