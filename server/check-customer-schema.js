require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkSchema() {
  try {
    const { data, error } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      console.error('Error:', error);
      return;
    }

    console.log('Customer table columns:');
    console.log(Object.keys(data));
    console.log('\nSample record:');
    console.log(data);

  } catch (error) {
    console.error('Error:', error);
  }
}

checkSchema();
