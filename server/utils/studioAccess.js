const supabaseDb = require('./supabaseDb');

async function getStudioAccessPasses(customerId) {
  // Check if student has a WT 6wk x3 package enrollment (active or completed)
  const { data: enrollments } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('id, package_total_courses, course_identifier, course_type, status')
    .eq('student_id', customerId)
    .eq('package_total_courses', 3);

  const hasWt3 = enrollments?.some(enr =>
    (enr.course_identifier || '').toUpperCase().startsWith('WT') ||
    (enr.course_type || '').toLowerCase().includes('wheelthrowing')
  );

  if (!hasWt3) return { total: 0, used: 0, remaining: 0 };

  // Count used passes (bookings with is_pass = true or amount_sgd = 0 and notes contain 'pass')
  const { data: passBookings } = await supabaseDb.supabase
    .from('studio_access_bookings')
    .select('id')
    .eq('customer_id', customerId)
    .eq('amount_sgd', 0)
    .neq('status', 'cancelled');

  const used = passBookings?.length || 0;
  return { total: 3, used, remaining: Math.max(0, 3 - used) };
}

module.exports = { getStudioAccessPasses };
