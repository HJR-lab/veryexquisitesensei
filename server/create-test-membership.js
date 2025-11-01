const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function createTestMembership() {
  console.log('🎨 Creating test membership...\n');

  try {
    // Get first customer
    const { data: customers, error: custError } = await supabase
      .from('customers')
      .select('*')
      .limit(1);

    if (custError) throw custError;

    if (customers.length === 0) {
      console.log('No customers found');
      return;
    }

    const customer = customers[0];
    console.log(`Customer: ${customer.first_name} ${customer.last_name} (ID: ${customer.id})\n`);

    // Create monthly membership starting today, ending in 30 days
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    const {data: membership, error} = await supabase
      .from('memberships')
      .insert([{
        customer_id: customer.id,
        membership_type: 'monthly',
        status: 'active',
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        perks: {
          studioAccess: '24/7 studio access',
          communityEvents: 'Free community pottery events',
          discounts: '10% off workshops and materials',
          storage: '1 shelf of personal storage space'
        }
      }])
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Membership created:');
    console.log(`   Type: ${membership.membership_type}`);
    console.log(`   Start: ${membership.start_date}`);
    console.log(`   End: ${membership.end_date}`);
    console.log(`   Perks:`, membership.perks);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

createTestMembership();
