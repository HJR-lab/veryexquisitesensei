const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function fixHandbuildingContinuous() {
  console.log('🔧 Making handbuilding classes continuous (removing week numbers and glazing)...\n');

  try {
    // Get all handbuilding classes
    const { data: allHandbuilding, error: fetchError } = await supabase
      .from('class_instances')
      .select('*')
      .like('class_type', '%Handbuilding%')
      .order('class_date', { ascending: true });

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${allHandbuilding.length} handbuilding classes\n`);

    // Update each to just "Handbuilding" (removing week numbers and glazing)
    console.log('📝 Updating class types to "Handbuilding"...');
    for (const classInstance of allHandbuilding) {
      const { error: updateError } = await supabase
        .from('class_instances')
        .update({ class_type: 'Handbuilding' })
        .eq('id', classInstance.id);

      if (updateError) {
        console.error(`  ❌ Error updating class ${classInstance.id}:`, updateError.message);
      } else {
        const datePart = classInstance.class_date.split('T')[0];
        console.log(`  ✅ ${classInstance.class_type} → Handbuilding (${datePart})`);
      }
    }

    // Verify the changes
    console.log('\n🔍 Verifying changes...');
    const { data: afterClasses, error: verifyError } = await supabase
      .from('class_instances')
      .select('*')
      .eq('class_type', 'Handbuilding')
      .order('class_date', { ascending: true });

    if (verifyError) {
      throw verifyError;
    }

    console.log(`\n✅ All handbuilding classes (now continuous):`);
    afterClasses.forEach(c => {
      const datePart = c.class_date.split('T')[0];
      const date = new Date(datePart + 'T12:00:00Z');
      console.log(`  - ${date.toLocaleDateString('en-US', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixHandbuildingContinuous();
