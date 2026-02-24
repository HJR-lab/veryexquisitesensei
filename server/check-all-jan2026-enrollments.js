require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkAll() {
  const students = [
    { email: 'sarahcherwh1011@gmail.com', name: 'Sarah Cher', should: 'Sunday 9:30am' },
    { email: 'shine2starry@gmail.com', name: 'Shin N Chan', should: 'Tuesday 7pm' },
    { email: 'charmaine.lauhuiqi@gmail.com', name: 'Charmaine Lau', should: 'Sunday 9:30am' },
    { email: 'liyiantai@gmail.com', name: 'Li-Yian Tai', should: 'Saturday 1pm' },
    { email: 'graceleeern@gmail.com', name: 'Grace Lee', should: 'HB' },
    { email: 'soojitag@me.com', name: 'Sooji Tag', should: 'Sunday 9:30am' },
    { email: 'sfoo9940@gmail.com', name: 'Jia Yin Foo', should: 'Sunday 9:30am' },
    { email: 'joey.lee2302@gmail.com', name: 'Joey Lee', should: 'Tuesday 7pm' }
  ];

  for (const student of students) {
    const { data: customer } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', student.email)
      .single();

    if (!customer) continue;

    const { data: bookings } = await supabaseDb.supabase
      .from('bookings')
      .select('*, class_instances!bookings_class_instance_id_fkey(class_type, class_date)')
      .eq('student_id', customer.id)
      .gte('class_instances.class_date', '2026-01-17')
      .lte('class_instances.class_date', '2026-03-03')
      .in('status', ['booked', 'completed']);

    console.log(`\n${student.name} (should be: ${student.should})`);
    if (bookings && bookings.length > 0) {
      const course = bookings[0].class_instances?.class_type?.split('.')[0];
      console.log(`  Enrolled in: ${course} (${bookings.length} classes)`);
    } else {
      console.log(`  NOT ENROLLED`);
    }
  }
}

checkAll();
