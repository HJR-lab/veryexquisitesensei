require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function findMeghna() {
  console.log('Finding Meghna...\n');

  const { data: customers } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email')
    .ilike('first_name', '%meghna%');

  console.log('Found customers:');
  customers.forEach(c => {
    console.log(`  ${c.first_name} ${c.last_name} - ID: ${c.id} - ${c.email}`);
  });
}

findMeghna().then(() => process.exit());
