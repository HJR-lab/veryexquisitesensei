require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function debugActiveStudentsList() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Today's date: ${today}\n`);

    // Get both Mitchell accounts
    const { data: mitchellAccounts } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .or('email.eq.Mitchell.chandx@gmail.com,email.eq.Mitchell.chandx+dup@gmail.com')
      .order('id');

    console.log(`Found ${mitchellAccounts.length} Mitchell accounts:\n`);
    mitchellAccounts.forEach(c => {
      console.log(`  ${c.first_name} ${c.last_name} (ID: ${c.id}) - ${c.email}`);
    });

    // Get all bookings with class instances
    const { data: allBookings } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date,
          start_time
        )
      `)
      .in('status', ['booked', 'completed', 'attended']);

    console.log(`\nTotal bookings in system: ${allBookings.length}\n`);

    // Build activeStudentIds set (same logic as backend)
    const activeStudentIds = new Set();
    allBookings.forEach(booking => {
      const classDate = booking.class_instances?.class_date;
      if (classDate && classDate >= today && booking.student_id) {
        activeStudentIds.add(booking.student_id);
      }
    });

    console.log(`Active student IDs (${activeStudentIds.size} students with future bookings):\n`);

    // Check if each Mitchell account is in the active set
    for (const account of mitchellAccounts) {
      const isActive = activeStudentIds.has(account.id);
      console.log(`\n=== ${account.first_name} ${account.last_name} (ID: ${account.id}) ===`);
      console.log(`In activeStudentIds set: ${isActive ? '✅ YES' : '❌ NO'}`);

      // Get their bookings
      const studentBookings = allBookings.filter(b => b.student_id === account.id);
      const futureBookings = studentBookings.filter(b =>
        b.class_instances && b.class_instances.class_date >= today
      );

      console.log(`Total bookings: ${studentBookings.length}`);
      console.log(`Future bookings (>= ${today}): ${futureBookings.length}`);

      if (futureBookings.length > 0) {
        console.log(`\nFuture classes:`);
        futureBookings.forEach(b => {
          if (b.class_instances) {
            console.log(`  ${b.class_instances.class_type} - ${b.class_instances.class_date} (${b.status})`);
          }
        });
      }

      // Check if they have WT1701PM_DL6 bookings
      const wt1701Bookings = studentBookings.filter(b =>
        b.class_instances && b.class_instances.class_type.startsWith('WT1701PM_DL6')
      );

      if (wt1701Bookings.length > 0) {
        console.log(`\nWT1701PM_DL6 bookings: ${wt1701Bookings.length}`);
        wt1701Bookings.forEach(b => {
          console.log(`  ${b.class_instances.class_date} (${b.status})`);
        });
      }
    }

    // Build studentCourseMap (same logic as backend)
    console.log(`\n\n=== STUDENT COURSE MAP ===\n`);

    const studentCourseMap = {};
    allBookings.forEach(booking => {
      const studentId = booking.student_id;
      const classInstance = booking.class_instances;

      if (!classInstance || !classInstance.class_type) return;

      const courseIdentifier = classInstance.class_type.split('.')[0];

      if (!studentCourseMap[studentId]) {
        studentCourseMap[studentId] = [];
      }

      const existingCourse = studentCourseMap[studentId].find(c => c.courseIdentifier === courseIdentifier);
      if (!existingCourse) {
        studentCourseMap[studentId].push({
          courseIdentifier,
          firstClassDate: classInstance.class_date
        });
      } else {
        // Update if this class is earlier
        if (classInstance.class_date < existingCourse.firstClassDate) {
          existingCourse.firstClassDate = classInstance.class_date;
        }
      }
    });

    for (const account of mitchellAccounts) {
      const courses = studentCourseMap[account.id] || [];
      console.log(`${account.first_name} ${account.last_name} (ID: ${account.id}):`);
      console.log(`  Courses: ${courses.map(c => c.courseIdentifier).join(', ') || 'none'}`);

      // Check course status
      courses.forEach(course => {
        const courseBookings = allBookings.filter(booking => {
          if (booking.student_id !== account.id) return false;
          const classInstance = booking.class_instances;
          if (!classInstance || !classInstance.class_type) return false;
          return classInstance.class_type.startsWith(course.courseIdentifier);
        });

        const hasStarted = courseBookings.some(booking => {
          const classDate = new Date(booking.class_instances.class_date);
          const todayDate = new Date(today);
          todayDate.setHours(0, 0, 0, 0);
          classDate.setHours(0, 0, 0, 0);
          return classDate <= todayDate;
        });

        const status = hasStarted ? 'current' : 'upcoming';
        console.log(`    ${course.courseIdentifier}: ${status} (first class: ${course.firstClassDate})`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

debugActiveStudentsList();
