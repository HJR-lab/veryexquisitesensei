require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkMeghnaCourses() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    console.log(`Today: ${today.toISOString().split('T')[0]}\n`);

    // Get Meghna
    const { data: meghna } = await supabase
      .from('customers')
      .select('*')
      .eq('email', 'meghna@newcampus.com')
      .single();

    console.log(`=== Meghna (ID: ${meghna.id}) ===\n`);

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
      .eq('student_id', meghna.id)
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
      if (b.booking_type === 'makeup') return; // Skip makeup
      const courseId = extractCourseIdentifier(b.class_instances?.class_type);
      if (courseId) {
        if (!bookingsByCourse[courseId]) {
          bookingsByCourse[courseId] = [];
        }
        bookingsByCourse[courseId].push(b);
      }
    });

    console.log('=== COURSES FOR MEGHNA ===\n');
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

      console.log(`  => Course Status: ${hasStarted ? 'CURRENT' : 'UPCOMING'}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkMeghnaCourses();
