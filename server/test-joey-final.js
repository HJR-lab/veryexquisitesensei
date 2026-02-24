const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function testJoeyInStats() {
  console.log('Testing what the stats endpoint will return for Joey Lee...\n');

  // Get Joey Lee's customer data
  const { data: joey } = await supabase
    .from('customers')
    .select('*')
    .eq('id', 2234)
    .single();

  // Get active/paused enrollment
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', 2234)
    .in('status', ['active', 'paused']);

  const enrollment = enrollments?.[0];

  // Get bookings with class instances
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      *,
      class_instances!bookings_class_instance_id_fkey (
        class_date,
        class_type,
        start_time,
        end_time,
        instructor,
        room
      )
    `)
    .eq('student_id', 2234)
    .in('status', ['booked', 'completed', 'attended']);

  let endedClassesInCurrentCourse = 0;

  if (enrollment) {
    const currentCourseBookings = bookings.filter(b => 
      b.course_enrollment_id === enrollment.id
    );

    // This is the EXACT logic from the fixed backend
    endedClassesInCurrentCourse = currentCourseBookings.filter(booking => {
      const classInstance = booking.class_instances;
      if (!classInstance) return false;

      // Count if status is 'attended' or 'completed'
      if (booking.status === 'attended' || booking.status === 'completed') {
        return true;
      }

      // Also count if status is 'booked' but class date is in the past
      if (booking.status === 'booked') {
        const classDate = new Date(classInstance.class_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        classDate.setHours(0, 0, 0, 0);
        return classDate < today;
      }

      return false;
    }).length;
  }

  const weeksRemaining = (joey.classes_allocated || 0) - endedClassesInCurrentCourse;

  console.log('='.repeat(60));
  console.log('WHAT THE STATS ENDPOINT WILL RETURN FOR JOEY LEE:');
  console.log('='.repeat(60));
  console.log(`  Name: ${joey.first_name} ${joey.last_name}`);
  console.log(`  Email: ${joey.email}`);
  console.log(`  Course Identifier: ${enrollment?.course_identifier || 'N/A'}`);
  console.log(`  Enrollment Status: ${enrollment?.status || 'N/A'}`);
  console.log(`  Weeks Remaining: ${weeksRemaining}`);
  console.log('='.repeat(60));
  console.log('');
  console.log(`Expected: 8 classes remaining`);
  console.log(`Actual: ${weeksRemaining} classes remaining`);
  console.log('');
  console.log(weeksRemaining === 8 ? '✅ CORRECT - User will see 8 remaining' : '❌ WRONG');
  console.log('='.repeat(60));
}

testJoeyInStats();
