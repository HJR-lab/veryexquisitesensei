require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkUpcomingCourses() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Today: ${today}\n`);

    const studentIds = [
      { id: 1116, name: 'Mitchell Chan' },
      { id: 1198, name: 'Meghna N' },
      { id: 1226, name: 'Meghna .' },
      { id: 1346, name: 'Clarissa ow' },
      { id: 1395, name: 'Clarissa Cheong' },
      { id: 2350, name: 'Clarissa Rozario' }
    ];

    for (const student of studentIds) {
      console.log(`=== ${student.name} (ID: ${student.id}) ===`);

      const { data: bookings } = await supabaseDb.supabase
        .from('bookings')
        .select(`
          *,
          class_instances!bookings_class_instance_id_fkey (
            class_type,
            class_date
          )
        `)
        .eq('student_id', student.id)
        .in('status', ['booked', 'completed', 'attended']);

      if (!bookings || bookings.length === 0) {
        console.log('  No bookings\n');
        continue;
      }

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

      Object.keys(courses).forEach(courseId => {
        const dates = courses[courseId].sort();
        const firstDate = dates[0];
        const allFuture = dates.every(d => d > today);
        const status = allFuture ? 'UPCOMING' : 'CURRENT';

        console.log(`  ${courseId}: ${status} (first: ${firstDate}, ${dates.length} classes)`);
      });

      console.log('');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkUpcomingCourses();
