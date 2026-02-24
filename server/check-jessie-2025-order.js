require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkJessie2025() {
  console.log('🔍 Checking for Jessie 2025 order (WT1010AM_JL6)...\n');

  // Find all Jessie's enrollments from 2025
  const { data: enrollments, error } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', 1240)
    .gte('course_start_date', '2025-01-01')
    .lt('course_start_date', '2026-01-01')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${enrollments?.length || 0} enrollments for Jessie from 2025:`);
  enrollments?.forEach(e => {
    console.log(`\n  ID: ${e.id}`);
    console.log(`  Order: ${e.shopify_order_id}`);
    console.log(`  Course: ${e.course_title}`);
    console.log(`  Type: ${e.course_type}`);
    console.log(`  Identifier: ${e.course_identifier}`);
    console.log(`  Start: ${e.course_start_date}`);
    console.log(`  Schedule: ${e.schedule_pattern} ${e.class_time}`);
    console.log(`  Status: ${e.status}`);
    console.log(`  Bookings created: ${e.bookings_created_at ? 'YES' : 'NO'}`);
  });

  // Check for WT1010AM pattern
  const targetEnrollments = enrollments?.filter(e =>
    e.schedule_pattern === 'FRIDAY' &&
    e.class_time &&
    e.class_time.includes('9:30') &&
    e.class_time.includes('am')
  );

  if (targetEnrollments && targetEnrollments.length > 0) {
    console.log('\n\n--- WT1010AM Friday 9:30am enrollments ---');
    for (const enrollment of targetEnrollments) {
      // Check bookings
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id')
        .eq('course_enrollment_id', enrollment.id);

      console.log(`\nEnrollment ${enrollment.id} (Order: ${enrollment.shopify_order_id})`);
      console.log(`  Start: ${enrollment.course_start_date}`);
      console.log(`  Bookings: ${bookings?.length || 0}`);
    }
  }
}

checkJessie2025()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
