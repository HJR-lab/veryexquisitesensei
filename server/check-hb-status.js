require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkHBStatus() {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('id, number_of_weeks, class_credits_allocated, class_credits_used, class_credits_remaining, customers(first_name, last_name)')
    .ilike('course_type', '%handbuilding%')
    .gte('created_at', '2025-11-25');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\nHB Enrollments since Nov 25:\n');
  data.forEach(e => {
    console.log(`${e.customers?.first_name} ${e.customers?.last_name}:`);
    console.log(`  Weeks: ${e.number_of_weeks}`);
    console.log(`  Credits: ${e.class_credits_remaining}/${e.class_credits_allocated} (used: ${e.class_credits_used})`);
    console.log('');
  });
}

checkHBStatus();
