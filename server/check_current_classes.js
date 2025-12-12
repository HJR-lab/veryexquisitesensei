require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkCurrentClasses() {
  // Get all class instances
  const { data: classInstances } = await supabase
    .from('class_instances')
    .select('*')
    .order('class_date', { ascending: false })
    .limit(20);

  console.log('Recent class instances:');
  console.log(JSON.stringify(classInstances, null, 2));

  // Get current date
  const today = new Date().toISOString().split('T')[0];
  console.log(`\nToday: ${today}`);

  // Get ongoing classes (class_date >= today)
  const { data: ongoingClasses } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', today)
    .order('class_date', { ascending: true })
    .limit(10);

  console.log(`\nOngoing/upcoming classes: ${ongoingClasses?.length || 0}`);
  if (ongoingClasses) {
    ongoingClasses.forEach(c => {
      console.log(`  - ${c.class_date} ${c.start_time} (${c.class_type})`);
    });
  }

  // Get bookings for ongoing classes
  if (ongoingClasses && ongoingClasses.length > 0) {
    const classIds = ongoingClasses.map(c => c.id);

    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        id,
        student_id,
        status,
        class_instance:class_instances!bookings_class_instance_id_fkey (
          class_date,
          class_type
        ),
        student:customers!bookings_student_id_fkey (
          email,
          first_name,
          last_name
        )
      `)
      .in('class_instance_id', classIds)
      .in('status', ['booked', 'completed']);

    console.log(`\nBookings for ongoing classes: ${bookings?.length || 0}`);
    if (bookings) {
      const uniqueStudents = new Set(bookings.map(b => b.student_id));
      console.log(`Unique students enrolled: ${uniqueStudents.size}`);

      console.log('\nStudents in current classes:');
      bookings.slice(0, 20).forEach(b => {
        console.log(`  - ${b.student?.email}: ${b.class_instance?.class_date} (${b.status})`);
      });
    }
  }

  process.exit(0);
}

checkCurrentClasses();
