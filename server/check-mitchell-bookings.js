require('dotenv').config();
const { supabase } = require('./utils/supabaseDb');

(async () => {
  const { data: c } = await supabase.from('customers')
    .select('id').eq('email', 'Mitchell.chandx@gmail.com').single();

  const { data: bookings } = await supabase.from('bookings')
    .select('id, status, course_enrollment_id, class_id')
    .eq('student_id', c.id);

  const byEnrollment = {};
  (bookings || []).forEach(b => {
    const key = b.course_enrollment_id || 'NULL';
    if (!byEnrollment[key]) byEnrollment[key] = [];
    byEnrollment[key].push(b);
  });

  Object.entries(byEnrollment).forEach(([eid, bs]) => {
    console.log('enrollment', eid, ':', bs.length, 'bookings');
    bs.forEach(b => console.log('  booking', b.id, '| status:', b.status, '| class:', b.class_id));
  });

  console.log('\n--- Sarah Chan ---');
  const { data: s } = await supabase.from('customers')
    .select('id').eq('email', 'Mitchell.chandx+dup@gmail.com').single();

  const { data: sBookings } = await supabase.from('bookings')
    .select('id, status, course_enrollment_id, class_id')
    .eq('student_id', s.id);

  const bySEnrollment = {};
  (sBookings || []).forEach(b => {
    const key = b.course_enrollment_id || 'NULL';
    if (!bySEnrollment[key]) bySEnrollment[key] = [];
    bySEnrollment[key].push(b);
  });

  Object.entries(bySEnrollment).forEach(([eid, bs]) => {
    console.log('enrollment', eid, ':', bs.length, 'bookings');
    bs.forEach(b => console.log('  booking', b.id, '| status:', b.status, '| class:', b.class_id));
  });

  process.exit(0);
})();
