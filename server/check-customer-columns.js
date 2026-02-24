require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkColumns() {
  try {
    const { data: customers } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .limit(1);

    if (customers && customers.length > 0) {
      console.log('Customer table columns:');
      console.log(Object.keys(customers[0]));
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkColumns();
