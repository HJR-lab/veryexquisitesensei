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
    });

    // Also check for variations of Shin's email
    const { data: shinVariants, error: shinError } = await supabase
      .from('customers')
      .select('*')
      .ilike('email', '%shine%');

    if (shinVariants?.length > 0) {
      console.log('\n📧 Shin email variations found:', shinVariants.length);
      shinVariants.forEach(s => {
        console.log(`  - ${s.first_name} ${s.last_name} (${s.email}) - ID: ${s.id}`);
      });
    }

    // Now check the enrollment ID issue for Max
    const maxId = 1110;
    console.log(`\n🔍 All enrollments for Max (ID ${maxId}):`);
    const { data: allEnrollments, error: enrollError } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', maxId);

    if (enrollError) throw enrollError;
    allEnrollments.forEach(e => {
      console.log(`  Enrollment ${e.id}: ${e.status} - ${e.course_title}`);
    });

    console.log(`\n🔍 All bookings for Max (ID ${maxId}):`);
    const { data: allBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('student_id', maxId);

    if (bookingsError) throw bookingsError;
    allBookings.forEach(b => {
      console.log(`  Booking ${b.id}: enrollment ${b.course_enrollment_id}, status ${b.status}`);
    });

    // Check if enrollment 4777 exists
    console.log('\n🔍 Checking enrollment 4777:');
    const { data: enrollment4777, error: e4777Error } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('id', 4777);

    if (e4777Error) throw e4777Error;
    if (enrollment4777?.length > 0) {
      console.log(`  Found enrollment 4777: ${enrollment4777[0].status} - Student ID: ${enrollment4777[0].student_id}`);
    } else {
      console.log('  Enrollment 4777 not found');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

debugMaxShinProgress();