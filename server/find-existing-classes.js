require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function findExistingClasses() {
  console.log('🔍 Finding existing classes...\n');

  // Find Friday 9:30am classes starting Jan 23
  console.log('--- Friday 9:30am classes (Jessie) ---');
  const { data: fridayClasses, error: fridayError } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2026-01-23')
    .lte('class_date', '2026-03-01')
    .eq('start_time', '9:30am')
    .eq('room', 'Studio A')
    .order('class_date', { ascending: true });

  if (fridayError) {
    console.error('Error:', fridayError);
  } else {
    console.log(`Found ${fridayClasses?.length || 0} Friday 9:30am classes:`);
    fridayClasses?.forEach(c => {
      console.log(`  ID: ${c.id} - ${c.class_date} - ${c.class_type} - ${c.status} - ${c.course_identifier} (${c.current_enrollment}/${c.max_capacity})`);
    });
  }

  // Find Thursday 7:00pm classes starting Jan 22
  console.log('\n--- Thursday 7:00pm classes (Sabrina) ---');
  const { data: thursdayClasses, error: thursdayError } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2026-01-22')
    .lte('class_date', '2026-03-01')
    .eq('start_time', '7:00pm')
    .eq('room', 'Studio A')
    .order('class_date', { ascending: true });

  if (thursdayError) {
    console.error('Error:', thursdayError);
  } else {
    console.log(`Found ${thursdayClasses?.length || 0} Thursday 7:00pm classes:`);
    thursdayClasses?.forEach(c => {
      console.log(`  ID: ${c.id} - ${c.class_date} - ${c.class_type} - ${c.status} - ${c.course_identifier} (${c.current_enrollment}/${c.max_capacity})`);
    });
  }

  // Check if bookings exist for these classes
  if (fridayClasses && fridayClasses.length > 0) {
    console.log('\n--- Bookings for Friday classes ---');
    for (const c of fridayClasses) {
      const { data: bookings } = await supabase
        .from('class_bookings')
        .select('id, student_id, enrollment_id')
        .eq('class_instance_id', c.id);

      console.log(`  Class ${c.id} (${c.class_date}): ${bookings?.length || 0} bookings`);
      if (bookings && bookings.length > 0) {
        bookings.forEach(b => {
          console.log(`    - Student ${b.student_id}, Enrollment ${b.enrollment_id}`);
        });
      }
    }
  }

  if (thursdayClasses && thursdayClasses.length > 0) {
    console.log('\n--- Bookings for Thursday classes ---');
    for (const c of thursdayClasses) {
      const { data: bookings } = await supabase
        .from('class_bookings')
        .select('id, student_id, enrollment_id')
        .eq('class_instance_id', c.id);

      console.log(`  Class ${c.id} (${c.class_date}): ${bookings?.length || 0} bookings`);
      if (bookings && bookings.length > 0) {
        bookings.forEach(b => {
          console.log(`    - Student ${b.student_id}, Enrollment ${b.enrollment_id}`);
        });
      }
    }
  }
}

findExistingClasses()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
