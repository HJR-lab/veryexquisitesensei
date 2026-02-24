require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function debugEndedClasses() {
  console.log('\n=== DEBUGGING ENDED CLASSES CALCULATION ===\n');
  console.log('Current time:', new Date().toISOString());
  console.log('Current date:', new Date().toISOString().split('T')[0]);

  // Get students with course identifiers containing 1701 or 1801
  const { data: allBookings } = await supabase
    .from('bookings')
    .select(`
      id,
      student_id,
      status,
      class_instances!bookings_class_instance_id_fkey (
        class_type,
        class_date,
        end_time
      )
    `)
    .in('status', ['booked', 'completed', 'attended']);

  // Filter bookings with 1701 or 1801 in class_type
  const targetBookings = allBookings.filter(b => {
    const classType = b.class_instances?.class_type || '';
    return classType.includes('1701') || classType.includes('1801');
  });

  console.log(`\nFound ${targetBookings.length} bookings with 1701 or 1801 course identifiers\n`);

  const now = new Date();

  targetBookings.forEach((booking, index) => {
    const classInstance = booking.class_instances;
    if (!classInstance) return;

    console.log(`\n--- Booking ${index + 1} ---`);
    console.log('Class Type:', classInstance.class_type);
    console.log('Class Date:', classInstance.class_date);
    console.log('End Time:', classInstance.end_time);
    console.log('Status:', booking.status);

    // Parse end time
    const classDate = classInstance.class_date.split('T')[0];
    const endTime = classInstance.end_time;

    const timeParts = endTime.match(/(\d+):(\d+)(am|pm)/i);
    if (!timeParts) {
      console.log('❌ Could not parse end time');
      return;
    }

    let hours = parseInt(timeParts[1]);
    const minutes = parseInt(timeParts[2]);
    const period = timeParts[3].toLowerCase();

    if (period === 'pm' && hours !== 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;

    const [year, month, day] = classDate.split('-');
    const classEndDateTime = new Date(year, month - 1, day, hours, minutes);

    console.log('Class End DateTime:', classEndDateTime.toISOString());
    console.log('Has Ended?:', classEndDateTime < now ? '✅ YES' : '❌ NO');
    console.log('Time until/since end:', Math.round((classEndDateTime - now) / (1000 * 60 * 60)), 'hours');
  });

  // Now check what the stats endpoint would calculate
  console.log('\n\n=== CHECKING STUDENT WITH 1701/1801 BOOKINGS ===\n');

  // Get unique student IDs
  const studentIds = [...new Set(targetBookings.map(b => b.student_id))];
  console.log(`Found ${studentIds.length} unique students with these bookings`);

  for (const studentId of studentIds.slice(0, 3)) { // Just check first 3
    const { data: customer } = await supabase
      .from('customers')
      .select('id, email, first_name, last_name, classes_allocated, classes_used')
      .eq('id', studentId)
      .single();

    if (!customer) continue;

    // Get all bookings for this student
    const { data: studentBookings } = await supabase
      .from('bookings')
      .select(`
        id,
        status,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date,
          end_time
        )
      `)
      .eq('student_id', studentId)
      .in('status', ['booked', 'completed', 'attended']);

    // Count ended classes
    const endedCount = studentBookings.filter(b => {
      if (!b.class_instances || !b.class_instances.class_date || !b.class_instances.end_time) {
        return false;
      }

      const classDate = b.class_instances.class_date.split('T')[0];
      const endTime = b.class_instances.end_time;

      const timeParts = endTime.match(/(\d+):(\d+)(am|pm)/i);
      if (!timeParts) return false;

      let hours = parseInt(timeParts[1]);
      const minutes = parseInt(timeParts[2]);
      const period = timeParts[3].toLowerCase();

      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;

      const [year, month, day] = classDate.split('-');
      const classEndDateTime = new Date(year, month - 1, day, hours, minutes);

      return classEndDateTime < now;
    }).length;

    const classesRemaining = customer.classes_allocated - endedCount;

    console.log(`\n${customer.first_name} ${customer.last_name} (${customer.email})`);
    console.log('  Classes Allocated:', customer.classes_allocated);
    console.log('  Classes Used (DB):', customer.classes_used);
    console.log('  Ended Classes (Calculated):', endedCount);
    console.log('  Classes Remaining:', classesRemaining);
    console.log('  Total Bookings:', studentBookings.length);
  }
}

debugEndedClasses().then(() => process.exit());
