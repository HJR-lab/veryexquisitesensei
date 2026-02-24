require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function testProgressFix() {
  console.log('🧪 Testing Max Peh and Shin N Chan progress calculation after fix...\n');

  try {
    // Test using the same logic as the /api/admin/students/stats endpoint

    // Get both students
    const { data: students } = await supabase
      .from('customers')
      .select('id, email, first_name, last_name, classes_allocated, classes_used')
      .in('id', [1110, 2238]); // Max and Shin's IDs

    console.log('👥 Students to test:', students.length);
    students.forEach(s => {
      console.log(`  - ${s.first_name} ${s.last_name} (${s.email}) - ID: ${s.id}`);
    });

    // Get all active enrollments for these students
    const { data: allEnrollments } = await supabase
      .from('course_enrollments')
      .select('id, student_id, status')
      .in('student_id', [1110, 2238])
      .in('status', ['active', 'paused']);

    console.log('\n📚 Active/paused enrollments:');
    allEnrollments.forEach(e => {
      const student = students.find(s => s.id === e.student_id);
      console.log(`  - ${student?.first_name} ${student?.last_name}: enrollment ${e.id} (${e.status})`);
    });

    // Get all bookings for these students
    const { data: allBookingsWithClasses } = await supabase
      .from('bookings')
      .select(`
        student_id,
        course_enrollment_id,
        status,
        class_instances!bookings_class_instance_id_fkey (
          class_date
        )
      `)
      .in('student_id', [1110, 2238])
      .in('status', ['booked', 'completed', 'attended']);

    console.log('\n📅 All bookings:', allBookingsWithClasses.length);

    // Calculate progress for each student using the same logic as the API
    const activeEnrollmentIds = new Set(allEnrollments.map(e => e.id));

    students.forEach(student => {
      console.log(`\n🧮 Progress calculation for ${student.first_name} ${student.last_name}:`);

      const studentBookings = allBookingsWithClasses.filter(b => b.student_id === student.id);
      console.log(`  Total bookings: ${studentBookings.length}`);

      const attendedClasses = studentBookings.filter(b => {
        // Must be from active/paused enrollment
        if (b.course_enrollment_id && !activeEnrollmentIds.has(b.course_enrollment_id)) {
          return false;
        }

        const ci = b.class_instances;
        if (!ci) return false;

        // Check if attended or completed
        if (b.status === 'attended' || b.status === 'completed') {
          return true;
        }

        // Check if booked but past date
        if (b.status === 'booked') {
          const classDate = new Date(ci.class_date);
          const today = new Date();
          classDate.setHours(0,0,0,0);
          today.setHours(0,0,0,0);
          return classDate < today;
        }

        return false;
      });

      const progress = `${attendedClasses.length}/${student.classes_allocated || 6}`;
      console.log(`  ✅ Progress: ${progress}`);

      // Calculate which classes are counted as attended
      console.log(`  📋 Attended classes breakdown:`);
      studentBookings.forEach(b => {
        const isFromActiveEnrollment = b.course_enrollment_id && activeEnrollmentIds.has(b.course_enrollment_id);
        const ci = b.class_instances;
        let isAttended = false;
        let reason = '';

        if (!isFromActiveEnrollment) {
          reason = 'not from active enrollment';
        } else if (!ci) {
          reason = 'no class instance';
        } else if (b.status === 'attended' || b.status === 'completed') {
          isAttended = true;
          reason = `status: ${b.status}`;
        } else if (b.status === 'booked') {
          const classDate = new Date(ci.class_date);
          const today = new Date();
          classDate.setHours(0,0,0,0);
          today.setHours(0,0,0,0);
          if (classDate < today) {
            isAttended = true;
            reason = `booked but past date (${ci.class_date})`;
          } else {
            reason = `future class (${ci.class_date})`;
          }
        }

        const mark = isAttended ? '✅' : '❌';
        console.log(`    ${mark} Booking ${b.id}: ${reason}`);
      });
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

testProgressFix();