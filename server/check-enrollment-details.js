require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkEnrollmentDetails() {
  console.log('🔍 Checking enrollment details...\n');

  // Find Jessie's enrollments
  const { data: jessieEnrollments, error: jessieError } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', 1240)
    .eq('shopify_order_id', '6507450990750');

  if (jessieError) {
    console.error('Error finding Jessie:', jessieError);
  } else {
    console.log('Jessie enrollment:');
    console.log(JSON.stringify(jessieEnrollments, null, 2));
  }

  console.log('\n');

  // Find Sabrina's enrollments
  const { data: sabrinaEnrollments, error: sabrinaError } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', 2249)
    .eq('shopify_order_id', '6508470075550');

  if (sabrinaError) {
    console.error('Error finding Sabrina:', sabrinaError);
  } else {
    console.log('Sabrina enrollment:');
    console.log(JSON.stringify(sabrinaEnrollments, null, 2));
  }

  // Also check for Jessie's 2025 order
  console.log('\n\n--- Checking for Jessie 2025 order ---\n');
  const { data: jessie2025, error: jessie2025Error } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', 1240)
    .like('course_title', '%Wheelthrowing%')
    .order('created_at', { ascending: false })
    .limit(5);

  if (jessie2025Error) {
    console.error('Error finding Jessie 2025:', jessie2025Error);
  } else {
    console.log(`Found ${jessie2025?.length || 0} recent wheelthrowing enrollments for Jessie:`);
    jessie2025?.forEach(e => {
      console.log(`\nOrder: ${e.shopify_order_id}`);
      console.log(`Course: ${e.course_title}`);
      console.log(`Identifier: ${e.course_identifier}`);
      console.log(`Start: ${e.course_start_date}`);
      console.log(`Schedule: ${e.schedule_pattern} ${e.class_time}`);
      console.log(`Status: ${e.status}`);
    });
  }
}

checkEnrollmentDetails()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
