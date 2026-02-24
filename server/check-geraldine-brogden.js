require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkGeraldine() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Today: ${today}\n`);

    // Find Geraldine Brogden
    const { data: customers } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .ilike('first_name', '%geraldine%')
      .ilike('last_name', '%brogden%');

    if (!customers || customers.length === 0) {
      console.log('Geraldine Brogden not found');
      return;
    }

    for (const customer of customers) {
      console.log(`=== ${customer.first_name} ${customer.last_name} (ID: ${customer.id}) ===`);
      console.log(`Email: ${customer.email}`);
      console.log(`Course Purchase Count: ${customer.course_purchase_count}\n`);

      // Get all bookings
      const { data: bookings } = await supabaseDb.supabase
        .from('bookings')
        .select(`
          *,
          class_instances!bookings_class_instance_id_fkey (
            class_type,
            class_date
          )
        `)
        .eq('student_id', customer.id)
        .in('status', ['booked', 'completed', 'attended']);

      if (!bookings || bookings.length === 0) {
        console.log('No bookings\n');
        continue;
      }

      // Group by course
      const courses = {};
      bookings.forEach(b => {
        if (b.class_instances) {
          const courseId = b.class_instances.class_type.split('.')[0];
          if (!courses[courseId]) {
            courses[courseId] = [];
          }
          courses[courseId].push(b.class_instances.class_date);
        }
      });

      console.log('Courses:');
      Object.keys(courses).forEach(courseId => {
        const dates = courses[courseId].sort();
        const firstDate = dates[0];
        const lastDate = dates[dates.length - 1];
        const hasStarted = dates.some(d => d <= today);
        const allFuture = dates.every(d => d > today);
        const status = hasStarted ? 'CURRENT' : 'UPCOMING';

        console.log(`  ${courseId}: ${status}`);
        console.log(`    First class: ${firstDate}`);
        console.log(`    Last class: ${lastDate}`);
        console.log(`    ${dates.length} total classes`);
        console.log(`    Has started: ${hasStarted}`);
        console.log(`    All future: ${allFuture}`);
      });

      console.log('');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkGeraldine();
