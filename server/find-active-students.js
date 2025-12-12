require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function findActiveStudents() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Today: ${today}\n`);

    // Get students with non-expired courses (Dashboard definition)
    const { data: dashboardActive, error: error1 } = await supabase
      .from('customers')
      .select('id, email, first_name, last_name, course_purchase_date, course_expiry_date, customer_type')
      .in('customer_type', ['student', 'member', 'student & member'])
      .gte('course_expiry_date', today)
      .order('course_expiry_date', { ascending: true });

    if (error1) throw error1;

    console.log('=== DASHBOARD "ACTIVE STUDENTS" (course_expiry_date >= today) ===');
    console.log(`Found ${dashboardActive.length} students:\n`);
    dashboardActive.forEach(s => {
      console.log(`📧 ${s.email}`);
      console.log(`   Name: ${s.first_name} ${s.last_name}`);
      console.log(`   Type: ${s.customer_type}`);
      console.log(`   Course: ${s.course_purchase_date} → ${s.course_expiry_date}`);
      console.log('');
    });

    // Get students with future bookings (Student Management definition)
    // First get all future class instance IDs
    const { data: futureClasses, error: error2a } = await supabase
      .from('class_instances')
      .select('id')
      .gte('class_date', today);

    if (error2a) throw error2a;

    const futureClassIds = futureClasses.map(c => c.id);

    // Then get bookings for those classes
    const { data: futureBookings, error: error2 } = await supabase
      .from('bookings')
      .select('student_id, class_instance_id')
      .in('class_instance_id', futureClassIds.length > 0 ? futureClassIds : [0]);

    if (error2) throw error2;

    const studentIdsWithFutureBookings = new Set(futureBookings.map(b => b.student_id));

    console.log('\n=== STUDENT MANAGEMENT "ACTIVE STUDENTS" (with bookings >= today) ===');
    console.log(`Found ${studentIdsWithFutureBookings.size} students with future bookings\n`);

    if (studentIdsWithFutureBookings.size > 0) {
      const { data: managementActive, error: error3 } = await supabase
        .from('customers')
        .select('id, email, first_name, last_name')
        .in('id', Array.from(studentIdsWithFutureBookings));

      if (error3) throw error3;

      managementActive.forEach(s => {
        console.log(`📧 ${s.email}`);
        console.log(`   Name: ${s.first_name} ${s.last_name}`);
        console.log('');
      });
    } else {
      console.log('No students have future bookings');
    }

    // Check if any of the 8 dashboard active students have future bookings
    console.log('\n=== CROSS-CHECK ===');
    console.log('Do the 8 "dashboard active" students have future bookings?');
    dashboardActive.forEach(s => {
      const hasFutureBookings = studentIdsWithFutureBookings.has(s.id);
      console.log(`${s.email}: ${hasFutureBookings ? 'YES ✓' : 'NO ✗'}`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  }

  process.exit(0);
}

findActiveStudents();
