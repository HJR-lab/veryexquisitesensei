require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  // Check who's enrolled in Friday Oct 10 course
  const { data: classes, error } = await supabase
    .from('class_instances')
    .select('id, class_date')
    .gte('class_date', '2025-10-10')
    .lte('class_date', '2025-11-14')
    .eq('instructor', 'Joyce Lim')
    .eq('start_time', '9:30 AM')
    .order('class_date');

  if (error || classes.length === 0) {
    console.log('No classes found');
    return;
  }

  console.log('Friday 9:30 AM Joyce Lim course classes:', classes.length);
  console.log('');

  const classIds = classes.map(c => c.id);

  const { data: bookings, error: bookingError } = await supabase
    .from('bookings')
    .select(`
      id,
      class_instance_id,
      status,
      customers (first_name, last_name, email)
    `)
    .in('class_instance_id', classIds)
    .in('status', ['booked', 'completed']);

  if (bookingError) {
    console.error('Error:', bookingError);
    return;
  }

  // Group by customer
  const byCustomer = {};
  bookings.forEach(b => {
    const email = b.customers?.email;
    if (!byCustomer[email]) {
      byCustomer[email] = {
        name: `${b.customers?.first_name} ${b.customers?.last_name}`,
        email,
        classes: []
      };
    }
    byCustomer[email].classes.push(b.class_instance_id);
  });

  console.log('Students enrolled:', Object.keys(byCustomer).length);
  console.log('');
  Object.values(byCustomer).forEach((student, idx) => {
    console.log(`${idx + 1}. ${student.name} (${student.email}) - ${student.classes.length} classes`);
  });

  process.exit(0);
})();
