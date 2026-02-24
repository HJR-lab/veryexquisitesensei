require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function verifyShulingFix() {
  // Find Shuling
  const { data: student } = await supabase
    .from('customers')
    .select('*')
    .ilike('email', 'shulingtan92@gmail.com')
    .single();

  console.log('\n='.repeat(60));
  console.log('SHULING TAN - DATABASE VALUES');
  console.log('='.repeat(60));
  console.log('ID:', student.id);
  console.log('Email:', student.email);
  console.log('course_purchase_count:', student.course_purchase_count);
  console.log('classes_used (from DB):', student.classes_used);
  console.log('classes_allocated (from DB):', student.classes_allocated);

  // Check bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('student_id', student.id)
    .in('status', ['booked', 'completed', 'cancelled', 'rescheduled', 'attended']);

  const attendedCount = bookings.filter(b => b.status === 'attended').length;
  const bookedCount = bookings.filter(b => b.status === 'booked').length;

  console.log('\nBookings Breakdown:');
  console.log('  - Attended bookings:', attendedCount);
  console.log('  - Booked bookings:', bookedCount);
  console.log('  - Total bookings:', bookings.length);

  console.log('\n' + '='.repeat(60));
  console.log('EXPECTED FRONTEND DISPLAY:');
  console.log('='.repeat(60));
  const allocated = student.course_purchase_count * 6;
  const used = student.classes_used || attendedCount;
  const remaining = allocated - used;

  console.log('Allocated:', allocated, '(course_purchase_count × 6 =', student.course_purchase_count, '× 6)');
  console.log('Used:', used, '(from database classes_used field)');
  console.log('Remaining:', remaining, '(allocated - used =', allocated, '-', used, ')');
  console.log('Booked:', bookedCount, '(current bookings with status "booked")');

  console.log('\n✅ This should match:');
  console.log('  Allocated: 18, Used: 12, Remaining: 6, Booked: 6');
}

verifyShulingFix().then(() => process.exit());
