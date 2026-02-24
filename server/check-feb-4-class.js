require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkFeb4Class() {
  try {
    console.log('Checking for Feb 4, 2026 classes...\n');

    // Find all classes on Feb 4, 2026
    const { data: classes, error } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .eq('class_date', '2026-02-04')
      .order('start_time');

    if (error) throw error;

    console.log(`Found ${classes.length} classes on Feb 4, 2026:\n`);

    classes.forEach(cls => {
      console.log(`ID: ${cls.id}`);
      console.log(`  Type: ${cls.class_type}`);
      console.log(`  Time: ${cls.start_time}`);
      console.log(`  Instructor: ${cls.instructor}`);
      console.log('');
    });

    // Check bookings for student 2234 on Feb 4
    const { data: bookings } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date,
          start_time,
          instructor
        )
      `)
      .eq('student_id', 2234)
      .eq('class_instances.class_date', '2026-02-04');

    console.log(`\nStudent 2234's bookings on Feb 4: ${bookings?.length || 0}`);
    if (bookings && bookings.length > 0) {
      bookings.forEach(b => {
        console.log(`  - Class ID: ${b.class_instance_id}`);
        console.log(`    Type: ${b.class_instances.class_type}`);
        console.log(`    Time: ${b.class_instances.start_time}`);
        console.log(`    Status: ${b.status}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkFeb4Class();
