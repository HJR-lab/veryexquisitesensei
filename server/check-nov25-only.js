require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkNov25Only() {
  // Get enrollments ONLY from Nov 25-26, 2025
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('id, course_type, course_variant_title, created_at, customers(first_name, last_name)')
    .gte('created_at', '2025-11-25T00:00:00')
    .lt('created_at', '2025-11-27T00:00:00')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`\n📦 Enrollments from Nov 25-26, 2025: ${data.length}\n`);

  const hb = data.filter(e => e.course_type?.toLowerCase().includes('handbuilding'));
  const wt = data.filter(e => e.course_type?.toLowerCase().includes('wheelthrowing'));

  console.log(`🏺 Handbuilding: ${hb.length}`);
  console.log(`🎡 Wheelthrowing: ${wt.length}\n`);

  if (wt.length > 0) {
    console.log('Sample WT variant titles:');
    wt.slice(0, 5).forEach(e => {
      console.log(`- "${e.course_variant_title}"`);
    });
  }

  if (hb.length > 0) {
    console.log('\nSample HB variant titles:');
    hb.slice(0, 3).forEach(e => {
      console.log(`- "${e.course_variant_title}"`);
    });
  }
}

checkNov25Only();
