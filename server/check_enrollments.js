const { supabase } = require('./utils/supabaseDb');

async function checkData() {
  console.log('\n=== Checking Course Enrollments ===');
  const { data: enrollments, error: enrollError } = await supabase
    .from('course_enrollments')
    .select('*')
    .limit(10);
  
  if (enrollError) {
    console.error('Error:', enrollError);
  } else {
    console.log(`Found ${enrollments.length} course enrollments:`);
    enrollments.forEach(e => {
      console.log(`- ${e.course_type} | ${e.schedule_pattern} | ${e.course_start_date}`);
    });
  }

  console.log('\n=== Checking Active Students ===');
  const today = new Date().toISOString().split('T')[0];
  const { data: activeStudents, error: studError } = await supabase
    .from('customers')
    .select('first_name, last_name, email, course_purchase_date, course_expiry_date')
    .eq('customer_type', 'student')
    .gte('course_expiry_date', today)
    .limit(5);
  
  if (studError) {
    console.error('Error:', studError);
  } else {
    console.log(`Found ${activeStudents.length} active students:`);
    activeStudents.forEach(s => {
      console.log(`- ${s.first_name} ${s.last_name} (${s.email})`);
      console.log(`  Course: ${s.course_purchase_date} to ${s.course_expiry_date}`);
    });
  }

  console.log('\n=== Checking for Handbuilding ===');
  const { data: handbuilding, error: hbError } = await supabase
    .from('class_instances')
    .select('class_type, class_date, instructor')
    .ilike('class_type', '%handbuilding%')
    .limit(10);
  
  if (hbError) {
    console.error('Error:', hbError);
  } else {
    console.log(`Found ${handbuilding.length} handbuilding classes:`);
    handbuilding.forEach(c => {
      console.log(`- ${c.class_type} | ${c.class_date} | ${c.instructor}`);
    });
  }

  process.exit(0);
}

checkData();
