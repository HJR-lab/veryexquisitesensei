const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkCustomers() {
  console.log('📋 Checking customers in database...\n');

  try {
    const { data: customers, error } = await supabase
      .from('customers')
      .select('*');

    if (error) {
      throw error;
    }

    console.log(`Found ${customers.length} customers:\n`);
    customers.forEach(c => {
      console.log(`ID: ${c.id}`);
      console.log(`Shopify ID: ${c.shopify_customer_id}`);
      console.log(`Email: ${c.email}`);
      console.log(`Name: ${c.first_name} ${c.last_name}`);
      console.log(`---`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkCustomers();
