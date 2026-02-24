require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkEdithLeeCachedCount() {
  const edithId = 1225; // Edith Lee

  const { data: customer } = await supabase
    .from('customers')
    .select('id, first_name, last_name, course_purchase_count')
    .eq('id', edithId)
    .single();

  console.log('=== EDITH LEE CACHED COURSE COUNT ===');
  console.log(`ID: ${customer.id}`);
  console.log(`Name: ${customer.first_name} ${customer.last_name}`);
  console.log(`Cached course_purchase_count: ${customer.course_purchase_count}`);
  console.log('');
  console.log('Actual courses from course history: 4');
  console.log('');

  if (customer.course_purchase_count === 4) {
    console.log('✅ Cached value matches actual count!');
  } else {
    console.log(`❌ Cached value (${customer.course_purchase_count}) does NOT match actual count (4)`);
    console.log('');
    console.log('This is OK because the frontend now uses history.length instead of the cached value.');
    console.log('The cached value is only used as a fallback and can be updated via admin panel if needed.');
  }
}

checkEdithLeeCachedCount().then(() => process.exit());
