require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkKarynChan() {
  try {
    console.log('Checking Karyn Chan course enrollments...\n');

    // Find Karyn Chan
    const { data: customers } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .ilike('first_name', '%karyn%')
      .ilike('last_name', '%chan%');

    if (!customers || customers.length === 0) {
      console.log('Karyn Chan not found');
      return;
    }

    const karyn = customers[0];
    console.log(`Found: ${karyn.first_name} ${karyn.last_name} (ID: ${karyn.id})`);
    console.log(`Email: ${karyn.email}`);
    console.log(`Course purchase count: ${karyn.course_purchase_count}\n`);

    // Get all bookings with class details
    const { data: bookings } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date,
          start_time,
          instructor
        )
      `)
      .eq('student_id', karyn.id)
      .in('status', ['booked', 'completed', 'attended'])
      .order('class_instances(class_date)', { ascending: true });

    console.log(`\nAll bookings (${bookings.length}):`);
    bookings.forEach(b => {
      if (b.class_instances) {
        console.log(`  ${b.class_instances.class_type} - ${b.class_instances.class_date} (${b.status})`);
      }
    });

    // Group by course identifier
    const courseGroups = {};
    bookings.forEach(b => {
      if (b.class_instances) {
        const courseId = b.class_instances.class_type.split('.')[0];
        if (!courseGroups[courseId]) {
          courseGroups[courseId] = [];
        }
        courseGroups[courseId].push(b);
      }
    });

    console.log(`\nGrouped by course:`);
    Object.keys(courseGroups).forEach(courseId => {
      const classes = courseGroups[courseId];
      const dates = classes.map(c => c.class_instances.class_date).sort();
      console.log(`\n${courseId}:`);
      console.log(`  ${classes.length} classes`);
      console.log(`  First class: ${dates[0]}`);
      console.log(`  Last class: ${dates[dates.length - 1]}`);
      console.log(`  Status: ${classes.map(c => c.status).join(', ')}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkKarynChan();
