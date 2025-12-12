require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

async function checkData() {
  console.log('\n🔍 Checking database for course identifiers...\n');

  // Check students
  const { data: students } = await supabase
    .from('students')
    .select('id, first_name, last_name, email, course_expiry_date')
    .limit(5);

  console.log('📊 Sample Students:');
  console.log(students);

  // Check bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, student_id, class_instance_id, status')
    .limit(5);

  console.log('\n📚 Sample Bookings:');
  console.log(bookings);

  // Check class instances
  const { data: classInstances } = await supabase
    .from('class_instances')
    .select('id, class_type, class_date, instructor')
    .limit(5);

  console.log('\n📅 Sample Class Instances:');
  console.log(classInstances);

  // Check course enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_type, status')
    .limit(5);

  console.log('\n🎓 Sample Course Enrollments:');
  console.log(enrollments);

  process.exit(0);
}

checkData();
