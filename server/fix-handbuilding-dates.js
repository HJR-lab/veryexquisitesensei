const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function fixHandbuildingDates() {
  console.log('🔧 Fixing handbuilding class dates from Thursday to Wednesday...\n');

  try {
    // Get current handbuilding classes
    const { data: beforeClasses, error: fetchError } = await supabase
      .from('class_instances')
      .select('*')
      .like('class_type', '%Handbuilding%')
      .in('class_date', ['2025-10-09', '2025-10-16', '2025-10-23', '2025-10-30']);

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${beforeClasses.length} handbuilding classes to update:`);
    beforeClasses.forEach(c => {
      const date = new Date(c.class_date);
      console.log(`  - ${c.class_type}: ${date.toLocaleDateString('en-US', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}`);
    });

    // Update each class by subtracting 1 day
    console.log('\n📝 Updating dates...');
    for (const classInstance of beforeClasses) {
      const currentDate = new Date(classInstance.class_date);
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() - 1);

      const newDateStr = newDate.toISOString().split('T')[0]; // YYYY-MM-DD format

      const { error: updateError } = await supabase
        .from('class_instances')
        .update({ class_date: newDateStr })
        .eq('id', classInstance.id);

      if (updateError) {
        console.error(`  ❌ Error updating class ${classInstance.id}:`, updateError.message);
      } else {
        console.log(`  ✅ Updated ${classInstance.class_type} from ${currentDate.toLocaleDateString()} to ${newDate.toLocaleDateString()}`);
      }
    }

    // Verify the changes
    console.log('\n🔍 Verifying changes...');
    const { data: afterClasses, error: verifyError } = await supabase
      .from('class_instances')
      .select('*')
      .like('class_type', '%Handbuilding%')
      .in('class_date', ['2025-10-08', '2025-10-15', '2025-10-22', '2025-10-29']);

    if (verifyError) {
      throw verifyError;
    }

    console.log(`\n✅ Successfully updated ${afterClasses.length} handbuilding classes:`);
    afterClasses.forEach(c => {
      const date = new Date(c.class_date);
      console.log(`  - ${c.class_type}: ${date.toLocaleDateString('en-US', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixHandbuildingDates();
