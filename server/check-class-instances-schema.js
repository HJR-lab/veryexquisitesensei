require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkSchema() {
  // Get one class instance to see the schema
  const { data, error } = await supabase
    .from('class_instances')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Class instance schema:');
  console.log(JSON.stringify(data[0], null, 2));
  console.log('\nColumn names:');
  console.log(Object.keys(data[0]));
}

checkSchema().then(() => process.exit());
