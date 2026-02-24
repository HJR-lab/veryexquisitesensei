require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  const { data: classes } = await supabase
    .from('class_instances')
    .select('id, class_date, class_type, class_time')
    .gte('class_date', '2026-01-01')
    .lte('class_date', '2026-01-31')
    .order('class_date', { ascending: true });

  console.log('Checking bookings for January 2026 classes...\n');

  let total = 0;
  for (const c of classes.slice(0, 5)) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('class_instance_id', c.id);

    if (bookings && bookings.length > 0) {
      console.log(c.class_date, c.class_type, c.class_time, ':', bookings.length, 'bookings');
      total += bookings.length;
    }
  }

  console.log('\nTotal bookings (sample):', total);
  process.exit(0);
})();
