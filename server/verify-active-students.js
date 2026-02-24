require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function verifyActiveStudents() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Today: ${today}\n`);

    // Get all bookings with class dates
    const { data: allBookings } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_date,
          class_type
        )
      `);

    // Get unique student IDs with future bookings
    const activeStudentIds = new Set();
    allBookings.forEach(booking => {
      const classDate = booking.class_instances?.class_date;
      if (classDate && classDate >= today && booking.student_id) {
        activeStudentIds.add(booking.student_id);
      }
    });

    console.log(`Students with future bookings: ${activeStudentIds.size}`);

    // Get students with paused enrollments
    const { data: pausedEnrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('student_id')
      .eq('status', 'paused');

    const pausedStudentIds = new Set();
    if (pausedEnrollments) {
      pausedEnrollments.forEach(enrollment => {
        pausedStudentIds.add(enrollment.student_id);
        activeStudentIds.add(enrollment.student_id);
      });
    }

    console.log(`Students with paused enrollments: ${pausedStudentIds.size}`);
    console.log(`\nTotal Active Students (future bookings OR paused): ${activeStudentIds.size}\n`);

    // Get customer details for the active students
    const { data: customers } = await supabaseDb.supabase
      .from('customers')
      .select('id, first_name, last_name, email')
      .in('id', Array.from(activeStudentIds))
      .order('last_name');

    console.log('Active Students List:');
    console.log('='.repeat(80));
    customers.forEach((c, i) => {
      const hasFutureBooking = activeStudentIds.has(c.id);
      const isPaused = pausedStudentIds.has(c.id);
      const status = isPaused ? '(PAUSED)' : '(FUTURE BOOKINGS)';
      console.log(`${i + 1}. ${c.first_name} ${c.last_name} (${c.email}) ${status}`);
    });

    // Check specifically for Geraldine Brogden
    console.log('\n' + '='.repeat(80));
    console.log('Checking Geraldine Brogden...\n');
    const { data: geraldine } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'gbr@uwcsea.edu.sg')
      .single();

    if (geraldine) {
      console.log(`Found: ${geraldine.first_name} ${geraldine.last_name} (ID: ${geraldine.id})`);

      const { data: geraldineBookings } = await supabaseDb.supabase
        .from('bookings')
        .select(`
          *,
          class_instances!bookings_class_instance_id_fkey (
            class_date,
            class_type
          )
        `)
        .eq('student_id', geraldine.id);

      console.log(`Total bookings: ${geraldineBookings.length}`);

      const futureBookings = geraldineBookings.filter(b =>
        b.class_instances?.class_date >= today
      );
      console.log(`Future bookings: ${futureBookings.length}`);

      if (futureBookings.length > 0) {
        console.log('Future classes:');
        futureBookings.forEach(b => {
          console.log(`  - ${b.class_instances.class_type} on ${b.class_instances.class_date} (${b.status})`);
        });
      }

      console.log(`In active students list: ${activeStudentIds.has(geraldine.id) ? 'YES' : 'NO'}`);
    } else {
      console.log('Geraldine Brogden NOT FOUND');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

verifyActiveStudents();
