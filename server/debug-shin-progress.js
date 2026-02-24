require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function debugShinProgress() {
  console.log('🔍 Debugging Shin N Chan progress calculation...\n');

  try {
    const shinId = 2238; // From previous debug output

    // Get Shin's customer data
    const { data: shin, error: shinError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', shinId)
      .single();

    if (shinError) throw shinError;

    console.log(`👤 Shin N Chan (${shin.email}):`);
    console.log(`    ID: ${shin.id}`);
    console.log(`    Classes allocated: ${shin.classes_allocated}`);
    console.log(`    Classes used: ${shin.classes_used}`);
    console.log(`    Customer type: ${shin.customer_type}`);

    // Get Shin's enrollments
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', shinId);

    if (enrollmentsError) throw enrollmentsError;

    console.log(`\n📚 Course enrollments (${enrollments.length}):`);
    enrollments.forEach(e => {
      console.log(`  Enrollment ${e.id}: ${e.status} - ${e.course_title}`);
      console.log(`    Number of weeks: ${e.number_of_weeks}, Weeks remaining: ${e.weeks_remaining}`);
      console.log(`    Created: ${e.created_at}`);
    });

    // Get Shin's bookings
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*, class_instances!bookings_class_instance_id_fkey(class_type, class_date, start_time)')
      .eq('student_id', shinId)
      .in('status', ['booked', 'completed', 'attended']);

    if (bookingsError) throw bookingsError;

    console.log(`\n📅 Bookings (${bookings.length}):`);
    bookings.forEach(b => {
      console.log(`  Booking ${b.id}: ${b.status} - enrollment ${b.course_enrollment_id}`);
      console.log(`    Class: ${b.class_instances?.class_type} on ${b.class_instances?.class_date}`);
    });

    // Calculate attended classes using the same logic as the API
    const activeEnrollmentIds = new Set(
      enrollments.filter(e => ['active', 'paused'].includes(e.status)).map(e => e.id)
    );

    console.log(`\n🟢 Active/paused enrollment IDs: [${Array.from(activeEnrollmentIds).join(', ')}]`);

    const attendedClasses = bookings.filter(b => {
      // Must be from active/paused enrollment
      if (b.course_enrollment_id && !activeEnrollmentIds.has(b.course_enrollment_id)) {
        console.log(`    Skipping booking ${b.id} - not from active enrollment`);
        return false;
      }

      const ci = b.class_instances;
      if (!ci) {
        console.log(`    Skipping booking ${b.id} - no class instance`);
        return false;
      }

      // Check if attended or completed
      if (b.status === 'attended' || b.status === 'completed') {
        console.log(`    Counting booking ${b.id} - status: ${b.status}`);
        return true;
      }

      // Check if booked but past date
      if (b.status === 'booked') {
        const classDate = new Date(ci.class_date);
        const today = new Date();
        classDate.setHours(0,0,0,0);
        today.setHours(0,0,0,0);
        if (classDate < today) {
          console.log(`    Counting booking ${b.id} - booked but past date (${ci.class_date})`);
          return true;
        } else {
          console.log(`    Not counting booking ${b.id} - future date (${ci.class_date})`);
          return false;
        }
      }

      return false;
    });

    console.log(`\n🧮 Classes attended: ${attendedClasses.length}/${shin.classes_allocated || 6}`);
    console.log(`   Should show progress: ${attendedClasses.length}/${shin.classes_allocated || 6}`);

  } catch (error) {
    console.error('Error:', error);
  }
}

debugShinProgress();