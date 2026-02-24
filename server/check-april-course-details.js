require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkAprilCourseDetails() {
  console.log('=== CHECKING APRIL\'S COURSE DETAILS ===\n');

  const aprilId = 1182;

  // Get April's Tuesday enrollment
  const { data: enrollment } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', aprilId)
    .eq('schedule_pattern', 'TUESDAY')
    .single();

  if (!enrollment) {
    console.log('No Tuesday enrollment found');
    return;
  }

  console.log('Enrollment:', {
    id: enrollment.id,
    course_type: enrollment.course_type,
    schedule_pattern: enrollment.schedule_pattern,
    start_date: enrollment.course_start_date,
    start_time: enrollment.start_time,
    end_time: enrollment.end_time,
    status: enrollment.status
  });

  // Check what Tuesday classes exist for this course
  console.log('\n=== TUESDAY CLASSES (Jan-Mar 2026) ===\n');

  const { data: allClasses } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2026-01-20')
    .lte('class_date', '2026-03-31')
    .ilike('class_type', '%WT%')
    .order('class_date');

  // Filter for Tuesday classes
  const tuesdayClasses = allClasses?.filter(c => {
    const date = new Date(c.class_date);
    return date.getDay() === 2; // Tuesday
  });

  console.log(`Found ${tuesdayClasses?.length || 0} Tuesday wheelthrowing classes\n`);

  tuesdayClasses?.forEach((c, i) => {
    const date = new Date(c.class_date);
    console.log(`${i + 1}. ${c.class_date.split('T')[0]} (${date.toLocaleDateString('en-US', { weekday: 'long' })})`);
    console.log(`   Class Type: ${c.class_type}`);
    console.log(`   Time: ${c.start_time} - ${c.end_time}`);
    console.log(`   Instructor: ${c.instructor}`);
    console.log(`   Room: ${c.room}`);
    console.log('');
  });

  // Check April's bookings against these classes
  console.log('\n=== APRIL\'S BOOKINGS VS TUESDAY CLASSES ===\n');

  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      booking_type,
      class_instance:class_instances!bookings_class_instance_id_fkey (
        id,
        class_date,
        class_type,
        start_time
      )
    `)
    .eq('student_id', aprilId)
    .gte('class_instance.class_date', '2026-01-20')
    .order('class_instance(class_date)');

  bookings?.forEach(b => {
    const classDate = new Date(b.class_instance.class_date);
    const dayName = classDate.toLocaleDateString('en-US', { weekday: 'long' });
    console.log(`${b.class_instance.class_date.split('T')[0]} (${dayName}): ${b.class_instance.class_type}`);
    console.log(`  Status: ${b.status}, Type: ${b.booking_type}`);
    console.log('');
  });
}

checkAprilCourseDetails().then(() => process.exit());
