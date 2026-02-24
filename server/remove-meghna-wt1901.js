require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function removeMeghnaFromCourse() {
  const customerId = 1198; // Meghna N (meghna.n30@gmail.com)

  console.log('Finding Meghna\'s WT1901AM_JL6 bookings...');

  // Get all bookings for Meghna
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, class_instance_id, status')
    .eq('student_id', customerId);

  if (bookingsError) {
    console.error('Error fetching bookings:', bookingsError);
    return;
  }

  console.log(`Total bookings: ${bookings.length}`);

  // Get class instances to check course identifiers
  const classInstanceIds = bookings.map(b => b.class_instance_id);

  const { data: classInstances, error: classError } = await supabase
    .from('class_instances')
    .select('*')
    .in('id', classInstanceIds)
    .limit(1);

  if (!classError && classInstances && classInstances.length > 0) {
    console.log('Sample class instance columns:', Object.keys(classInstances[0]));
  }

  // Now get all class instances
  const { data: allInstances, error: allError } = await supabase
    .from('class_instances')
    .select('*')
    .in('id', classInstanceIds);

  if (allError) {
    console.error('Error fetching class instances:', allError);
    return;
  }

  // Find bookings for WT1901AM_JL6 course
  const wt1901BookingIds = [];
  bookings.forEach(b => {
    const classInstance = allInstances.find(ci => ci.id === b.class_instance_id);
    if (classInstance) {
      // Check multiple possible column names for course identifier
      const courseId = classInstance.course_identifier || classInstance.course_code || classInstance.course_id || '';
      if (courseId.includes('WT1901AM_JL6')) {
        wt1901BookingIds.push(b.id);
        console.log(`  Found: Booking ID ${b.id}, Date: ${classInstance.class_date}, Course: ${courseId}, Status: ${b.status}`);
      }
    }
  });

  if (wt1901BookingIds.length === 0) {
    console.log('No WT1901AM_JL6 bookings found for Meghna');
    return;
  }

  console.log(`\nDeleting ${wt1901BookingIds.length} bookings...`);

  // Delete the bookings
  const { data: deleted, error: deleteError } = await supabase
    .from('bookings')
    .delete()
    .in('id', wt1901BookingIds)
    .select();

  if (deleteError) {
    console.error('Error deleting bookings:', deleteError);
    return;
  }

  console.log(`✅ Successfully deleted ${deleted.length} bookings for WT1901AM_JL6`);
  console.log('Deleted booking IDs:', wt1901BookingIds.join(', '));
}

removeMeghnaFromCourse();
