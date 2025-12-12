require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkStats() {
  // Get all students
  const { data: allStudents } = await supabase
    .from('customers')
    .select('email, course_purchase_date, course_expiry_date')
    .eq('customer_type', 'student');

  console.log(`Total students synced: ${allStudents.length}\n`);

  // Active students: students whose course hasn't expired yet
  const today = new Date().toISOString().split('T')[0];
  console.log(`Today's date: ${today}\n`);

  const activeStudents = allStudents.filter(s => {
    return s.course_expiry_date && s.course_expiry_date >= today;
  });

  const inactiveStudents = allStudents.filter(s => {
    return !s.course_expiry_date || s.course_expiry_date < today;
  });

  console.log(`Active students (course not expired): ${activeStudents.length}`);
  activeStudents.forEach(s => {
    console.log(`  - ${s.email}: expires ${s.course_expiry_date}`);
  });

  console.log(`\nInactive students (course expired or no dates): ${inactiveStudents.length}`);
  console.log(`  Students with no dates: ${inactiveStudents.filter(s => !s.course_expiry_date).length}`);
  console.log(`  Students with expired courses: ${inactiveStudents.filter(s => s.course_expiry_date && s.course_expiry_date < today).length}`);

  process.exit(0);
}

checkStats();
