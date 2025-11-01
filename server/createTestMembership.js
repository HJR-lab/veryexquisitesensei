require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function createTestMembership() {
  try {
    // First, find the customer by email
    const { data: customers, error: customerError } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'adobe@hjgher.com')
      .single();

    if (customerError) {
      console.error('Error finding customer:', customerError);
      return;
    }

    if (!customers) {
      console.log('Customer not found with email: adobe@hjgher.com');
      return;
    }

    console.log('Found customer:', customers);

    // Create a 12-month membership
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 12);

    const membership = await supabaseDb.createMembership({
      customerId: customers.id,
      membershipType: '12 Month',
      status: 'active',
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      perks: {
        'Unlimited Studio Access': 'Access 7 days a week during studio hours',
        'Free Dedicated Storage': 'Secure storage for your work',
        'Studio-Assisted Clay Reclaim': 'Our studio team helps you reclaim your clay scraps',
        'FREE $130 Firing Basket': 'Complimentary firing credits worth $130',
        'All Studio Glazes Included': 'Access to all professional glazes',
        '10% Discount': 'Save on clay, tools, and additional firings'
      }
    });

    console.log('✅ Successfully created membership:', membership);
    console.log(`Membership ID: ${membership.id}`);
    console.log(`Type: ${membership.membership_type}`);
    console.log(`Start Date: ${membership.start_date}`);
    console.log(`End Date: ${membership.end_date}`);
    console.log(`Status: ${membership.status}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating membership:', error);
    process.exit(1);
  }
}

createTestMembership();
