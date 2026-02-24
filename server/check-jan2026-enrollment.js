require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkJan2026Enrollment() {
  console.log('=== CHECKING JAN 2026 BOOKINGS ===\n');

  const sarahId = 1197;

  // Get all bookings with class details
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      course_enrollment_id,
      class_instances!bookings_class_instance_id_fkey (
        class_type,
        class_date
      )
    `)
    .eq('student_id', sarahId)
    .order('class_instances(class_date)');

  console.log(`Total bookings: ${bookings?.length || 0}\n`);

  // Filter for WT1801AM (Jan 2026 classes)
  const jan2026Bookings = bookings?.filter(b =>
    b.class_instances?.class_type?.includes('WT1801AM')
  ) || [];

  console.log(`WT1801AM bookings (Jan 2026): ${jan2026Bookings.length}\n`);

  jan2026Bookings.forEach(b => {
    console.log(`- Booking ID: ${b.id}, Enrollment: ${b.course_enrollment_id}, Class: ${b.class_instances.class_type}, Date: ${b.class_instances.class_date}`);
  });

  if (jan2026Bookings.length > 0) {
    const enrollmentId = jan2026Bookings[0].course_enrollment_id;
    console.log(`\n=== CHECKING ENROLLMENT ${enrollmentId} ===\n`);

    const { data: enrollment } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('id', enrollmentId)
      .single();

    console.log(`Status: ${enrollment?.status}`);
    console.log(`Course Type: ${enrollment?.course_type}`);
    console.log(`Start Date: ${enrollment?.course_start_date}`);

    if (enrollment?.status !== 'active') {
      console.log(`\n⚠️  PROBLEM: Enrollment ${enrollmentId} has status='${enrollment?.status}' but should be 'active'`);
    }
  }
}

checkJan2026Enrollment().then(() => process.exit());
