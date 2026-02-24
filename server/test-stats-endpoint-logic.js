const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://fpdbfbxpthmaceuspcrf.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZGJmYnhwdGhtYWNldXNwY3JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1MTExMDQsImV4cCI6MjA3NjA4NzEwNH0.Huc5Cz34sSYuBzSR3l9pcTkYyI5E53mMVHRNt-mZ5Ww'
);

async function simulateStatsEndpoint() {
  console.log('Simulating /api/admin/students/stats endpoint logic...\n');

  // Step 1: Get all students WITH PAGINATION
  let allStudents = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .in('customer_type', ['student', 'member', 'student & member'])
      .order('created_at', { ascending: false })
      .range(page * 1000, (page + 1) * 1000 - 1);

    allStudents = allStudents.concat(data || []);
    hasMore = (data?.length || 0) === 1000;
    page++;

    if (page > 5) break; // Safety limit
  }

  console.log(`Fetched ${allStudents.length} students (${page} pages)\n`);

  // Step 2: Get all enrollments
  const { data: allEnrollments } = await supabase
    .from('course_enrollments')
    .select('*');

  // Step 3: Get bookings with class instances (INCLUDING course_enrollment_id and status)
  const { data: allBookingsWithClasses } = await supabase
    .from('bookings')
    .select(`
      student_id,
      class_instance_id,
      course_enrollment_id,
      status,
      class_instances!bookings_class_instance_id_fkey (
        class_type,
        class_date,
        start_time,
        end_time,
        instructor,
        room
      )
    `)
    .in('status', ['booked', 'completed', 'attended'])
    .order('class_instances(class_date)', { ascending: false });

  console.log(`Fetched ${allBookingsWithClasses.length} bookings\n`);

  // Step 4: Process each student (USING THE FIXED LOGIC)
  const studentsWithStats = allStudents.map(s => {
    // Get active or paused enrollment
    const enrollment = allEnrollments.find(e =>
      e.student_id === s.id &&
      (e.status === 'active' || e.status === 'paused')
    );

    let endedClassesInCurrentCourse = 0;

    if (enrollment) {
      // Get ALL bookings for this student from active/paused enrollment (including past bookings)
      const currentCourseBookings = allBookingsWithClasses.filter(booking => {
        if (booking.student_id !== s.id) return false;

        // Include bookings from active/paused enrollments
        if (booking.course_enrollment_id !== enrollment.id) return false;

        const classInstance = booking.class_instances;
        if (!classInstance || !classInstance.class_date) return false;

        return true; // Include all bookings (past and future)
      });

      // Count attended classes (past classes or marked as attended/completed)
      endedClassesInCurrentCourse = currentCourseBookings.filter(booking => {
        const classInstance = booking.class_instances;
        if (!classInstance) return false;

        // Count if marked as attended or completed
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

    // Classes remaining = allocated credits - classes already ended (attended)
    const classesRemaining = (s.classes_allocated || 0) - endedClassesInCurrentCourse;

    return {
      id: s.id,
      firstName: s.first_name,
      lastName: s.last_name,
      classesAllocated: s.classes_allocated || 0,
      classesRemaining: classesRemaining
    };
  });

  // Find Joey Lee
  const joey = studentsWithStats.find(s => s.id === 2234);

  console.log('='.repeat(60));
  console.log('JOEY LEE (ID 2234) FROM API LOGIC:');
  console.log('='.repeat(60));
  if (joey) {
    console.log(`  Name: ${joey.firstName} ${joey.lastName}`);
    console.log(`  Classes Allocated: ${joey.classesAllocated}`);
    console.log(`  Classes Remaining: ${joey.classesRemaining}`);
    console.log('');
    console.log(`  Expected: Remaining = 8`);
    console.log(`  Actual: Remaining = ${joey.classesRemaining}`);
    console.log('');
    console.log(joey.classesRemaining === 8 ? '✅ API LOGIC IS CORRECT' : '❌ API LOGIC IS WRONG');
  } else {
    console.log('❌ Joey Lee not found');
  }
  console.log('='.repeat(60));
  console.log('');

  // Show first 5 students to see the pattern
  console.log('First 5 students from API logic:');
  studentsWithStats.slice(0, 5).forEach(s => {
    console.log(`  ${s.firstName} ${s.lastName} - Allocated: ${s.classesAllocated}, Remaining: ${s.classesRemaining}`);
  });
}

simulateStatsEndpoint();
