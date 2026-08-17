require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');

(async () => {
  const today = new Date().toISOString().split('T')[0];
  const { data: enrolls, error } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_identifier, course_type, status, number_of_weeks, total_weeks, class_credits_allocated, created_at, customers(first_name,last_name,email)')
    .eq('status', 'active');
  if (error) { console.error(error); process.exit(1); }
  console.log('active enrollments:', enrolls.length);

  let zeroBooking = [], allPastButActive = [], ok = 0;
  for (const e of enrolls) {
    const { data: bk } = await supabase
      .from('bookings')
      .select('id, status, class_instances!bookings_class_instance_id_fkey(class_date)')
      .eq('course_enrollment_id', e.id)
      .in('status', ['booked','completed','attended']);
    const dates = (bk||[]).map(b => b.class_instances?.class_date?.split(/[T ]/)[0]).filter(Boolean);
    if (!bk || bk.length === 0) { zeroBooking.push({...e, n:0}); continue; }
    const allPast = dates.length === bk.length && dates.every(d => d < today);
    if (allPast) allPastButActive.push({...e, n:bk.length, last: dates.sort().pop()});
    else ok++;
  }
  console.log('\n=== ACTIVE with ZERO bookings:', zeroBooking.length);
  for (const e of zeroBooking) console.log(`  #${e.id} ${(e.customers?.first_name+' '+e.customers?.last_name)} | ${e.course_identifier} | ${e.course_type} | wks=${e.number_of_weeks}/${e.total_weeks} alloc=${e.class_credits_allocated} | created ${e.created_at?.slice(0,10)}`);
  console.log('\n=== ACTIVE but all dates past:', allPastButActive.length);
  for (const e of allPastButActive) console.log(`  #${e.id} ${(e.customers?.first_name+' '+e.customers?.last_name)} | ${e.course_identifier} | n=${e.n} last=${e.last} | wks=${e.number_of_weeks}/${e.total_weeks} alloc=${e.class_credits_allocated}`);
  console.log('\n=== genuinely active (future dates):', ok);
})();
