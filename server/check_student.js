require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkStudent() {
  // Check student_id 2
  const { data: student, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', 2)
    .single();
  
  console.log('Student ID 2:', student);
  
  // Check how many customers have bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select('student_id')
    .in('status', ['booked', 'completed']);
  
  const uniqueStudentIds = [...new Set(bookings.map(b => b.student_id))];
  console.log(`\nUnique students with bookings: ${uniqueStudentIds.length}`);
  console.log('Student IDs with bookings:', uniqueStudentIds);
  
  // Get those students' details
  const { data: studentsWithBookings } = await supabase
    .from('customers')
    .select('id, email, first_name, last_name')
    .in('id', uniqueStudentIds);
  
  console.log('\nStudents with bookings:', studentsWithBookings);
  
  process.exit(0);
}

checkStudent().catch(console.error);
