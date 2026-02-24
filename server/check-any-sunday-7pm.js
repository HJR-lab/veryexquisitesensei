require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  // Check for any Sunday classes with 7pm
  const { data: sundayClasses } = await supabase
    .from('class_instances')
    .select('*')
    .gte('class_date', '2026-01-01')
    .order('class_date', { ascending: true });

  if (!sundayClasses || sundayClasses.length === 0) {
    console.log('No classes found in 2026');
    process.exit(0);
  }

  console.log('Total 2026 classes:', sundayClasses.length, '\n');

  const sundays = sundayClasses.filter(c => {
    const date = new Date(c.class_date);
    return date.getDay() === 0; // Sunday
  });

  console.log('Sunday classes:', sundays.length, '\n');

  if (sundays.length > 0) {
    // Group by time
    const byTime = {};
    sundays.forEach(c => {
      const time = c.class_time || 'NO TIME';
      if (!byTime[time]) byTime[time] = [];
      byTime[time].push(c);
    });

    Object.keys(byTime).sort().forEach(time => {
      console.log('Sunday ' + time + ':', byTime[time].length, 'classes');
      console.log('  Type:', byTime[time][0].class_type);
      console.log('  First:', byTime[time][0].class_date);
      console.log('  Last:', byTime[time][byTime[time].length - 1].class_date);
      console.log();
    });
  }

  process.exit(0);
})();
