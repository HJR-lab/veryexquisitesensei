require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkSchema() {
  try {
    console.log('🔍 Checking customers table schema...\n');

    // Get a sample customer to see all fields
    const { data: customer, error } = await supabase
      .from('customers')
      .select('*')
      .limit(1)
      .single();

    if (error) throw error;

    console.log('📋 Customer table fields:');
    console.log(JSON.stringify(customer, null, 2));

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkSchema();
