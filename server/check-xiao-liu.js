require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkXiaoLiu() {
  console.log("=== CHECKING XIAO LIU'S DATA ===\n");

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', 2220)
    .single();

  console.log('Customer:', customer.first_name, customer.last_name);
  console.log('ID:', customer.id);
  console.log('Email:', customer.email);

  // Get enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', 2220)
    .order('course_start_date');

  console.log(`\n📋 ENROLLMENTS: ${enrollments?.length || 0}\n`);
  enrollments?.forEach((e, i) => {
    console.log(`${i + 1}. Enrollment ID: ${e.id}`);
    console.log(`   Course: ${e.course_title}`);
    console.log(`   Identifier: ${e.course_identifier}`);
    console.log(`   Start: ${e.course_start_date}`);
    console.log(`   End: ${e.course_end_date}`);
    console.log(`   Status: ${e.status}`);
    console.log('');
  });

  // Get all bookings with class details
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      course_enrollment_id,
      class_instances!bookings_class_instance_id_fkey (
        id,
        class_type,
        class_date,
        start_time,
        end_time
      )
    `)
    .eq('student_id', 2220)
    .order('class_instances(class_date)');

  console.log(`\n📚 BOOKINGS: ${bookings?.length || 0}\n`);

  // Group by enrollment
  enrollments?.forEach((enrollment) => {
    const enrollmentBookings = bookings?.filter(b => b.course_enrollment_id === enrollment.id) || [];
    
    console.log(`\n📘 Enrollment ${enrollment.id} - ${enrollment.course_identifier || 'No identifier'}`);
    console.log(`   Total Bookings: ${enrollmentBookings.length}`);
    
    const classTypes = new Set();
    enrollmentBookings.forEach(b => {
      if (b.class_instances?.class_type) {
        classTypes.add(b.class_instances.class_type);
      }
    });
    
    console.log(`   Unique class_types: ${classTypes.size}`);
    console.log('   Classes:');
    enrollmentBookings.forEach((b, idx) => {
      const ci = b.class_instances;
      if (!ci) return;
      console.log(`     ${idx + 1}. ${ci.class_date.split('T')[0]} - ${ci.class_type} (${ci.start_time}-${ci.end_time})`);
    });
  });
}

checkXiaoLiu().then(() => process.exit());
