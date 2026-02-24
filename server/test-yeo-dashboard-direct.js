require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function testYeoDashboardDirect() {
  try {
    console.log('=== Testing Yeo Dashboard Logic Directly ===\n');

    const studentId = 1106; // Yeo's ID
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get enrollments (matching API logic exactly)
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', studentId)
      .eq('status', 'active');

    const totalClassesAllocated = enrollments.reduce((sum, e) => {
      return sum + (e.number_of_weeks || 6);
    }, 0);

    // Get bookings (matching API logic exactly)
    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_date,
          class_type
        )
      `)
      .eq('student_id', studentId)
      .in('status', ['booked', 'attended', 'completed']);

    const pastBookings = bookings.filter(b => {
      if (b.status === 'cancelled') return false;
      const classDate = new Date(b.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      return classDate < today;
    });

    const currentAndFutureBookings = bookings.filter(b => {
      if (b.status === 'cancelled') return false;
      const classDate = new Date(b.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      return classDate >= today; // Only current and future classes
    });

    // Count past classes from active enrollments as attended (matching API logic exactly)
    const attendedFromActiveCourses = pastBookings.filter(b => {
      return ['attended', 'completed', 'booked'].includes(b.status) &&
             enrollments.some(e => {
               const classType = b.class_instances.class_type;
               const baseCourse = classType ? classType.split('.')[0] : '';
               return e.course_identifier === baseCourse;
             });
    }).length;

    // Calculate stats (matching API logic exactly)
    const remaining = currentAndFutureBookings.length;
    const totalBooked = remaining + attendedFromActiveCourses;
    const available = totalClassesAllocated - totalBooked;

    console.log('=== DASHBOARD STATS (WHAT API SHOULD RETURN) ===');
    const stats = {
      totalClassesAllocated,
      totalBooked,
      attended: attendedFromActiveCourses,
      remaining,
      available
    };
    console.log('Stats object:', JSON.stringify(stats, null, 2));

    console.log('\n=== VERIFICATION ===');
    console.log(`Expected remaining: 2`);
    console.log(`Actual remaining: ${remaining}`);

    if (remaining === 2) {
      console.log('✅ API logic is correct!');
      console.log('Issue must be in frontend display or caching');
    } else {
      console.log('❌ API logic needs fixing');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

testYeoDashboardDirect().then(() => process.exit());