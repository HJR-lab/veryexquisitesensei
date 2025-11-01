const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function fixNovemberHandbuilding() {
  console.log('🔧 Fixing November handbuilding class dates from Thursday to Wednesday...\n');

  try {
    // Get November handbuilding classes (currently on Thursdays)
    const { data: novemberClasses, error: fetchError } = await supabase
      .from('class_instances')
      .select('*')
      .like('class_type', '%Handbuilding%')
      .in('class_date', ['2025-11-06', '2025-11-13', '2025-11-20', '2025-11-27']);

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${novemberClasses.length} November handbuilding classes:`);
    novemberClasses.forEach(c => {
      const datePart = c.class_date.split('T')[0];
      const date = new Date(datePart + 'T12:00:00Z');
      console.log(`  - ${c.class_type}: ${date.toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'})} (${datePart})`);
    });

    // Update each class by subtracting 1 day to get to Wednesday
    console.log('\n📝 Subtracting 1 day from each date...');
    for (const classInstance of novemberClasses) {
      const datePart = classInstance.class_date.split('T')[0];
      const currentDate = new Date(datePart + 'T12:00:00Z');
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
        console.log(`  ✅ Updated ${classInstance.class_type}: ${datePart} → ${newDateStr}`);
      }
    }

    // Verify the changes
    console.log('\n🔍 Verifying changes...');
    const { data: afterClasses, error: verifyError } = await supabase
      .from('class_instances')
      .select('*')
      .like('class_type', '%Handbuilding%')
      .gte('class_date', '2025-11-01')
      .lte('class_date', '2025-11-30')
      .order('class_date', { ascending: true });

    if (verifyError) {
      throw verifyError;
    }

    console.log(`\n✅ November handbuilding classes after update:`);
    afterClasses.forEach(c => {
      const datePart = c.class_date.split('T')[0];
      const date = new Date(datePart + 'T12:00:00Z');
      console.log(`  - ${c.class_type}: ${date.toLocaleDateString('en-US', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})} (${datePart})`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixNovemberHandbuilding();
