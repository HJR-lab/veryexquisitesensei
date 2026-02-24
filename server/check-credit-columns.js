require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkColumns() {
  // Try to query with credit columns
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('id, class_credits_allocated, class_credits_used, class_credits_remaining, glazing_class_used')
    .limit(1);

  if (error) {
    console.log('❌ Credit columns do NOT exist');
    console.log('Error:', error.message);
    return false;
  }
  
  console.log('✅ Credit columns exist in database');
  return true;
}

checkColumns();
