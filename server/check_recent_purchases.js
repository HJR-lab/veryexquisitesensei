require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkRecentPurchases() {
  // Get all customers and their creation dates (which represents sync date, not purchase date)
  const { data: allCustomers } = await supabase
    .from('customers')
    .select('id, email, first_name, last_name, created_at, course_purchase_date, course_expiry_date')
    .order('created_at', { ascending: false })
    .limit(20);
  
  console.log('Recent customers (showing first 20):');
  console.log(allCustomers);
  
  // Check date distribution
  const { data: customers } = await supabase
    .from('customers')
    .select('course_purchase_date, course_expiry_date');
  
  const withPurchaseDate = customers.filter(c => c.course_purchase_date).length;
  const withExpiryDate = customers.filter(c => c.course_expiry_date).length;
  
  console.log(`\nCustomers with course_purchase_date: ${withPurchaseDate}`);
  console.log(`Customers with course_expiry_date: ${withExpiryDate}`);
  
  process.exit(0);
}

checkRecentPurchases().catch(console.error);
