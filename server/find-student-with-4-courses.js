require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function findStudentWith4Courses() {
  console.log('=== FINDING STUDENT WITH 4 COURSES ===\n');

  // The courses mentioned were:
  // 1. WT1701AM_DL6 (current - 1/6 attended)
  // 2. WT0410AM_JL6 (completed - 6/6 attended)
  // 3. WT2308AM_DL6 (completed - 6/6 attended)
  // 4. WT1207AM_JL6 (completed - 6/6 attended)

  // Search for students with bookings in all these courses
  const courseIds = ['WT1701AM', 'WT0410AM', 'WT2308AM', 'WT1207AM'];

  // Get all class instances with these course identifiers
  const { data: classes } = await supabase
    .from('class_instances')
    .select('id, class_type')
    .or(courseIds.map(id => `class_type.like.${id}%`).join(','));

  console.log(`Found ${classes?.length || 0} class instances matching the course patterns\n`);

  if (!classes || classes.length === 0) return;

  const classIds = classes.map(c => c.id);

  // Get all bookings for these classes
  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      student_id,
      class_instance_id,
      attended,
      class_instance:class_instances!bookings_class_instance_id_fkey (
        class_type,
        class_date
      ),
      customer:customers!bookings_student_id_fkey (
        id,
        first_name,
        last_name,
        email
      )
    `)
    .in('class_instance_id', classIds);

  console.log(`Found ${bookings?.length || 0} bookings for these courses\n`);

  // Group by student
  const studentBookings = {};
  bookings?.forEach(booking => {
    const studentId = booking.student_id;
    if (!studentBookings[studentId]) {
      studentBookings[studentId] = {
        name: `${booking.customer.first_name} ${booking.customer.last_name}`,
        email: booking.customer.email,
        courses: {}
      };
    }

    const courseId = booking.class_instance.class_type.match(/^(.+?)(?:\.\d+)?$/)?.[1];
    if (courseId) {
      if (!studentBookings[studentId].courses[courseId]) {
        studentBookings[studentId].courses[courseId] = [];
      }
      studentBookings[studentId].courses[courseId].push(booking);
    }
  });

  // Find students with all 4 courses
  console.log('=== STUDENTS WITH MULTIPLE COURSES ===\n');

  Object.entries(studentBookings).forEach(([studentId, data]) => {
    const courseCount = Object.keys(data.courses).length;
    if (courseCount >= 3) {
      console.log(`Student ID ${studentId}: ${data.name} (${data.email})`);
      console.log(`  Total courses: ${courseCount}`);
      Object.entries(data.courses).forEach(([courseId, bookings]) => {
        const attended = bookings.filter(b => b.attended).length;
        console.log(`    - ${courseId}: ${attended}/${bookings.length} attended`);
      });
      console.log('');
    }
  });
}

findStudentWith4Courses().then(() => process.exit());
