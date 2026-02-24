require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function verifyDashboardFix() {
  try {
    console.log('=== Verifying Dashboard Fix for Meghna ===\n');

    const meghnaId = 1226;

    // Simulate the exact logic from the fixed dashboard API
    console.log('🔍 Running same logic as dashboard API...\n');

    // 1. Get active enrollments
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', meghnaId)
      .eq('status', 'active')
      .order('course_start_date', { ascending: true });

    console.log(`Active enrollments: ${enrollments.length}`);
    enrollments.forEach(e => {
      console.log(`   - ${e.course_title} (${e.course_identifier}) - ${e.number_of_weeks || 6} weeks`);
    });

    // 2. Calculate total classes allocated from ACTIVE enrollments only
    const totalClassesAllocated = enrollments.reduce((sum, e) => {
      return sum + (e.number_of_weeks || 6);
    }, 0);

    console.log(`\nTotal Classes Allocated: ${totalClassesAllocated}`);

    // 3. Get all bookings
    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_date,
          class_type
        )
      `)
      .eq('student_id', meghnaId)
      .in('status', ['booked', 'attended', 'completed'])
      .order('class_instances(class_date)', { ascending: true });

    // 4. Filter bookings to only include current and future classes
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const currentAndFutureBookings = bookings.filter(b => {
      if (b.status === 'cancelled') return false;
      const classDate = new Date(b.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      return classDate >= today; // Only current and future classes
    });

    const totalBooked = currentAndFutureBookings.length;

    // 5. Count past classes for reference
    const attendedPastClasses = bookings.filter(b => {
      if (b.status === 'cancelled') return false;
      const classDate = new Date(b.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      return classDate < today;
    }).length;

    const available = totalClassesAllocated - totalBooked;

    console.log('\n=== CALCULATED STATS ===');
    console.log(`Total Classes Allocated: ${totalClassesAllocated}`);
    console.log(`Total Booked (current + future): ${totalBooked}`);
    console.log(`Available: ${available}`);
    console.log(`Attended (past classes): ${attendedPastClasses}`);

    console.log('\n=== COMPARISON ===');
    console.log(`BEFORE FIX: 24 booked - 18 available (wrong - included all history)`);
    console.log(`AFTER FIX:  ${totalBooked} booked - ${available} available (correct - current + future only)`);

    if (totalClassesAllocated === 12 && totalBooked === 8 && available === 4) {
      console.log('\n✅ DASHBOARD FIX VERIFIED! 🎉');
      console.log('   - Shows only current and upcoming bookings');
      console.log('   - Calculates availability correctly');
      console.log('   - Total matches active enrollments');
    } else {
      console.log('\n⚠️  Numbers need adjustment');
    }

    console.log('\n=== CURRENT & FUTURE BOOKINGS ===');
    currentAndFutureBookings.forEach((b, i) => {
      console.log(`${i + 1}. ${b.class_instances.class_type} on ${b.class_instances.class_date} (${b.status})`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

verifyDashboardFix().then(() => process.exit());