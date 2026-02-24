require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkSchema() {
  try {
    // Get a sample enrollment to see the schema
    const { data: enrollment } = await supabase
      .from('course_enrollments')
      .select('*')
      .limit(1)
      .single();

    console.log('=== course_enrollments Table Schema ===');
    console.log('Available columns:');
    Object.keys(enrollment).forEach(key => {
      console.log(`  - ${key}: ${enrollment[key]}`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

checkSchema().then(() => process.exit());