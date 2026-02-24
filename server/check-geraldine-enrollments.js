require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkGeraldineEnrollments() {
  try {
    // Get Geraldine
    const { data: geraldine } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', 'gbr@uwcsea.edu.sg')
      .single();

    console.log(`Geraldine Brogden (ID: ${geraldine.id})\n`);

    // Get all enrollments
    const { data: enrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', geraldine.id);

    console.log(`Total enrollments: ${enrollments?.length || 0}\n`);

    if (enrollments) {
      enrollments.forEach(e => {
        console.log(`Enrollment ID: ${e.id}`);
        console.log(`  Course Identifier: ${e.course_identifier}`);
        console.log(`  Status: ${e.status}`);
        console.log(`  Weeks Remaining: ${e.weeks_remaining}`);
        console.log('');
      });
    }

    // Get all bookings grouped by enrollment and booking type
    const { data: allBookings } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date
        )
      `)
      .eq('student_id', geraldine.id)
      .in('status', ['booked', 'completed', 'attended']);

    console.log('\n=== BOOKINGS BY ENROLLMENT ===\n');

    const byEnrollment = {};
    allBookings.forEach(b => {
      const enrollId = b.enrollment_id || 'no_enrollment';
      if (!byEnrollment[enrollId]) {
        byEnrollment[enrollId] = { regular: [], makeup: [] };
      }
      if (b.booking_type === 'makeup') {
        byEnrollment[enrollId].makeup.push(b);
      } else {
        byEnrollment[enrollId].regular.push(b);
      }
    });

    Object.keys(byEnrollment).forEach(enrollId => {
      console.log(`Enrollment ${enrollId}:`);
      console.log(`  Regular bookings: ${byEnrollment[enrollId].regular.length}`);
      byEnrollment[enrollId].regular.forEach(b => {
        console.log(`    - ${b.class_instances?.class_type} (${b.class_instances?.class_date})`);
      });
      console.log(`  Makeup bookings: ${byEnrollment[enrollId].makeup.length}`);
      byEnrollment[enrollId].makeup.forEach(b => {
        console.log(`    - ${b.class_instances?.class_type} (${b.class_instances?.class_date})`);
      });
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkGeraldineEnrollments();
