require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkDates() {
  // Check customers with course dates
  const { data: customers } = await supabase
    .from('customers')
    .select('id, email, first_name, last_name, course_purchase_date, course_expiry_date')
    .not('course_purchase_date', 'is', null)
    .order('course_expiry_date', { ascending: false })
    .limit(20);
  
  console.log('\n📅 Customers with Course Dates (Latest expiry first):\n');
  
  const today = new Date().toISOString().split('T')[0];
  
  customers.forEach(c => {
    const isActive = c.course_expiry_date >= today;
    const status = isActive ? '🔥 ACTIVE' : '✅ ENDED';
    console.log(`${status} | ${c.email}`);
    console.log(`   Start: ${c.course_purchase_date} | End: ${c.course_expiry_date}`);
    console.log('');
  });
  
  // Count stats
  const { data: all } = await supabase
    .from('customers')
    .select('course_expiry_date');
  
  const withDates = all.filter(c => c.course_expiry_date).length;
  const active = all.filter(c => c.course_expiry_date && c.course_expiry_date >= today).length;
  
  console.log(`\n📊 Stats:`);
  console.log(`Total customers: ${all.length}`);
  console.log(`With course dates: ${withDates}`);
  console.log(`Active (not expired): ${active}`);
  console.log(`Inactive: ${all.length - active}`);
  
  process.exit(0);
}

checkDates().catch(console.error);
