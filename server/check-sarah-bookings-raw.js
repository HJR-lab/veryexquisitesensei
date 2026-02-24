require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkSarahBookingsRaw() {
  console.log('=== CHECKING SARAH BOOKINGS - RAW DATA ===\n');

  const sarahId = 1197;

  // Check bookings without join
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('student_id', sarahId);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Total bookings for student_id ${sarahId}: ${bookings?.length || 0}\n`);

  if (bookings && bookings.length > 0) {
    console.log('First 5 bookings:');
    bookings.slice(0, 5).forEach(b => {
      console.log(`- ID: ${b.id}, Class Instance ID: ${b.class_instance_id}, Status: ${b.status}, Enrollment ID: ${b.course_enrollment_id}`);
    });

    // Now check if class_instances exist for these bookings
    console.log('\n=== CHECKING CLASS INSTANCES ===\n');
    const classInstanceIds = bookings.map(b => b.class_instance_id);

    const { data: classes } = await supabase
      .from('class_instances')
      .select('*')
      .in('id', classInstanceIds.slice(0, 5));

    console.log(`Class instances found: ${classes?.length || 0}`);
    classes?.forEach(c => {
      console.log(`- ID: ${c.id}, Type: ${c.class_type}, Date: ${c.class_date}`);
    });
  }
}

checkSarahBookingsRaw().then(() => process.exit());
