require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function findYeo() {
  const { data: customers } = await supabase
    .from('customers')
    .select('id, email, first_name, last_name')
    .ilike('email', '%yeo%');

  console.log('Found customers with "yeo":');
  customers.forEach(c => {
    console.log(`  ${c.first_name} ${c.last_name} - ${c.email}`);
  });
}

findYeo().then(() => process.exit());
