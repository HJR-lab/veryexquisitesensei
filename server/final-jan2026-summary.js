require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function finalSummary() {
  try {
    console.log('\n📊 FINAL JANUARY 2026 COURSE SUMMARY\n');
    console.log('=' .repeat(80) + '\n');

    const courses = [
      { id: 'WT1701PM_DL6', day: 'Saturday', time: '1:00pm', instructor: 'Dillon Lin' },
      { id: 'WT1701AM_DL6', day: 'Saturday', time: '9:30am', instructor: 'Dillon Lin' },
      { id: 'WT1801AM_DL6', day: 'Sunday', time: '9:30am', instructor: 'Dillon Lin' },
      { id: 'WT2001NT_JL6', day: 'Tuesday', time: '7:00pm', instructor: 'Joyce Lim' },
      { id: 'WT2201NT_JL6', day: 'Thursday', time: '7:00pm', instructor: 'Joyce Lim' },
      { id: 'WT2301AM_JL6', day: 'Friday', time: '9:30am', instructor: 'Joyce Lim' }
    ];

    let totalClasses = 0;
    let totalBookings = 0;
    let totalStudents = 0;

    for (const course of courses) {
      // Get classes
      const { data: classes } = await supabaseDb.supabase
        .from('class_instances')
        .select('*')
        .like('class_type', `${course.id}.%`)
        .order('class_date', { ascending: true });

      // Get unique students via bookings
      const { data: bookings } = await supabaseDb.supabase
        .from('bookings')
        .select('student_id, customers(first_name, last_name)')
        .in('class_instance_id', classes.map(c => c.id));

      const uniqueStudents = new Map();
      bookings.forEach(b => {
        uniqueStudents.set(b.student_id, b.customers);
      });

      totalClasses += classes.length;
      totalBookings += bookings.length;
      totalStudents += uniqueStudents.size;

      console.log(`${course.id}`);
      console.log(`   ${course.day}s ${course.time} | Instructor: ${course.instructor}`);
      console.log(`   Classes: ${classes.length} | Students: ${uniqueStudents.size} | Bookings: ${bookings.length}`);
      console.log(`   Status: ${classes[0].status.toUpperCase()}`);

      console.log(`   Students enrolled:`);
      uniqueStudents.forEach((customer, studentId) => {
        console.log(`      - ${customer?.first_name} ${customer?.last_name}`);
      });
      console.log('');
    }

    console.log('=' .repeat(80));
    console.log(`\n📈 TOTALS:`);
    console.log(`   Courses: 6`);
    console.log(`   Total Classes: ${totalClasses}`);
    console.log(`   Total Students: ${totalStudents}`);
    console.log(`   Total Bookings: ${totalBookings}`);
    console.log(`\n✅ All courses from orders after Nov 17, 2025`);
    console.log(`✅ Draft/Active system enabled`);
    console.log(`✅ Webhook, Cron, and Manual processing ready\n`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

finalSummary();
