require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkJanEnrollments() {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('course_variant_title, course_type, start_date, created_at, customers(first_name, last_name)')
    .gte('created_at', '2025-11-25');

  if (error) {
    console.error('Error:', error);
    return;
  }

  // Filter for Jan 2026 variants
  const jan2026 = data.filter(e => {
    const title = e.course_variant_title || '';
    return title.includes('Jan') || title.includes('January') || title.includes(' 17 ') || title.includes(' 18 ') || title.includes(' 20 ') || title.includes(' 22 ') || title.includes(' 23 ');
  });

  console.log(`\n📅 Enrollments with Jan dates in variant title: ${jan2026.length}\n`);

  if (jan2026.length > 0) {
    console.log('Jan 2026 enrollments:\n');
    jan2026.slice(0, 10).forEach(e => {
      console.log(`${e.customers?.first_name} ${e.customers?.last_name}`);
      console.log(`  Variant: "${e.course_variant_title}"`);
      console.log(`  Start date: ${e.start_date || 'NOT SET'}`);
      console.log('');
    });
  }

  // Also check Aug/Sept enrollments
  const augSept = data.filter(e => {
    const title = e.course_variant_title || '';
    return title.includes('August') || title.includes('September');
  });

  console.log(`\n📅 Enrollments with Aug/Sept dates: ${augSept.length}\n`);
}

checkJanEnrollments();
