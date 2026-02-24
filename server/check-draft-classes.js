require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkDraftClasses() {
  console.log('🔍 Checking for draft or active classes starting in Jan 2026...\n');

  // Check for Jessie's Friday 9:30am classes
  console.log('--- Friday 9:30am classes (Jessie) ---');
  const { data: fridayClasses, error: fridayError } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2026-01-20')
    .lte('class_date', '2026-03-01')
    .ilike('class_time', '%9:30%am%')
    .order('class_date', { ascending: true });

  if (fridayError) {
    console.error('Error:', fridayError);
  } else {
    console.log(`Found ${fridayClasses?.length || 0} Friday morning classes:`);
    fridayClasses?.forEach(c => {
      console.log(`  ${c.class_date} - ${c.class_type} - ${c.status} - ${c.course_identifier} (${c.current_enrollment}/${c.max_capacity})`);
    });
  }

  console.log('\n--- Thursday 7:00pm classes (Sabrina) ---');
  const { data: thursdayClasses, error: thursdayError } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2026-01-20')
    .lte('class_date', '2026-03-01')
    .ilike('class_time', '%7:00%pm%')
    .order('class_date', { ascending: true });

  if (thursdayError) {
    console.error('Error:', thursdayError);
  } else {
    console.log(`Found ${thursdayClasses?.length || 0} Thursday evening classes:`);
    thursdayClasses?.forEach(c => {
      console.log(`  ${c.class_date} - ${c.class_type} - ${c.status} - ${c.course_identifier} (${c.current_enrollment}/${c.max_capacity})`);
    });
  }

  // Check all draft classes
  console.log('\n--- All draft classes ---');
  const { data: draftClasses, error: draftError } = await supabase
    .from('class_instances')
    .select('*')
    .eq('status', 'draft')
    .gte('class_date', '2026-01-20')
    .order('class_date', { ascending: true });

  if (draftError) {
    console.error('Error:', draftError);
  } else {
    console.log(`Found ${draftClasses?.length || 0} draft classes:`);
    draftClasses?.forEach(c => {
      console.log(`  ${c.class_date} - ${c.class_type} - ${c.course_identifier} (${c.current_enrollment}/${c.max_capacity})`);
    });
  }
}

checkDraftClasses()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
