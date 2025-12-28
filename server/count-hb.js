require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function verify() {
  const { data: all } = await supabase.from('class_instances').select('class_type').like('class_type', 'HB%');
  const newFormat = all.filter(c => c.class_type.match(/^HB_\d{6}_/));
  const oldFormat = all.filter(c => \!c.class_type.match(/^HB_\d{6}_/));
  console.log('Total HB classes:', all.length);
  console.log('New format (HB_DDMMYY_LT):', newFormat.length);
  console.log('Old format (HB####NT_LT#.#):', oldFormat.length);
  console.log('\nSample new format:');
  newFormat.slice(0, 5).forEach(c => console.log('  ', c.class_type));
  process.exit(0);
}
verify();
