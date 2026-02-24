require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkCustomerTypes() {
  try {
    // Get both Mitchell accounts
    const { data: mitchellAccounts } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .or('email.eq.Mitchell.chandx@gmail.com,email.eq.Mitchell.chandx+dup@gmail.com')
      .order('id');

    console.log('Mitchell.chandx accounts:\n');
    mitchellAccounts.forEach(c => {
      console.log(`${c.first_name} ${c.last_name} (ID: ${c.id})`);
      console.log(`  Email: ${c.email}`);
      console.log(`  Customer Type: ${c.customer_type}`);
      console.log(`  Classes Allocated: ${c.classes_allocated}`);
      console.log(`  Course Purchase Count: ${c.course_purchase_count}`);
      console.log(`  Shopify Customer ID: ${c.shopify_customer_id}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkCustomerTypes();
