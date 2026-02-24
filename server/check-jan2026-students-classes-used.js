require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkJan2026StudentsClassesUsed() {
  try {
    console.log('\n🔍 Checking Jan 2026 students with 0 classes remaining...\n');

    const studentsToCheck = [
      'sarahcherwh1011@gmail.com',      // Sarah Cher
      'charmaine.lauhuiqi@gmail.com',   // Charmaine Lau
      'sfoo9940@gmail.com',              // Jia Yin Foo
      'liyiantai@gmail.com',             // Li-Yian Tai
      'soojitag@me.com'                  // Sooji Tag
    ];

    const today = new Date().toISOString().split('T')[0];
    console.log(`Today is: ${today}\n`);

    for (const email of studentsToCheck) {
      const { data: student } = await supabaseDb.supabase
        .from('customers')
        .select('*')
        .eq('email', email)
        .single();

      if (!student) {
        console.log(`❌ ${email} not found`);
        continue;
      }

      // Get their bookings
      const { data: bookings } = await supabaseDb.supabase
        .from('bookings')
        .select(`
          status,
          class_instances!bookings_class_instance_id_fkey (
            class_date
          )
        `)
        .eq('student_id', student.id);

      const futureBookings = bookings?.filter(b => {
        const classDate = b.class_instances?.class_date?.split('T')[0];
        return classDate >= today;
      }) || [];

      const completedBookings = bookings?.filter(b =>
        b.status === 'completed'
      ) || [];

      console.log(`${student.first_name} ${student.last_name} (${email})`);
      console.log(`  Classes allocated: ${student.classes_allocated}`);
      console.log(`  Classes used: ${student.classes_used}`);
      console.log(`  Classes remaining: ${(student.classes_allocated || 0) - (student.classes_used || 0)}`);
      console.log(`  Total bookings: ${bookings?.length || 0}`);
      console.log(`  Future bookings: ${futureBookings.length}`);
      console.log(`  Completed bookings: ${completedBookings.length}`);

      // Check if classes_used should be 0
      if (student.classes_used > 0 && completedBookings.length === 0) {
        console.log(`  ⚠️  ISSUE: classes_used is ${student.classes_used} but no completed bookings!`);
        console.log(`  ✅ Should set classes_used to 0`);
      }
      console.log();
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkJan2026StudentsClassesUsed();
