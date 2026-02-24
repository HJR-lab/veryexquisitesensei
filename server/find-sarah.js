require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function findSarah() {
  try {
    console.log('Finding Sarah...\n');

    // Find Sarah
    const { data: customers } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .ilike('first_name', '%sarah%');

    console.log(`Found ${customers.length} Sarah(s):`);
    customers.forEach(c => {
      console.log(`  ${c.first_name} ${c.last_name} (ID: ${c.id}) - ${c.email}`);
    });

    if (customers.length === 0) return;

    // Get bookings for each Sarah
    for (const sarah of customers) {
      console.log(`\n=== ${sarah.first_name} ${sarah.last_name} (${sarah.email}) ===`);

      const { data: bookings } = await supabaseDb.supabase
        .from('bookings')
        .select(`
          *,
          class_instances!bookings_class_instance_id_fkey (
            class_type,
            class_date,
            start_time
          )
        `)
        .eq('student_id', sarah.id)
        .in('status', ['booked', 'completed', 'attended'])
        .order('class_instances(class_date)', { ascending: true });

      console.log(`\nBookings (${bookings.length}):`);

      // Group by course
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

      Object.keys(courseGroups).forEach(courseId => {
        const classes = courseGroups[courseId];
        const dates = classes.map(c => c.class_instances.class_date).sort();
        console.log(`\n  ${courseId}:`);
        console.log(`    ${classes.length} classes`);
        console.log(`    First: ${dates[0]}`);
        console.log(`    Last: ${dates[dates.length - 1]}`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

findSarah();
