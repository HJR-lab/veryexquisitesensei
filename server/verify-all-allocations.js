require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function verifyAllocations() {
  // Get a sample of students with different purchase counts
  const testStudents = [
    'joey.lee2302@gmail.com',    // Purchased: 1
    'shulingtan92@gmail.com',    // Purchased: 3
    'ironyv@yahoo.com.sg',       // Ivy Tan - Purchased: 2
    'meghna.n30@gmail.com',      // Purchased: 2
  ];

  console.log('\n' + '='.repeat(80));
  console.log('VERIFYING ALLOCATION CALCULATIONS');
  console.log('='.repeat(80));

  for (const email of testStudents) {
    const { data: student } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email, course_purchase_count, classes_used, classes_allocated')
      .ilike('email', email)
      .single();

    if (!student) {
      console.log(`\n❌ Student not found: ${email}`);
      continue;
    }

    // Get bookings
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('student_id', student.id)
      .in('status', ['booked', 'completed', 'cancelled', 'rescheduled', 'attended']);

    const attendedCount = bookings.filter(b => b.status === 'attended').length;
    const bookedCount = bookings.filter(b => b.status === 'booked').length;

    // Calculate what frontend should show
    const allocated = student.course_purchase_count * 6;
    const used = student.classes_used || attendedCount;
    const remaining = allocated - used;

    console.log(`\n${student.first_name} ${student.last_name} (${email})`);
    console.log('-'.repeat(80));
    console.log('DB course_purchase_count:', student.course_purchase_count);
    console.log('DB classes_used:', student.classes_used);
    console.log('Attended bookings:', attendedCount);
    console.log('Booked bookings:', bookedCount);
    console.log('\n📊 FRONTEND SHOULD SHOW:');
    console.log('  Allocated:', allocated, `(${student.course_purchase_count} × 6)`);
    console.log('  Used:', used);
    console.log('  Remaining:', remaining, `(${allocated} - ${used})`);
    console.log('  Booked:', bookedCount);
  }

  console.log('\n' + '='.repeat(80));
}

verifyAllocations().then(() => process.exit());
