require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkAmyXiaoLiu() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    console.log(`Today: ${today.toISOString().split('T')[0]}\n`);

    // Get Amy Xiao Liu
    const { data: amy } = await supabase
      .from('customers')
      .select('*')
      .eq('email', 'amy1210liu1210@gamil.com')
      .single();

    console.log(`=== Amy Xiao Liu (ID: ${amy.id}) ===\n`);

    // Get all bookings with class instances
    const { data: allBookings } = await supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          id,
          class_type,
          class_date
        )
      `)
      .eq('student_id', amy.id)
      .in('status', ['booked', 'completed', 'attended'])
      .order('class_instances(class_date)', { ascending: true });

    console.log(`Total valid bookings: ${allBookings.length}\n`);

    // Group by course identifier
    const extractCourseIdentifier = (classType) => {
      if (!classType) return null;
      return classType.split('.')[0];
    };

    const bookingsByCourse = {};
    allBookings.forEach(b => {
      if (b.booking_type === 'makeup') {
        console.log(`  SKIPPING MAKEUP: ${b.class_instances.class_type} - ${b.class_instances.class_date}`);
        return;
      }
      const courseId = extractCourseIdentifier(b.class_instances?.class_type);
      if (courseId) {
        if (!bookingsByCourse[courseId]) {
          bookingsByCourse[courseId] = [];
        }
        bookingsByCourse[courseId].push(b);
      }
    });

    console.log('\n=== COURSES FOR AMY XIAO LIU ===\n');
    Object.keys(bookingsByCourse).forEach(courseId => {
      const bookings = bookingsByCourse[courseId];
      console.log(`\n${courseId} (${bookings.length} bookings):`);

      bookings.forEach(b => {
        const classDate = new Date(b.class_instances.class_date);
        classDate.setHours(0, 0, 0, 0);
        const hasStarted = classDate <= today;
        console.log(`  ${b.class_instances.class_date} - ${b.class_instances.class_type} - ${hasStarted ? 'STARTED' : 'FUTURE'}`);
      });

      // Check if ANY class has started
      const hasStarted = bookings.some(b => {
        const classDate = new Date(b.class_instances.class_date);
        classDate.setHours(0, 0, 0, 0);
        return classDate <= today;
      });

      // Check if any class is still in the future
      const hasFutureClasses = bookings.some(b => {
        const classDate = new Date(b.class_instances.class_date);
        classDate.setHours(0, 0, 0, 0);
        return classDate > today;
      });

      let status = 'upcoming';
      if (hasStarted && !hasFutureClasses) {
        status = 'completed';
      } else if (hasStarted) {
        status = 'current';
      }

      console.log(`  => Course Status: ${status.toUpperCase()}`);
    });

    // Check if she has any future bookings
    const hasFutureBookings = allBookings.some(b => {
      const classDate = new Date(b.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      return classDate >= today;
    });

    console.log(`\n\n=== SUMMARY ===`);
    console.log(`Has future bookings (>= today): ${hasFutureBookings}`);
    console.log(`Should be in activeStudentIds: ${hasFutureBookings}`);

    const currentCourses = Object.keys(bookingsByCourse).filter(courseId => {
      const bookings = bookingsByCourse[courseId];
      const hasStarted = bookings.some(b => {
        const classDate = new Date(b.class_instances.class_date);
        classDate.setHours(0, 0, 0, 0);
        return classDate <= today;
      });
      const hasFutureClasses = bookings.some(b => {
        const classDate = new Date(b.class_instances.class_date);
        classDate.setHours(0, 0, 0, 0);
        return classDate > today;
      });
      return hasStarted && hasFutureClasses;
    });

    console.log(`Has 'current' courses: ${currentCourses.length > 0}`);
    console.log(`Should appear in Active Students: ${currentCourses.length > 0}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkAmyXiaoLiu();
