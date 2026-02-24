require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkSarahBookings() {
  try {
    console.log('=== Checking Sarah Chan Bookings to Determine Course Identifier ===\n');

    // Get Sarah's bookings
    const { data: bookings } = await supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date,
          start_time
        )
      `)
      .eq('student_id', 2228)
      .eq('course_enrollment_id', 4770)
      .in('status', ['booked', 'attended', 'completed']);

    console.log(`Found ${bookings.length} bookings for Sarah's enrollment (ID: 4770)`);

    if (bookings.length > 0) {
      console.log('\n=== SARAH\'S CLASS BOOKINGS ===');
      bookings.forEach((b, i) => {
        console.log(`${i + 1}. ${b.class_instances.class_type} on ${b.class_instances.class_date}`);
        console.log(`   Status: ${b.status}`);
      });

      // Determine the course identifier from class types
      const classTypes = bookings.map(b => b.class_instances.class_type);
      const uniqueClassTypes = [...new Set(classTypes)];

      console.log('\n=== COURSE IDENTIFIER ANALYSIS ===');
      console.log('Unique class types:', uniqueClassTypes);

      // Extract the base course identifier (e.g., WT1701PM_DL6 from WT1701PM_DL6.1)
      if (uniqueClassTypes.length > 0) {
        const firstClassType = uniqueClassTypes[0];
        const courseIdentifierMatch = firstClassType.match(/^([A-Z]+\d+[A-Z]+_[A-Z]+\d+)/);

        if (courseIdentifierMatch) {
          const suggestedIdentifier = courseIdentifierMatch[1];
          console.log(`✅ Suggested course_identifier: ${suggestedIdentifier}`);

          console.log('\n=== FIXING SARAH\'S COURSE IDENTIFIER ===');

          const { error } = await supabase
            .from('course_enrollments')
            .update({
              course_identifier: suggestedIdentifier
            })
            .eq('id', 4770);

          if (error) {
            console.error('❌ Error updating Sarah\'s course identifier:', error);
          } else {
            console.log(`✅ Sarah's course identifier updated to: ${suggestedIdentifier}`);
            console.log('✅ Her dashboard will no longer show "N/A"');
          }
        } else {
          console.log('⚠️  Could not determine course identifier from class types');
        }
      }
    } else {
      console.log('❌ No bookings found for Sarah\'s enrollment');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkSarahBookings().then(() => process.exit());