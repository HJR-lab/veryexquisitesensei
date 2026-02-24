require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkDates() {
  const { data: classes } = await supabase
    .from('class_instances')
    .select('class_date')
    .gte('class_date', '2025-12-01')
    .lte('class_date', '2026-02-01')
    .order('class_date', { ascending: true });
    
  const uniqueDates = [...new Set(classes.map(c => c.class_date.split('T')[0]))];
  
  console.log('Classes exist on these dates (Dec 2025 - Feb 2026):');
  console.log();
  
  uniqueDates.forEach(date => {
    const count = classes.filter(c => c.class_date.startsWith(date)).length;
    console.log(date, '-', count, 'classes');
  });
  
  const dec31Classes = classes.filter(c => c.class_date.startsWith('2025-12-31'));
  console.log();
  console.log('Classes on Dec 31, 2025:', dec31Classes.length);
  
  const jan2026Classes = classes.filter(c => c.class_date.startsWith('2026-01'));
  console.log('Classes in Jan 2026:', jan2026Classes.length);
  
  process.exit(0);
}

checkDates().catch(console.error);
