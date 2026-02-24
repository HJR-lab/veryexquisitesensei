require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkMitchellSarahCourses() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Today: ${today}\n`);

    const students = [
      { email: 'Mitchell.chandx@gmail.com', name: 'Mitchell Chan' },
      { email: 'Mitchell.chandx+dup@gmail.com', name: 'Sarah Chan' }
    ];

    for (const student of students) {
      console.log(`=== ${student.name} ===`);

      // Get customer info
      const { data: customer } = await supabaseDb.supabase
        .from('customers')
        .select('*')
        .eq('email', student.email)
        .single();

      console.log(`  ID: ${customer.id}`);
      console.log(`  Course Purchase Count: ${customer.course_purchase_count}\n`);

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
        console.log('  No bookings\n');
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

      console.log('  Courses:');
      Object.keys(courses).forEach(courseId => {
        const dates = courses[courseId].sort();
        const firstDate = dates[0];
        const lastDate = dates[dates.length - 1];
        const hasStarted = dates.some(d => d <= today);
        const status = hasStarted ? 'CURRENT' : 'UPCOMING';

        console.log(`    ${courseId}: ${status}`);
        console.log(`      First class: ${firstDate}`);
        console.log(`      Last class: ${lastDate}`);
        console.log(`      ${dates.length} total classes`);
      });

      console.log('');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkMitchellSarahCourses();
