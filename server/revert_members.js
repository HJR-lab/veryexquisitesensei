require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  // Get all customers who were updated to 'student' but should be 'member'
  const { data: customers } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email, customer_type')
    .eq('customer_type', 'student')
    .in('first_name', ['Valerie', 'Liyana', 'Aveline', 'Dorothy', 'Helen']);

  console.log('Found', customers?.length || 0, 'customers to check');
  console.log('');

  if (!customers || customers.length === 0) {
    console.log('No customers to revert');
    process.exit(0);
  }

  for (const customer of customers) {
    // Check if this person should be a member (has membership-related email or took membership courses)
    const shouldBeMember = [
      'Valerie Lim',
      'Liyana Othman',
      'Aveline Vasu',
      'Dorothy Tang',
      'Helen Leeming'
    ].includes(`${customer.first_name} ${customer.last_name}`);

    if (shouldBeMember) {
      const { error } = await supabase
        .from('customers')
        .update({
          customer_type: 'member',
          updated_at: new Date().toISOString()
        })
        .eq('id', customer.id);

      if (error) {
        console.error(`❌ Error updating ${customer.first_name} ${customer.last_name}:`, error.message);
      } else {
        console.log(`✅ ${customer.first_name} ${customer.last_name}: "student" → "member"`);
      }
    }
  }

  console.log('');
  console.log('Done! All members reverted.');

  process.exit(0);
})();
