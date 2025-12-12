require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixWheelthrowingType() {
  // Update all wheelthrowing classes to be "Wheelthrowing Beginner"
  const { data, error } = await supabase
    .from('class_instances')
    .update({ class_type: 'Wheelthrowing Beginner' })
    .eq('class_type', 'Wheelthrowing')
    .select();

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log(`✅ Updated ${data.length} classes from 'Wheelthrowing' to 'Wheelthrowing Beginner'`);
  process.exit(0);
}

fixWheelthrowingType();
