require('dotenv').config();
const supabaseDb = require('./utils/supabaseDb');

async function checkStudents() {
  const students = [
    { email: 'joey.lee2302@gmail.com', name: 'Joey Lee' },
    { email: 'denisewonghuiwen@gmail.com', name: 'Huiwen Denise Wong' }
  ];

  for (const student of students) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(student.name);
    console.log('='.repeat(60));

    const { data: customer } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', student.email)
      .single();

    if (!customer) {
      console.log('❌ Not found');
      continue;
    }

    console.log(`Email: ${customer.email}`);
    console.log(`Classes allocated: ${customer.classes_allocated}`);
    console.log(`Classes used: ${customer.classes_used}`);
    console.log(`Classes forfeited: ${customer.classes_forfeited}`);
    console.log(`Classes remaining: ${customer.classes_allocated - customer.classes_used}`);
    console.log(`Course purchase count: ${customer.course_purchase_count}`);
    console.log(`Course expiry: ${customer.course_expiry_date || 'NO EXPIRY'}`);

    // Get bookings
    const { data: bookings } = await supabaseDb.supabase
      .from('bookings')
      .select('*, class_instances!bookings_class_instance_id_fkey(class_type, class_date)')
      .eq('student_id', customer.id)
      .in('status', ['booked', 'completed'])
      .order('class_instances.class_date', { ascending: true });

    console.log(`\nBookings: ${bookings?.length || 0}`);
    if (bookings && bookings.length > 0) {
      bookings.forEach((b, i) => {
        console.log(`  ${i+1}. ${b.class_instances?.class_type} on ${b.class_instances?.class_date}`);
      });
    }
  }
}

checkStudents();
