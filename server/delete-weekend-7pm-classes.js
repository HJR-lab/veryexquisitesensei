require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  // Find all 7pm classes
  const { data: badClasses } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2026-01-01')
    .ilike('class_type', '%WT%')
    .or('start_time.eq.7:00 PM,start_time.eq.7:00pm');

  if (!badClasses || badClasses.length === 0) {
    console.log('No 7pm classes found');
    process.exit(0);
  }

  // Filter for only Saturdays and Sundays
  const weekendClasses = badClasses.filter(c => {
    const date = new Date(c.class_date);
    const day = date.getDay();
    return day === 0 || day === 6; // 0=Sunday, 6=Saturday
  });

  console.log('Weekend 7pm classes to delete:', weekendClasses.length, '\n');

  if (weekendClasses.length > 0) {
    weekendClasses.slice(0, 10).forEach(c => {
      const date = new Date(c.class_date);
      const day = date.toLocaleDateString('en-US', { weekday: 'short' });
      console.log('  ', day, c.class_date.substring(0, 10), c.start_time, c.class_type);
    });

    const ids = weekendClasses.map(c => c.id);

    // Delete them
    const { error } = await supabase
      .from('class_instances')
      .delete()
      .in('id', ids);

    if (!error) {
      console.log('\n✅ Deleted', ids.length, 'weekend 7pm classes');

      // Delete associated bookings
      const { count } = await supabase
        .from('bookings')
        .delete()
        .in('class_instance_id', ids);

      console.log('✅ Deleted', count || 0, 'associated bookings');
    }
  }

  process.exit(0);
})();
