require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkActiveByClass() {
  const today = new Date().toISOString().split('T')[0];

  // Get all students with active courses
  const { data: activeStudents } = await supabase
    .from('customers')
    .select('email, first_name, last_name, course_purchase_date, course_expiry_date')
    .gte('course_expiry_date', today)
    .order('course_expiry_date', { ascending: true });

  console.log(`Today: ${today}`);
  console.log(`\nActive students: ${activeStudents?.length || 0}\n`);

  // Group by expiry date
  const byExpiryDate = {};
  activeStudents?.forEach(s => {
    const expiry = s.course_expiry_date?.split('T')[0];
    if (!byExpiryDate[expiry]) {
      byExpiryDate[expiry] = [];
    }
    byExpiryDate[expiry].push(s);
  });

  console.log('Students grouped by course end date:\n');

  Object.keys(byExpiryDate).sort().forEach(expiry => {
    const students = byExpiryDate[expiry];
    console.log(`📅 Expires ${expiry} (${students.length} students):`);
    students.forEach(s => {
      console.log(`   - ${s.email}`);
    });
    console.log();
  });

  process.exit(0);
}

checkActiveByClass();
