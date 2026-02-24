require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkEdithHistory() {
  console.log('\n=== CHECKING EDITH\'S COURSE HISTORY ===\n');

  // Find Edith
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('email', 'edithlmq@gmail.com')
    .single();

  if (!customer) {
    console.log('❌ Edith not found');
    return;
  }

  console.log('Customer:', customer.first_name, customer.last_name);
  console.log('Email:', customer.email);
  console.log('Customer ID:', customer.id);
  console.log('Classes Allocated:', customer.classes_allocated);
  console.log('Classes Used:', customer.classes_used);
  console.log('Course Purchase Count:', customer.course_purchase_count);

  // Get all enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('customer_id', customer.id)
    .order('enrollment_date', { ascending: false });

  console.log('\n📋 ALL ENROLLMENTS:', enrollments?.length || 0);
  if (!enrollments || enrollments.length === 0) {
    console.log('❌ NO ENROLLMENTS FOUND!');
  } else {
    enrollments.forEach((e, i) => {
    console.log(`\n${i + 1}. Enrollment ID: ${e.id}`);
    console.log(`   Course Identifier: ${e.course_identifier}`);
    console.log(`   Enrollment Date: ${e.enrollment_date}`);
    console.log(`   Start Date: ${e.start_date}`);
    console.log(`   End Date: ${e.end_date}`);
    console.log(`   Status: ${e.status}`);
    console.log(`   Instructor: ${e.instructor_name || 'N/A'}`);
    console.log(`   Shopify Order ID: ${e.shopify_order_id || 'N/A'}`);
  });
  }

  // Get all bookings grouped by course
  const { data: allBookings } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      class_instances!bookings_class_instance_id_fkey (
        id,
        class_type,
        class_date,
        end_time,
        instructor_name
      )
    `)
    .eq('student_id', customer.id)
    .order('class_instances(class_date)', { ascending: true });

  console.log('\n📚 ALL BOOKINGS:', allBookings.length);

  // Group bookings by course identifier
  const bookingsByCourse = {};
  const now = new Date();

  allBookings.forEach(b => {
    if (!b.class_instances) return;

    const courseId = b.class_instances.class_type;
    const courseBase = courseId.match(/^(.+?)(?:\.\d+)?$/)?.[1] || courseId;

    if (!bookingsByCourse[courseBase]) {
      bookingsByCourse[courseBase] = [];
    }

    // Check if class has ended
    const classDate = b.class_instances.class_date.split('T')[0];
    const endTime = b.class_instances.end_time;
    const timeParts = endTime.match(/(\d+):(\d+)(am|pm)/i);

    let hasEnded = false;
    if (timeParts) {
      let hours = parseInt(timeParts[1]);
      const minutes = parseInt(timeParts[2]);
      const period = timeParts[3].toLowerCase();

      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;

      const [year, month, day] = classDate.split('-');
      const classEndDateTime = new Date(year, month - 1, day, hours, minutes);
      hasEnded = classEndDateTime < now;
    }

    bookingsByCourse[courseBase].push({
      ...b,
      hasEnded,
      classDate: b.class_instances.class_date,
      instructor: b.class_instances.instructor_name
    });
  });

  console.log('\n📊 BOOKINGS BY COURSE:');
  Object.entries(bookingsByCourse).forEach(([courseBase, bookings]) => {
    const total = bookings.length;
    const attended = bookings.filter(b =>
      (b.status === 'attended' || b.status === 'completed') && b.hasEnded
    ).length;
    const firstClass = bookings[0];
    const lastClass = bookings[bookings.length - 1];

    console.log(`\n📘 ${courseBase}`);
    console.log(`   Total Bookings: ${total}`);
    console.log(`   Attended: ${attended}/${total}`);
    console.log(`   First Class: ${firstClass.classDate.split('T')[0]}`);
    console.log(`   Last Class: ${lastClass.classDate.split('T')[0]}`);
    console.log(`   Instructor: ${firstClass.instructor || 'N/A'}`);
    console.log(`   All Statuses: ${bookings.map(b => b.status).join(', ')}`);
  });

  // Check Shopify orders
  console.log('\n🛍️  Checking Shopify orders...');
  const { data: shopifyOrders } = await supabase
    .from('shopify_order_sync')
    .select('*')
    .eq('customer_email', 'edithlmq@gmail.com')
    .order('order_date', { ascending: false });

  console.log('\nShopify Orders:', shopifyOrders?.length || 0);
  shopifyOrders?.forEach(order => {
    console.log(`\n   Order #${order.shopify_order_id}`);
    console.log(`   Date: ${order.order_date}`);
    console.log(`   Product: ${order.product_title}`);
    console.log(`   Synced: ${order.synced ? '✅' : '❌'}`);
    console.log(`   Enrollment Created: ${order.enrollment_created ? '✅' : '❌'}`);
  });
}

checkEdithHistory().then(() => process.exit());
