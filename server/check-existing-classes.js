require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkExisting() {
  // Get some older working classes
  const { data: classes } = await supabase
    .from('class_instances')
    .select('id, class_identifier, class_type, class_date, status')
    .not('class_identifier', 'is', null)
    .limit(5);
    
  console.log('=== EXISTING WORKING CLASSES ===\n');
  classes.forEach(cls => {
    console.log(`ID: ${cls.id}`);
    console.log(`Identifier: ${cls.class_identifier}`);
    console.log(`Type: ${cls.class_type}`);
    console.log(`Status: ${cls.status}`);
    console.log('---');
  });
  
  process.exit(0);
}

checkExisting().catch(console.error);
