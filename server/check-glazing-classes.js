require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkGlazingClasses() {
  console.log('\n🔍 CHECKING GLAZING CLASS TRACKING\n');

  // Get a sample WT cohort to see all 6 weeks
  const { data: sampleEnrollment } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('course_type', 'Wheelthrowing Beginner')
    .eq('number_of_weeks', 6)
    .not('bookings_created_at', 'is', null)
    .limit(1)
    .single();

  if (sampleEnrollment) {
    console.log(`Sample cohort: ${sampleEnrollment.course_type} starting ${sampleEnrollment.course_start_date}\n`);

    // Get all bookings for this enrollment
    const { data: bookings } = await supabase
      .from('bookings')
      .select('*, class_instance:class_instances(*)')
      .eq('course_enrollment_id', sampleEnrollment.id)
      .order('class_instance(class_date)');

    console.log(`Classes in this cohort:\n`);
    
    if (bookings) {
      bookings.forEach((b, i) => {
        const c = b.class_instance;
        console.log(`Week ${i + 1}: ${c.class_date}`);
        console.log(`   Type: ${c.class_type}`);
        console.log(`   Capacity: ${c.max_capacity}`);
        console.log(`   Enrolled: ${c.current_enrollment}`);
        console.log(`   Room: ${c.room}\n`);
      });
    }
  }

  // Check class_instances table columns
  const { data: sampleClass } = await supabase
    .from('class_instances')
    .select('*')
    .limit(1)
    .single();

  console.log('\nclass_instances table columns:');
  if (sampleClass) {
    Object.keys(sampleClass).forEach(key => {
      console.log(`   ${key}: ${typeof sampleClass[key]}`);
    });
  }

  process.exit(0);
}

checkGlazingClasses().catch(console.error);
