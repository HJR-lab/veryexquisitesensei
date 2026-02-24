require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkSarahCherDetail() {
  console.log('=== SARAH CHER DETAILED ANALYSIS ===\n');

  const sarahId = 1197;

  // Get enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', sarahId)
    .order('course_start_date');

  console.log(`📋 ENROLLMENTS: ${enrollments?.length || 0}\n`);
  enrollments?.forEach((e, i) => {
    console.log(`${i + 1}. Enrollment ID: ${e.id}`);
    console.log(`   Course: ${e.course_title}`);
    console.log(`   Identifier: ${e.course_identifier}`);
    console.log(`   Start: ${e.course_start_date}, End: ${e.course_end_date}`);
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
    .eq('student_id', sarahId)
    .order('class_instances(class_date)');

  console.log(`📚 BOOKINGS: ${bookings?.length || 0}\n`);

  // Group by enrollment
  enrollments?.forEach(enrollment => {
    const enrollmentBookings = bookings?.filter(b => b.course_enrollment_id === enrollment.id) || [];

    console.log(`\n📘 Enrollment ${enrollment.id} - ${enrollment.course_identifier || 'No identifier'}`);
    console.log(`   Total Bookings: ${enrollmentBookings.length}`);

    const extractCourseIdentifier = (classType) => {
      if (!classType) return null;
      const match = classType.match(/^(.+?)(?:\.\d+)?$/);
      return match ? match[1] : classType;
    };

    const classTypes = new Set();
    enrollmentBookings.forEach(b => {
      if (b.class_instances?.class_type) {
        classTypes.add(extractCourseIdentifier(b.class_instances.class_type));
      }
    });

    console.log(`   Unique course identifiers: ${classTypes.size}`);
    if (classTypes.size > 0) {
      console.log('   Course identifiers:');
      [...classTypes].forEach(ct => console.log(`     - ${ct}`));
    }

    console.log('   Classes:');
    enrollmentBookings.forEach((b, idx) => {
      const ci = b.class_instances;
      if (!ci) return;
      console.log(`     ${idx + 1}. ${ci.class_date?.split('T')[0]} - ${ci.class_type} (${ci.start_time}-${ci.end_time})`);
    });
  });

  console.log('\n\n=== CURRENT STATUS ===');
  console.log('Sarah Cher has 2 courses based on booking data');
  console.log('If she should have 3 courses, we need to know which course is missing');
}

checkSarahCherDetail().then(() => process.exit());
