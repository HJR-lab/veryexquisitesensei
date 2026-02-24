require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function verifyActiveStudents() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Today: ${today}\n`);

    // Get all bookings with class instances
    const { data: allBookings, error: bookingsError } = await supabaseDb.supabase
      .from('bookings')
      .select('student_id, class_instances!bookings_class_instance_id_fkey(class_date, class_type)');

    if (bookingsError) throw bookingsError;

    // Count unique students with future bookings
    const activeStudentIds = new Set();
    if (allBookings) {
      allBookings.forEach(booking => {
        const classDate = booking.class_instances?.class_date;
        if (classDate && classDate >= today && booking.student_id) {
          activeStudentIds.add(booking.student_id);
        }
      });
    }

    console.log(`Students with future bookings: ${activeStudentIds.size}`);

    // Get students with paused enrollments
    const { data: pausedEnrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('student_id')
      .eq('status', 'paused');

    if (pausedEnrollments) {
      console.log(`Students with paused enrollments: ${pausedEnrollments.length}`);
      pausedEnrollments.forEach(enrollment => {
        activeStudentIds.add(enrollment.student_id);
      });
    }

    console.log(`\nTotal Active Students: ${activeStudentIds.size}\n`);

    // Check Geraldine Brogden
    const { data: geraldine } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'gbr@uwcsea.edu.sg')
      .single();

    if (geraldine) {
      console.log(`Geraldine Brogden: ${geraldine.first_name} ${geraldine.last_name} (ID: ${geraldine.id})`);
      console.log(`In active students: ${activeStudentIds.has(geraldine.id) ? 'YES' : 'NO'}`);

      // Check her bookings
      const { data: geraldineBookings } = await supabaseDb.supabase
        .from('bookings')
        .select('class_instances!bookings_class_instance_id_fkey(class_date, class_type)')
        .eq('student_id', geraldine.id);

      const futureBookings = geraldineBookings?.filter(b =>
        b.class_instances?.class_date >= today
      ) || [];

      console.log(`Geraldine's future bookings: ${futureBookings.length}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

verifyActiveStudents();
