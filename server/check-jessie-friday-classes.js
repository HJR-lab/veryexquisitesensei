require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkJessieFridayClasses() {
  console.log('=== CHECKING JESSIE FRIDAY CLASSES (Oct 10 - Nov 14) ===\n');

  const jessieId = 1240;

  // Check for Friday classes between Oct 10 and Nov 14, 2025
  const { data: fridayClasses } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2025-10-10')
    .lte('class_date', '2025-11-14')
    .ilike('start_time', '9:30%')
    .order('class_date');

  console.log(`Found ${fridayClasses?.length || 0} classes between Oct 10 - Nov 14, 2025 at 9:30am:\n`);

  fridayClasses?.forEach((cls, idx) => {
    console.log(`${idx + 1}. ${cls.class_date} - ${cls.class_type}`);
    console.log(`   Time: ${cls.start_time} - ${cls.end_time}`);
    console.log(`   Instructor: ${cls.instructor_name}`);
    console.log(`   ID: ${cls.id}`);
    console.log('');
  });

  // Check if Jessie has bookings for any of these classes
  if (fridayClasses && fridayClasses.length > 0) {
    const classIds = fridayClasses.map(c => c.id);

    const { data: jessieBookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('student_id', jessieId)
      .in('class_instance_id', classIds);

    console.log(`\n📚 Jessie has ${jessieBookings?.length || 0} bookings for these Friday classes\n`);

    if (jessieBookings && jessieBookings.length > 0) {
      jessieBookings.forEach((b, idx) => {
        const cls = fridayClasses.find(c => c.id === b.class_instance_id);
        console.log(`${idx + 1}. Booking ID: ${b.id}`);
        console.log(`   Class: ${cls?.class_date} - ${cls?.class_type}`);
        console.log(`   Enrollment ID: ${b.course_enrollment_id}`);
        console.log('');
      });
    }
  }

  // Also check for any bookings Jessie has in October-November 2025
  const { data: allOctNovBookings } = await supabase
    .from('bookings')
    .select(`
      id,
      course_enrollment_id,
      class_instances!bookings_class_instance_id_fkey (
        id,
        class_type,
        class_date,
        start_time,
        end_time,
        instructor_name
      )
    `)
    .eq('student_id', jessieId)
    .gte('class_instances.class_date', '2025-10-01')
    .lte('class_instances.class_date', '2025-11-30')
    .order('class_instances(class_date)');

  console.log(`\n📅 All Jessie's bookings in Oct-Nov 2025: ${allOctNovBookings?.length || 0}\n`);

  allOctNovBookings?.forEach((b, idx) => {
    const ci = b.class_instances;
    console.log(`${idx + 1}. ${ci.class_date} - ${ci.class_type}`);
    console.log(`   Time: ${ci.start_time} - ${ci.end_time}`);
    console.log(`   Instructor: ${ci.instructor_name}`);
    console.log(`   Enrollment ID: ${b.course_enrollment_id}`);
    console.log('');
  });
}

checkJessieFridayClasses().then(() => process.exit());
