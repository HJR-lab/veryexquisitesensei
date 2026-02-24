require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkSchema() {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Bookings columns:', Object.keys(data[0]));
}

checkSchema().then(() => process.exit());
