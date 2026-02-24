require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkDates() {
  // Get all enrollments and group by created date
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('created_at, course_type')
    .gte('created_at', '2025-11-25');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`\nTotal enrollments since Nov 25, 2025: ${data.length}\n`);

  const byDate = {};
  data.forEach(e => {
    const date = new Date(e.created_at).toISOString().split('T')[0];
    if (!byDate[date]) {
      byDate[date] = { total: 0, hb: 0, wt: 0 };
    }
    byDate[date].total++;
    if (e.course_type?.toLowerCase().includes('handbuilding')) {
      byDate[date].hb++;
    } else if (e.course_type?.toLowerCase().includes('wheelthrowing')) {
      byDate[date].wt++;
    }
  });

  console.log('Enrollments by date:\n');
  Object.entries(byDate).sort().forEach(([date, counts]) => {
    console.log(`${date}: ${counts.total} total (${counts.wt} WT, ${counts.hb} HB)`);
  });

  // Get first few enrollments to see variant titles
  const { data: samples } = await supabase
    .from('course_enrollments')
    .select('course_variant_title, created_at')
    .gte('created_at', '2025-12-28')
    .limit(5);

  console.log('\nSample variant titles from Dec 28:');
  samples?.forEach(s => {
    console.log(`- "${s.course_variant_title}"`);
  });
}

checkDates();
