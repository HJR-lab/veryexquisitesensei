require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function check() {
  const { data } = await supabase
    .from('customers')
    .select('email, course_purchase_date, course_expiry_date')
    .not('course_expiry_date', 'is', null)
    .limit(10);
  
  console.log('Customers with dates:');
  console.log(data);
  
  const { count } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .not('course_expiry_date', 'is', null);
  
  console.log('\nTotal with dates:', count);
  
  process.exit(0);
}

check();
