require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkShulingOrders() {
  // Find Shuling in database
  const { data: student } = await supabase
    .from('customers')
    .select('*')
    .ilike('email', 'shulingtan92@gmail.com')
    .single();

  console.log('Shuling Tan:', student);
  console.log('Course Purchase Count:', student.course_purchase_count);
  console.log('Shopify Customer ID:', student.shopify_customer_id);

  // Check her enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', student.id);

  console.log('\nEnrollments:', enrollments ? enrollments.length : 0);
  if (enrollments) {
    enrollments.forEach(e => {
      console.log(`  - ${e.course_title} (${e.course_identifier}) - Status: ${e.status}`);
    });
  }

  // Check bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('student_id', student.id);

  console.log('\nBookings:', bookings ? bookings.length : 0);
  const byStatus = {};
  bookings?.forEach(b => {
    byStatus[b.status] = (byStatus[b.status] || 0) + 1;
  });
  Object.keys(byStatus).forEach(status => {
    console.log(`  - ${status}: ${byStatus[status]}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('ANALYSIS:');
  console.log(`Course Purchase Count says: ${student.course_purchase_count} courses`);
  console.log(`Should have: ${student.course_purchase_count * 6} bookings`);
  console.log(`Actually has: ${bookings.length} bookings`);
  console.log(`Missing: ${(student.course_purchase_count * 6) - bookings.length} bookings`);
}

checkShulingOrders().then(() => process.exit());
