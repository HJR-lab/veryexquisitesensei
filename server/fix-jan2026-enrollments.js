require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function fixEnrollments() {
  try {
    console.log('\n🔧 Fixing January 2026 enrollments...\n');

    // Delete wrong enrollments for these students
    const studentsToFix = [
      { email: 'shine2starry@gmail.com', name: 'Shin N Chan', correct: 'Tuesday 7pm' },
      { email: 'charmaine.lauhuiqi@gmail.com', name: 'Charmaine Lau', correct: 'Sunday 9:30am' },
      { email: 'liyiantai@gmail.com', name: 'Li-Yian Tai', correct: 'Saturday 1pm' },
      { email: 'graceleeern@gmail.com', name: 'Grace Lee', correct: 'Handbuilding (drop-in)' }
    ];

    for (const student of studentsToFix) {
      console.log(`\n${student.name} (${student.email})`);
      console.log(`Should be in: ${student.correct}`);

      // Get customer
      const { data: customer } = await supabaseDb.supabase
        .from('customers')
        .select('*')
        .eq('email', student.email)
        .single();

      if (!customer) {
        console.log('❌ Customer not found');
        continue;
      }

      // Delete all bookings in Jan 2026 cohort
      const { error: deleteError } = await supabaseDb.supabase
        .from('bookings')
        .delete()
        .eq('student_id', customer.id)
        .gte('created_at', '2026-01-11');

      if (deleteError) {
        console.error('❌ Error deleting bookings:', deleteError);
        continue;
      }

      console.log('✅ Deleted incorrect enrollments');

      // Reset classes_used
      await supabaseDb.supabase
        .from('customers')
        .update({ classes_used: 0 })
        .eq('id', customer.id);
    }

    console.log('\n\n✅ All incorrect enrollments deleted');
    console.log('Now manually enroll each student in their correct course using the admin interface or individual scripts.\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixEnrollments();
