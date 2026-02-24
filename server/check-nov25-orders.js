require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkNov25Orders() {
  try {
    console.log('\n📦 CHECKING ORDERS FROM NOV 25, 2025 ONWARDS\n');
    console.log('='.repeat(80));

    // Get all enrollments from Nov 25, 2025 onwards
    const { data: enrollments, error } = await supabase
      .from('course_enrollments')
      .select(`
        id,
        course_type,
        start_date,
        number_of_weeks,
        status,
        class_credits_allocated,
        class_credits_remaining,
        created_at,
        customers (
          id,
          first_name,
          last_name,
          email
        )
      `)
      .gte('created_at', '2025-11-25')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Error fetching enrollments:', error);
      return;
    }

    console.log(`\n📊 Total enrollments since Nov 25, 2025: ${enrollments?.length || 0}\n`);

    // Group by course type
    const hbEnrollments = enrollments.filter(e => e.course_type?.toLowerCase().includes('handbuilding'));
    const wtEnrollments = enrollments.filter(e => e.course_type?.toLowerCase().includes('wheelthrowing'));

    console.log(`🏺 Handbuilding: ${hbEnrollments.length} enrollments`);
    console.log(`🎡 Wheelthrowing: ${wtEnrollments.length} enrollments`);
    console.log('\n' + '='.repeat(80));

    // Show HB enrollments
    if (hbEnrollments.length > 0) {
      console.log('\n🏺 HANDBUILDING ENROLLMENTS:\n');
      hbEnrollments.forEach((e, idx) => {
        console.log(`${idx + 1}. ${e.customers?.first_name} ${e.customers?.last_name}`);
        console.log(`   Course: ${e.course_type}`);
        console.log(`   Status: ${e.status}`);
        console.log(`   Credits: ${e.class_credits_remaining}/${e.class_credits_allocated}`);
        console.log(`   Created: ${new Date(e.created_at).toLocaleString()}`);
        console.log('');
      });
    }

    // Show WT enrollments grouped by course
    if (wtEnrollments.length > 0) {
      console.log('\n🎡 WHEELTHROWING ENROLLMENTS:\n');

      // Group by start_date and course_name
      const wtByCourse = {};
      wtEnrollments.forEach(e => {
        const key = `${e.start_date}_${e.course_type}`;
        if (!wtByCourse[key]) {
          wtByCourse[key] = {
            start_date: e.start_date,
            course_name: e.course_type,
            status: e.status,
            students: []
          };
        }
        wtByCourse[key].students.push(e);
      });

      Object.values(wtByCourse).forEach(course => {
        const studentCount = course.students.length;
        const statusIcon = course.status === 'active' ? '✅' : '📝';
        const shouldBeActive = studentCount >= 4;
        const statusMatch = (course.status === 'active') === shouldBeActive;

        console.log(`${statusIcon} ${course.course_type}`);
        console.log(`   Start: ${course.start_date || 'TBD'}`);
        console.log(`   Status: ${course.status} (${studentCount} students)`);
        if (!statusMatch) {
          console.log(`   ⚠️  Should be: ${shouldBeActive ? 'active' : 'draft'}`);
        }
        console.log(`   Students:`);
        course.students.forEach((s, idx) => {
          console.log(`      ${idx + 1}. ${s.customers?.first_name} ${s.customers?.last_name}`);
        });
        console.log('');
      });
    }

    // Check for students without start dates (Jan 17+ courses)
    const noStartDate = wtEnrollments.filter(e => !e.start_date);
    if (noStartDate.length > 0) {
      console.log('\n⚠️  WT ENROLLMENTS WITHOUT START DATE:\n');
      noStartDate.forEach(e => {
        console.log(`- ${e.customers?.first_name} ${e.customers?.last_name}: ${e.course_type} (${e.status})`);
      });
    }

    // Check students table for active status
    console.log('\n' + '='.repeat(80));
    console.log('\n👥 CHECKING STUDENT ACTIVE STATUS:\n');

    const studentIds = enrollments.map(e => e.customers?.id).filter(Boolean);
    const { data: bookings } = await supabase
      .from('bookings')
      .select('student_id, class_instance_id, class_instances(class_date)')
      .in('student_id', studentIds)
      .in('status', ['booked', 'completed'])
      .gte('class_instances.class_date', new Date().toISOString().split('T')[0]);

    const studentsWithFutureBookings = new Set();
    bookings?.forEach(b => {
      studentsWithFutureBookings.add(b.student_id);
    });

    console.log(`Students with future bookings (active): ${studentsWithFutureBookings.size}`);
    console.log(`Students without future bookings: ${studentIds.length - studentsWithFutureBookings.size}`);

    const studentsWithoutBookings = enrollments.filter(e =>
      !studentsWithFutureBookings.has(e.customers?.id)
    );

    if (studentsWithoutBookings.length > 0) {
      console.log('\n⚠️  Students without future bookings:\n');
      studentsWithoutBookings.forEach(e => {
        console.log(`- ${e.customers?.first_name} ${e.customers?.last_name}: ${e.course_type} (${e.status})`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Check complete!\n');

  } catch (error) {
    console.error('Error:', error);
  }
}

checkNov25Orders();
