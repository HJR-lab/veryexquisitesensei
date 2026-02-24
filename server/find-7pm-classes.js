require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  const { data: classes } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2026-01-01')
    .lte('class_date', '2026-03-31')
    .ilike('class_time', '%7%pm%');

  console.log('Classes with 7pm in Jan-Mar 2026:', classes ? classes.length : 0, '\n');

  if (classes && classes.length > 0) {
    // Group by day
    const byDay = {};
    classes.forEach(c => {
      const date = new Date(c.class_date);
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const day = days[date.getDay()];
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(c);
    });

    Object.keys(byDay).sort().forEach(day => {
      console.log(day + ':', byDay[day].length, 'classes');
      console.log('  Times:', [...new Set(byDay[day].map(c => c.class_time))].join(', '));
      console.log('  Types:', [...new Set(byDay[day].map(c => c.class_type))].join(', '));
    });
  }

  process.exit(0);
})();
