require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function findCustomer() {
  try {
    const { data, error } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('shopify_customer_id', '8955901509790')
      .single();

    if (error) {
      console.error('Error:', error);
      return;
    }

    console.log('Found customer with Shopify ID 8955901509790:');
    console.log(JSON.stringify(data, null, 2));

  } catch (error) {
    console.error('Error:', error);
  }
}

findCustomer();
