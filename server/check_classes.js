require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkAllClasses() {
  const { data, error } = await supabase
    .from('class_instances')
    .select('class_type, class_date')
    .order('class_date');

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  const handbuilding = data.filter(c => c.class_type === 'Handbuilding');
  const wheelthrowing = data.filter(c => c.class_type === 'Wheelthrowing');

  console.log('Total classes in database:', data.length);
  console.log('Handbuilding:', handbuilding.length);
  console.log('Wheelthrowing:', wheelthrowing.length);

  console.log('\nWheelthrowing date range:');
  if (wheelthrowing.length > 0) {
    const dates = wheelthrowing.map(c => c.class_date).sort();
    console.log('  First:', dates[0]);
    console.log('  Last:', dates[dates.length - 1]);
  }

  process.exit(0);
}

checkAllClasses();
