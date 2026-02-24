require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function findKevynJessie() {
  console.log('=== FINDING KEVYN.JESSIE@GMAIL.COM ===\n');

  // Find customer with kevyn.jessie@gmail.com
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('email', 'kevyn.jessie@gmail.com')
    .single();

  if (!customer) {
    console.log('❌ No customer found with email kevyn.jessie@gmail.com');

    // Search for similar emails
    const { data: similar } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email')
      .ilike('email', '%kevyn%')
      .or('email.ilike.%jessie%');

    console.log(`\nFound ${similar?.length || 0} customers with similar emails:\n`);
    similar?.forEach(c => {
      console.log(`- ${c.first_name} ${c.last_name} (${c.email}) - ID: ${c.id}`);
    });

    return;
  }

  console.log('✅ Found customer:');
  console.log(`Name: ${customer.first_name} ${customer.last_name}`);
  console.log(`Email: ${customer.email}`);
  console.log(`ID: ${customer.id}`);
  console.log(`course_purchase_count: ${customer.course_purchase_count}`);

  // Get enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', customer.id)
    .order('course_start_date');

  console.log(`\n📋 ENROLLMENTS: ${enrollments?.length || 0}\n`);
  enrollments?.forEach((e, i) => {
    console.log(`${i + 1}. Enrollment ID: ${e.id}`);
    console.log(`   Course: ${e.course_title}`);
    console.log(`   Identifier: ${e.course_identifier}`);
    console.log(`   Start: ${e.course_start_date}, End: ${e.course_end_date}`);
    console.log('');
  });

  // Get bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      course_enrollment_id,
      class_instances!bookings_class_instance_id_fkey (
        id,
        class_type,
        class_date,
        start_time,
        end_time
      )
    `)
    .eq('student_id', customer.id)
    .order('class_instances(class_date)');

  console.log(`📚 BOOKINGS: ${bookings?.length || 0}\n`);

  // Group by course identifier
  const extractCourseIdentifier = (classType) => {
    if (!classType) return null;
    const match = classType.match(/^(.+?)(?:\.\d+)?$/);
    return match ? match[1] : classType;
  };

  const courseMap = {};
  bookings?.forEach(b => {
    const courseId = extractCourseIdentifier(b.class_instances?.class_type);
    if (courseId) {
      if (!courseMap[courseId]) {
        courseMap[courseId] = [];
      }
      courseMap[courseId].push(b);
    }
  });

  console.log('Courses attended:\n');
  Object.keys(courseMap).forEach((courseId, idx) => {
    console.log(`${idx + 1}. ${courseId} (${courseMap[courseId].length} bookings)`);
    courseMap[courseId].forEach((b, i) => {
      const ci = b.class_instances;
      console.log(`   ${i + 1}. ${ci.class_date?.split('T')[0]} - ${ci.class_type}`);
    });
    console.log('');
  });

  // Check for Friday March 14 - April 25, 2025 classes
  console.log('\n=== CHECKING FOR MARCH-APRIL 2025 FRIDAY CLASSES ===\n');

  const marchAprilBookings = bookings?.filter(b => {
    const date = b.class_instances?.class_date;
    return date >= '2025-03-14' && date <= '2025-04-25';
  });

  console.log(`Found ${marchAprilBookings?.length || 0} bookings between March 14 - April 25, 2025:\n`);
  marchAprilBookings?.forEach((b, idx) => {
    const ci = b.class_instances;
    console.log(`${idx + 1}. ${ci.class_date?.split('T')[0]} - ${ci.class_type} (${ci.start_time} - ${ci.end_time})`);
  });
}

findKevynJessie().then(() => process.exit());
