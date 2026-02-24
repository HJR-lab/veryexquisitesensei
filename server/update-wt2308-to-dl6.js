require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function updateWT2308ToDL6() {
  console.log('=== UPDATING WT2308 CLASSES FROM JL6 TO DL6 ===\n');

  // Get all WT2308AM_JL6 class instances
  const { data: classes, error: classError } = await supabase
    .from('class_instances')
    .select('*')
    .ilike('class_type', '%WT2308AM_JL6%')
    .order('class_date', { ascending: true });

  if (classError) {
    console.error('Error fetching classes:', classError);
    return;
  }

  console.log(`Found ${classes?.length || 0} WT2308AM_JL6 classes\n`);

  if (!classes || classes.length === 0) {
    console.log('No WT2308AM_JL6 classes found!');
    return;
  }

  console.log('Classes to update:');
  classes.forEach((c, idx) => {
    console.log(`  ${idx + 1}. ${c.class_date} ${c.class_type} [ID: ${c.id}]`);
  });

  console.log('\nUpdating class_type...\n');

  // Update each class instance
  for (const classInstance of classes) {
    const newClassType = classInstance.class_type.replace('_JL6', '_DL6');
    
    const { data, error } = await supabase
      .from('class_instances')
      .update({ class_type: newClassType })
      .eq('id', classInstance.id)
      .select()
      .single();

    if (error) {
      console.error(`❌ Error updating ${classInstance.class_date}:`, error);
    } else {
      console.log(`✅ Updated ${classInstance.class_date}: ${classInstance.class_type} → ${data.class_type}`);
    }
  }

  console.log('\n=== DONE ===');
}

updateWT2308ToDL6().then(() => process.exit());
