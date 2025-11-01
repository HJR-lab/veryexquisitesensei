const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function fixHandbuildingDates() {
  console.log('🔧 Fixing handbuilding class dates from Tuesday to Wednesday (adding 1 day back)...\n');

  try {
    // Get current October handbuilding classes (they're now on Tuesday)
    const { data: octoberClasses, error: fetchError } = await supabase
      .from('class_instances')
      .select('*')
      .like('class_type', '%Handbuilding%')
      .in('class_date', ['2025-10-07', '2025-10-14', '2025-10-21', '2025-10-28']);

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${octoberClasses.length} October handbuilding classes to update:`);
    octoberClasses.forEach(c => {
      console.log(`  - ${c.class_type}: ${c.class_date}`);
    });

    // Update each class by adding 1 day to get to Wednesday
    console.log('\n📝 Adding 1 day to each date...');
    for (const classInstance of octoberClasses) {
      // Extract just the date part (YYYY-MM-DD) from the timestamp
      const datePart = classInstance.class_date.split('T')[0];
      const currentDate = new Date(datePart + 'T12:00:00Z'); // Use noon UTC to avoid timezone issues
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + 1);

      const newDateStr = newDate.toISOString().split('T')[0]; // YYYY-MM-DD format

      const { error: updateError } = await supabase
        .from('class_instances')
        .update({ class_date: newDateStr })
        .eq('id', classInstance.id);

      if (updateError) {
        console.error(`  ❌ Error updating class ${classInstance.id}:`, updateError.message);
      } else {
        console.log(`  ✅ Updated ${classInstance.class_type}: ${classInstance.class_date} → ${newDateStr}`);
      }
    }

    // Verify the changes
    console.log('\n🔍 Verifying changes...');
    const { data: afterClasses, error: verifyError } = await supabase
      .from('class_instances')
      .select('*')
      .like('class_type', '%Handbuilding%')
      .gte('class_date', '2025-10-01')
      .lte('class_date', '2025-10-31')
      .order('class_date', { ascending: true });

    if (verifyError) {
      throw verifyError;
    }

    console.log(`\n✅ October handbuilding classes after update:`);
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

fixHandbuildingDates();
