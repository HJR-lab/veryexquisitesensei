require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  const { data: classes } = await supabase
    .from('class_instances')
    .select('id, class_date, class_type, class_time, current_enrollment')
    .gte('class_date', '2026-01-01')
    .lte('class_date', '2026-01-31')
    .ilike('class_type', '%WT%')
    .order('class_date', { ascending: true });

  if (!classes || classes.length === 0) {
    console.log('No January 2026 wheelthrowing classes found');
    process.exit(0);
  }

  console.log('January 2026 wheelthrowing classes:', classes.length, '\n');

  // Group by date
  const byDate = {};
  classes.forEach(c => {
    if (!byDate[c.class_date]) byDate[c.class_date] = [];
    byDate[c.class_date].push(c);
  });

  Object.keys(byDate).sort().forEach(date => {
    const cs = byDate[date];
    console.log(date, '-', cs.length, 'classes');
    cs.forEach(c => {
      console.log('  ', c.class_time, '-', c.current_enrollment, 'enrolled');
    });
  });

  // Check for bookings
  const classIds = classes.map(c => c.id);
  const { count } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .in('class_instance_id', classIds);

  console.log('\nTotal bookings:', count);

  process.exit(0);
})();
