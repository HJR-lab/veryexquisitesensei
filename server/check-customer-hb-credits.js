require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkCustomerHBCredits() {
  try {
    // Check schema for HB credit columns in customers table
    const { data: customers } = await supabase
      .from('customers')
      .select('*')
      .limit(1);

    if (customers && customers.length > 0) {
      console.log('=== Available columns in customers table ===');
      const columns = Object.keys(customers[0]).sort();
      columns.forEach(col => console.log(col));

      // Check for HB-related columns
      console.log('\n=== HB-related columns ===');
      const hbColumns = columns.filter(col => col.toLowerCase().includes('hb') || col.toLowerCase().includes('handbuilding'));
      if (hbColumns.length > 0) {
        hbColumns.forEach(col => {
          console.log(`${col}: ${customers[0][col]}`);
        });
      } else {
        console.log('No HB-related columns found');
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkCustomerHBCredits();
