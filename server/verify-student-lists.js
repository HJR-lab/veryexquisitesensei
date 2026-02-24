require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function verifyStudentLists() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Today: ${today}\n`);

    // Students we're checking
    const testStudents = [
      { name: 'Mitchell Chan', email: 'Mitchell.chandx@gmail.com' },
      { name: 'Sarah Chan', email: 'Mitchell.chandx+dup@gmail.com' },
      { name: 'Meghna', email: 'meghna@newcampus.com' },
      { name: 'Clarissa Rozario', email: 'rozarioclarissa@gmail.com' }
    ];

    for (const student of testStudents) {
      console.log(`=== ${student.name} ===`);

      // Get customer
      const { data: customer } = await supabaseDb.supabase
        .from('customers')
        .select('*')
        .eq('email', student.email)
        .single();

      if (!customer) {
        console.log('  Not found\n');
        continue;
      }

      // Get bookings
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

      // Group by course
      const courses = {};
      if (bookings) {
        bookings.forEach(b => {
          if (b.class_instances) {
            const courseId = b.class_instances.class_type.split('.')[0];
            if (!courses[courseId]) {
              courses[courseId] = [];
            }
            courses[courseId].push(b.class_instances.class_date);
          }
        });
      }

      // Determine course statuses
      let hasCurrent = false;
      let hasUpcoming = false;
      const currentCourses = [];
      const upcomingCourses = [];

      Object.keys(courses).forEach(courseId => {
        const dates = courses[courseId].sort();
        const hasStarted = dates.some(d => d <= today);

        if (hasStarted) {
          hasCurrent = true;
          currentCourses.push(courseId);
        } else {
          hasUpcoming = true;
          upcomingCourses.push(courseId);
        }
      });

      console.log(`  Current courses: ${currentCourses.join(', ') || 'None'}`);
      console.log(`  Upcoming courses: ${upcomingCourses.join(', ') || 'None'}`);
      console.log(`  Should appear in Active Students: ${hasCurrent ? 'YES' : 'NO'}`);
      console.log(`  Should appear in Upcoming Enrollments: ${hasUpcoming ? 'YES' : 'NO'}`);
      console.log('');
    }

    console.log('=== EXPECTED RESULTS ===');
    console.log('Active Students:');
    console.log('  - Mitchell Chan (WT1701PM_DL6)');
    console.log('  - Sarah Chan (WT1701PM_DL6)');
    console.log('');
    console.log('Upcoming Enrollments:');
    console.log('  - Mitchell Chan (WT2802PM_JL6)');
    console.log('  - Sarah Chan (WT2802PM_JL6)');
    console.log('  - Meghna (WT0103AM_JL6)');
    console.log('  - Clarissa Rozario (WT1003NT_JL6)');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

verifyStudentLists();
