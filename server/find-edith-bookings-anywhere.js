require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function findEdithBookingsAnywhere() {
  console.log('\n=== SEARCHING FOR EDITH\'S BOOKINGS EVERYWHERE ===\n');

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('email', 'edithlmq@gmail.com')
    .single();

  console.log('Customer ID:', customer.id);
  console.log('Email:', customer.email);

  // Get ALL bookings for this student (no enrollment filter)
  const { data: allBookings } = await supabase
    .from('bookings')
    .select(`
      *,
      class_instances!bookings_class_instance_id_fkey (
        *
      )
    `)
    .eq('student_id', customer.id);

  console.log(`\n📚 TOTAL BOOKINGS: ${allBookings?.length || 0}\n`);

  if (allBookings && allBookings.length > 0) {
    allBookings.forEach((b, idx) => {
      console.log(`${idx + 1}. Booking ID: ${b.id}`);
      console.log(`   Status: ${b.status}`);
      console.log(`   Attended: ${b.attended}`);
      console.log(`   Enrollment ID: ${b.course_enrollment_id || 'NULL'}`);
      if (b.class_instances) {
        console.log(`   Class Date: ${b.class_instances.class_date}`);
        console.log(`   Class Type: ${b.class_instances.class_type}`);
        console.log(`   Time: ${b.class_instances.start_time} - ${b.class_instances.end_time}`);
        console.log(`   Instructor: ${b.class_instances.instructor_name || 'N/A'}`);
      }
      console.log('');
    });
  } else {
    console.log('❌ NO BOOKINGS FOUND FOR EDITH!');
    console.log('\nThis means:');
    console.log('1. Edith has never been enrolled in any classes in this system');
    console.log('2. OR her bookings were deleted');
    console.log('3. OR the current course WT1701AM_DL6 shown in Student Management is coming from a different data source');
  }

  // Check if there are class instances with WT1701 that Edith should be in
  console.log('\n\n🔍 SEARCHING FOR WT1701 CLASSES...\n');

  const { data: wt1701Classes } = await supabase
    .from('class_instances')
    .select('*')
    .ilike('class_type', '%WT1701%')
    .order('class_date', { ascending: true });

  console.log(`Found ${wt1701Classes?.length || 0} WT1701 classes\n`);

  if (wt1701Classes && wt1701Classes.length > 0) {
    console.log('Sample classes:');
    wt1701Classes.slice(0, 5).forEach(c => {
      console.log(`  - ${c.class_date}: ${c.class_type} (${c.start_time}-${c.end_time}) [${c.instructor_name}]`);
    });
  }
}

findEdithBookingsAnywhere().then(() => process.exit());
