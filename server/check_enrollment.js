require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkEnrollment() {
  // Get all bookings with class details
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      id,
      student_id,
      status,
      class_instances!bookings_class_instance_id_fkey (
        id,
        class_date,
        class_type,
        instructor,
        start_time
      )
    `)
    .limit(10);

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log('📊 Sample bookings (first 10):');
  bookings.forEach(b => {
    const cls = b.class_instances;
    console.log(`  - Student ${b.student_id}: ${cls.class_type} on ${cls.class_date} (${b.status})`);
  });

  // Get total count
  const { count } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true });

  console.log(`\n✅ Total bookings: ${count}`);

  // Get enrollment per class
  const { data: classes } = await supabase
    .from('class_instances')
    .select('id, class_type, class_date, instructor')
    .order('class_date', { ascending: true })
    .limit(10);

  console.log(`\n📋 Checking enrollment for first 10 classes:`);

  for (const cls of classes) {
    const { count: enrollmentCount } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('class_instance_id', cls.id)
      .in('status', ['booked', 'completed']);

    console.log(`  - ${cls.class_type} (${cls.class_date}): ${enrollmentCount} students`);
  }

  process.exit(0);
}

checkEnrollment();
