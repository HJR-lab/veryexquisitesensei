require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function debugYeoStats() {
  try {
    console.log('=== Debugging Yeo Dashboard Stats ===\n');

    // Find Yeo's customer ID
    const { data: customers } = await supabase
      .from('customers')
      .select('*')
      .ilike('first_name', '%yeo%');

    if (customers.length === 0) {
      console.log('No customer found with name containing "yeo"');
      return;
    }

    const yeo = customers[0];
    console.log(`Found customer: ${yeo.first_name} ${yeo.last_name} (ID: ${yeo.id})`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get active enrollments
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', yeo.id)
      .eq('status', 'active');

    console.log('\n=== ACTIVE ENROLLMENTS ===');
    enrollments.forEach(e => {
      console.log(`   - ${e.course_identifier}: ${e.number_of_weeks || 6} weeks`);
    });

    const totalClassesAllocated = enrollments.reduce((sum, e) => {
      return sum + (e.number_of_weeks || 6);
    }, 0);

    // Get bookings
    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_date,
          class_type
        )
      `)
      .eq('student_id', yeo.id)
      .in('status', ['booked', 'attended', 'completed']);

    const currentAndFutureBookings = bookings.filter(b => {
      if (b.status === 'cancelled') return false;
      const classDate = new Date(b.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      return classDate >= today;
    });

    const pastBookings = bookings.filter(b => {
      if (b.status === 'cancelled') return false;
      const classDate = new Date(b.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      return classDate < today;
    });

    const attendedFromActiveCourses = pastBookings.filter(b => {
      return ['attended', 'completed', 'booked'].includes(b.status) &&
             enrollments.some(e => {
               const classType = b.class_instances.class_type;
               const baseCourse = classType ? classType.split('.')[0] : '';
               return e.course_identifier === baseCourse;
             });
    }).length;

    console.log('\n=== CURRENT LOGIC (WRONG) ===');
    const wrongRemaining = currentAndFutureBookings.length;
    console.log(`Wrong remaining: ${wrongRemaining} (current/future bookings)`);

    console.log('\n=== CORRECTED LOGIC ===');
    const correctRemaining = totalClassesAllocated - attendedFromActiveCourses;
    console.log(`Total Classes: ${totalClassesAllocated}`);
    console.log(`Attended from active courses: ${attendedFromActiveCourses}`);
    console.log(`Correct remaining: ${correctRemaining} (total - attended)`);

    console.log('\n=== BREAKDOWN ===');
    console.log(`Current/future bookings: ${currentAndFutureBookings.length}`);
    console.log(`Past bookings (attended): ${attendedFromActiveCourses}`);
    console.log(`Total booked: ${currentAndFutureBookings.length + attendedFromActiveCourses}`);
    console.log(`Available: ${totalClassesAllocated - (currentAndFutureBookings.length + attendedFromActiveCourses)}`);

    if (correctRemaining === 2) {
      console.log('\n✅ CORRECT! Dashboard should show "2 classes remaining"');
    } else {
      console.log(`\n⚠️  Expected: 2 remaining, Got: ${correctRemaining}`);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

debugYeoStats().then(() => process.exit());