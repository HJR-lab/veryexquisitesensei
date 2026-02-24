require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function fixHBCredits() {
  console.log('\n🔧 FIXING HB CREDIT ALLOCATIONS\n');
  console.log('='.repeat(60));

  // Get all HB enrollments with 0 credits
  const { data: hbEnrollments, error } = await supabase
    .from('course_enrollments')
    .select(`
      id,
      number_of_weeks,
      class_credits_allocated,
      class_credits_remaining,
      customers (
        first_name,
        last_name
      )
    `)
    .ilike('course_type', '%handbuilding%')
    .or('class_credits_allocated.is.null,class_credits_allocated.eq.0');

  if (error) {
    console.error('❌ Error fetching HB enrollments:', error);
    return;
  }

  console.log(`\nFound ${hbEnrollments.length} HB enrollments needing credit allocation\n`);

  let fixed = 0;
  for (const enrollment of hbEnrollments) {
    const credits = enrollment.number_of_weeks || 4; // Default to 4 if not set
    
    const { error: updateError } = await supabase
      .from('course_enrollments')
      .update({
        class_credits_allocated: credits,
        class_credits_used: 0,
        class_credits_remaining: credits,
        glazing_class_used: false
      })
      .eq('id', enrollment.id);

    if (updateError) {
      console.error(`❌ Failed to update ${enrollment.customers?.first_name} ${enrollment.customers?.last_name}:`, updateError);
    } else {
      console.log(`✅ ${enrollment.customers?.first_name} ${enrollment.customers?.last_name}: Allocated ${credits} credits`);
      fixed++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`\n✅ Fixed ${fixed}/${hbEnrollments.length} HB enrollments\n`);
}

fixHBCredits();
