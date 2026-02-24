require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  const { data: classes } = await supabase
    .from('class_instances')
    .select('id, class_date, class_type, class_time, current_enrollment')
    .gte('class_date', '2026-01-01')
    .lte('class_date', '2026-03-31')
    .ilike('class_type', '%WT%')
    .order('class_date', { ascending: true });

  if (!classes || classes.length === 0) {
    console.log('No WT classes found');
    process.exit(0);
  }

  console.log('All WT classes Jan-Mar 2026:', classes.length, '\n');

  // Group by day of week and time
  const grouped = {};
  classes.forEach(c => {
    const date = new Date(c.class_date);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = days[date.getDay()];
    const key = day + ' ' + c.class_time;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  });

  Object.keys(grouped).sort().forEach(key => {
    console.log(key + ':', grouped[key].length, 'classes');
    console.log('  First:', grouped[key][0].class_date);
    console.log('  Last:', grouped[key][grouped[key].length - 1].class_date);
  });

  process.exit(0);
})();
