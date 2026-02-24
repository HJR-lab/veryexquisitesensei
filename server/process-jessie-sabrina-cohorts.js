require('dotenv').config();
const { checkAndProcessThreshold } = require('./utils/courseEnrollmentManager');
const { supabase } = require('./utils/supabaseDb');

async function processCohorts() {
  console.log('🔄 Processing cohorts for Jessie and Sabrina...\n');

  // Get Jessie's enrollment
  const { data: jessieEnrollment, error: jessieError } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('id', 4850)
    .single();

  if (jessieError) {
    console.error('Error finding Jessie enrollment:', jessieError);
    return;
  }

  console.log('Found Jessie enrollment:');
  console.log(`  ID: ${jessieEnrollment.id}`);
  console.log(`  Student ID: ${jessieEnrollment.student_id}`);
  console.log(`  Course: ${jessieEnrollment.course_type}`);
  console.log(`  Start: ${jessieEnrollment.course_start_date}`);
  console.log(`  Schedule: ${jessieEnrollment.schedule_pattern} ${jessieEnrollment.class_time}`);
  console.log('');

  // Get Sabrina's enrollment
  const { data: sabrinaEnrollment, error: sabrinaError } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('id', 4851)
    .single();

  if (sabrinaError) {
    console.error('Error finding Sabrina enrollment:', sabrinaError);
    return;
  }

  console.log('Found Sabrina enrollment:');
  console.log(`  ID: ${sabrinaEnrollment.id}`);
  console.log(`  Student ID: ${sabrinaEnrollment.student_id}`);
  console.log(`  Course: ${sabrinaEnrollment.course_type}`);
  console.log(`  Start: ${sabrinaEnrollment.course_start_date}`);
  console.log(`  Schedule: ${sabrinaEnrollment.schedule_pattern} ${sabrinaEnrollment.class_time}`);
  console.log('');

  // Process Jessie's cohort (Friday 9:30am)
  console.log('\n=== Processing Jessie\'s Friday 9:30am cohort ===\n');
  try {
    const jessieResult = await checkAndProcessThreshold(jessieEnrollment);
    console.log('\nResult:', JSON.stringify(jessieResult, null, 2));
  } catch (error) {
    console.error('Error processing Jessie cohort:', error);
    console.error('Stack:', error.stack);
  }

  // Process Sabrina's cohort (Thursday 7:00pm)
  console.log('\n=== Processing Sabrina\'s Thursday 7:00pm cohort ===\n');
  try {
    const sabrinaResult = await checkAndProcessThreshold(sabrinaEnrollment);
    console.log('\nResult:', JSON.stringify(sabrinaResult, null, 2));
  } catch (error) {
    console.error('Error processing Sabrina cohort:', error);
    console.error('Stack:', error.stack);
  }

  // Check final booking counts
  console.log('\n\n=== Final Booking Counts ===\n');

  const { data: jessieBookings } = await supabase
    .from('class_bookings')
    .select('id')
    .eq('student_id', 1240);

  console.log(`Jessie Ong (ID: 1240): ${jessieBookings?.length || 0} total bookings`);

  const { data: sabrinaBookings } = await supabase
    .from('class_bookings')
    .select('id')
    .eq('student_id', 2249);

  console.log(`Sabrina Ang (ID: 2249): ${sabrinaBookings?.length || 0} total bookings`);
}

processCohorts()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
