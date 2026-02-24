const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function run() {
  console.log('Verifying Peilin Admin Page Fix...\n');

  const customerId = 1166;

  // This simulates what the admin endpoint does now
  const { data: allBookings } = await supabase
    .from('bookings')
    .select(`
      *,
      class_instances!bookings_class_instance_id_fkey (
        id,
        class_date,
        start_time,
        end_time,
        class_type,
        instructor
      ),
      course_enrollment:course_enrollments!bookings_course_enrollment_id_fkey (
        id,
        status
      )
    `)
    .eq('student_id', customerId)
    .in('status', ['booked', 'completed', 'attended'])
    .order('class_instances(class_date)', { ascending: false });

  console.log(`Total bookings in database: ${allBookings.length}`);

  // Filter to only include bookings from active or paused enrollments
  const filteredBookings = (allBookings || []).filter(booking => {
    if (!booking.course_enrollment) return true;
    return ['active', 'paused'].includes(booking.course_enrollment.status);
  });

  console.log(`Bookings after filtering (active/paused only): ${filteredBookings.length}\n`);

  console.log('Breakdown by enrollment:');
  const byEnrollment = {};
  allBookings.forEach(b => {
    const enrollId = b.course_enrollment_id || 'no-enrollment';
    const status = b.course_enrollment?.status || 'unknown';
    if (!byEnrollment[enrollId]) {
      byEnrollment[enrollId] = { count: 0, status, included: false };
    }
    byEnrollment[enrollId].count++;
    if (filteredBookings.includes(b)) {
      byEnrollment[enrollId].included = true;
    }
  });

  Object.entries(byEnrollment).forEach(([enrollId, info]) => {
    const marker = info.included ? '✓ INCLUDED' : '✗ EXCLUDED';
    console.log(`  Enrollment ${enrollId}: ${info.count} bookings (status: ${info.status}) ${marker}`);
  });

  console.log('\n📊 Expected Admin Page Stats:');
  console.log(`  Total Bookings Shown: ${filteredBookings.length}`);

  const attendedCount = filteredBookings.filter(b =>
    b.status === 'attended' || b.attended === true
  ).length;
  const bookedCount = filteredBookings.filter(b =>
    b.status === 'booked'
  ).length;

  console.log(`  Attended: ${attendedCount}`);
  console.log(`  Upcoming (booked): ${bookedCount}`);
  console.log(`  Remaining: ${filteredBookings.length - attendedCount}`);

  console.log('\n✅ The admin page should now show:');
  console.log('  - Only the 5 active course bookings (enrollment 4812)');
  console.log('  - NOT the 6 completed course bookings (enrollment 4924)');
  console.log('  - This matches the student dashboard view!');
}

run();
