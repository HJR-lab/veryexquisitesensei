const supabaseDb = require('./utils/supabaseDb');
const supabase = supabaseDb.supabase;

async function debugMaxShinProgress() {
  console.log('🔍 Debugging Max Peh and Shin N Chan progress calculation...\n');

  try {
    // Get Max and Shin's customer data
    const { data: students, error: studentsError } = await supabase
      .from('customers')
      .select('*')
      .in('email', ['pehmax@gmail.com', 'shine2stary@gmail.com']);

    if (studentsError) throw studentsError;

    console.log('👥 Students found:', students.length);
    students.forEach(s => {
      console.log(`  - ${s.first_name} ${s.last_name} (${s.email})`);
      console.log(`    ID: ${s.id}`);
      console.log(`    Classes allocated: ${s.classes_allocated}`);
      console.log(`    Classes used: ${s.classes_used}`);
      console.log(`    Customer type: ${s.customer_type}`);
      console.log();
    });

    // Get their course enrollments
    const studentIds = students.map(s => s.id);
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('course_enrollments')
      .select('*')
      .in('student_id', studentIds);

    if (enrollmentsError) throw enrollmentsError;

    console.log('📚 Course enrollments found:', enrollments.length);
    enrollments.forEach(e => {
      const student = students.find(s => s.id === e.student_id);
      console.log(`  - ${student?.first_name} ${student?.last_name}`);
      console.log(`    Enrollment ID: ${e.id}`);
      console.log(`    Status: ${e.status}`);
      console.log(`    Course title: ${e.course_title}`);
      console.log(`    Number of weeks: ${e.number_of_weeks}`);
      console.log(`    Weeks remaining: ${e.weeks_remaining}`);
      console.log();
    });

    // Get their bookings
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date,
          start_time,
          end_time,
          instructor
        )
      `)
      .in('student_id', studentIds)
      .in('status', ['booked', 'completed', 'attended'])
      .order('class_instances(class_date)', { ascending: true });

    if (bookingsError) throw bookingsError;

    console.log('📅 Bookings found:', bookings.length);
    bookings.forEach(b => {
      const student = students.find(s => s.id === b.student_id);
      console.log(`  - ${student?.first_name} ${student?.last_name}`);
      console.log(`    Booking ID: ${b.id}`);
      console.log(`    Status: ${b.status}`);
      console.log(`    Enrollment ID: ${b.course_enrollment_id}`);
      console.log(`    Class date: ${b.class_instances?.class_date}`);
      console.log(`    Class type: ${b.class_instances?.class_type}`);
      console.log(`    Booking type: ${b.booking_type}`);
      console.log();
    });

    // Check which enrollments are active/paused
    const activeEnrollmentIds = new Set(
      enrollments.filter(e => ['active', 'paused'].includes(e.status)).map(e => e.id)
    );

    console.log('🟢 Active/paused enrollment IDs:', Array.from(activeEnrollmentIds));

    // Calculate attended classes for each student using the same logic as the API
    students.forEach(student => {
      console.log(`\n🧮 Calculating for ${student.first_name} ${student.last_name}:`);

      const studentBookings = bookings.filter(b => b.student_id === student.id);
      console.log(`  Total bookings: ${studentBookings.length}`);

      const attendedClasses = studentBookings.filter(b => {
        // Must be from active/paused enrollment
        if (b.course_enrollment_id && !activeEnrollmentIds.has(b.course_enrollment_id)) {
          console.log(`    Skipping booking ${b.id} - not from active enrollment`);
          return false;
        }

        const ci = b.class_instances;
        if (!ci) {
          console.log(`    Skipping booking ${b.id} - no class instance`);
          return false;
        }

        // Check if attended or completed
        if (b.status === 'attended' || b.status === 'completed') {
          console.log(`    Counting booking ${b.id} - status: ${b.status}`);
          return true;
        }

        // Check if booked but past date
        if (b.status === 'booked') {
          const classDate = new Date(ci.class_date);
          const today = new Date();
          classDate.setHours(0,0,0,0);
          today.setHours(0,0,0,0);
          if (classDate < today) {
            console.log(`    Counting booking ${b.id} - booked but past date (${ci.class_date})`);
            return true;
          } else {
            console.log(`    Not counting booking ${b.id} - future date (${ci.class_date})`);
            return false;
          }
        }

        return false;
      });

      console.log(`  Classes attended: ${attendedClasses.length}/${student.classes_allocated || 6}`);
      console.log(`  Should show progress: ${attendedClasses.length}/${student.classes_allocated || 6}`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

debugMaxShinProgress();