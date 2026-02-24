require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  // Get one January class
  const { data: classes } = await supabase
    .from('class_instances')
    .select('id, class_date, class_type, class_time')
    .gte('class_date', '2026-01-17')
    .lte('class_date', '2026-01-23')
    .limit(5);

  console.log('Checking bookings for January 2026 classes:\n');

  for (const c of classes) {
    const { data: bookings, count } = await supabase
      .from('bookings')
      .select('*', { count: 'exact' })
      .eq('class_instance_id', c.id);

    console.log(c.class_date, c.class_type, c.class_time);
    console.log('  Bookings:', count);
    if (bookings && bookings.length > 0) {
      console.log('  Students:', bookings.map(b => b.student_id).join(', '));
    }
    console.log();
  }

  process.exit(0);
})();
