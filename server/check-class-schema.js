require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkSchema() {
  const { data, error } = await supabase
    .from('class_instances')
    .select('*')
    .limit(1)
    .single();

  if (data) {
    console.log('class_instances columns:');
    Object.keys(data).forEach(key => {
      console.log(`  ${key}`);
    });
  }
  
  if (error) console.error('Error:', error);
  process.exit(0);
}

checkSchema();
