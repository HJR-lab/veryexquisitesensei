require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function deleteWT1901AMCourse() {
  console.log('=== DELETING INVALID WT1901AM_JL6 COURSE ===\n');

  // Find all class instances with this invalid course
  const { data: classes, error: classError } = await supabase
    .from('class_instances')
    .select('id, class_type, class_date')
    .like('class_type', 'WT1901AM_JL6%');

  if (classError) {
    console.error('Error finding classes:', classError);
    return;
  }

  console.log(`Found ${classes?.length || 0} class instances with WT1901AM_JL6\n`);

  if (!classes || classes.length === 0) {
    console.log('No classes found to delete.');
    return;
  }

  const classIds = classes.map(c => c.id);

  // Find all bookings for these classes
  const { data: bookings, error: bookingError } = await supabase
    .from('bookings')
    .select(`
      id,
      student_id,
      customers!bookings_student_id_fkey (
        first_name,
        last_name,
        email
      )
    `)
    .in('class_instance_id', classIds);

  if (bookingError) {
    console.error('Error finding bookings:', bookingError);
    return;
  }

  console.log(`Found ${bookings?.length || 0} bookings for these classes\n`);

  if (bookings && bookings.length > 0) {
    console.log('Students affected:');
    const uniqueStudents = {};
    bookings.forEach(b => {
      if (!uniqueStudents[b.student_id]) {
        uniqueStudents[b.student_id] = {
          name: `${b.customers.first_name} ${b.customers.last_name}`,
          email: b.customers.email,
          count: 0
        };
      }
      uniqueStudents[b.student_id].count++;
    });

    Object.values(uniqueStudents).forEach(student => {
      console.log(`  - ${student.name} (${student.email}): ${student.count} bookings`);
    });
    console.log('');

    // Delete bookings first (foreign key constraint)
    console.log('Deleting bookings...');
    const { error: deleteBookingsError } = await supabase
      .from('bookings')
      .delete()
      .in('class_instance_id', classIds);

    if (deleteBookingsError) {
      console.error('❌ Error deleting bookings:', deleteBookingsError);
      return;
    }

    console.log(`✅ Deleted ${bookings.length} bookings\n`);
  }

  // Delete class instances
  console.log('Deleting class instances...');
  const { error: deleteClassesError } = await supabase
    .from('class_instances')
    .delete()
    .in('id', classIds);

  if (deleteClassesError) {
    console.error('❌ Error deleting classes:', deleteClassesError);
    return;
  }

  console.log(`✅ Deleted ${classes.length} class instances\n`);
  console.log('✅ Successfully removed invalid WT1901AM_JL6 course');
}

deleteWT1901AMCourse().then(() => process.exit());
