require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  const emails = ['beverlytan27@yahoo.com', 'Mitchell.chandx@gmail.com', 'Mitchell.chandx+dup@gmail.com', 'joey.lee2302@gmail.com'];
  for (const email of emails) {
    const { data: c } = await supabase.from('customers').select('id, first_name, last_name, classes_allocated, email').eq('email', email).single();
    if (!c) { console.log(email, 'NOT FOUND'); continue; }
    const { data: enrollments } = await supabase.from('course_enrollments').select('id, course_type, course_title, number_of_weeks, status').eq('student_id', c.id);
    const { data: bookings } = await supabase.from('bookings').select('id, status').eq('student_id', c.id);
    const attended = (bookings || []).filter(b => b.status === 'attended' || b.status === 'completed').length;
    const booked = (bookings || []).filter(b => b.status === 'booked').length;
    const totalWeeks = (enrollments || []).reduce((sum, e) => sum + (e.number_of_weeks || 0), 0);
    console.log(`${c.first_name} ${c.last_name} - classes_allocated: ${c.classes_allocated}, totalWeeks: ${totalWeeks}, attended: ${attended}, booked: ${booked}`);
    (enrollments || []).forEach(e => console.log(`   enrollment ${e.id}: ${e.course_title} | weeks: ${e.number_of_weeks} | status: ${e.status}`));
  }
  process.exit(0);
})();
