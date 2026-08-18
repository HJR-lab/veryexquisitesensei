/**
 * Students whose course dates have all passed but who still hold unspent credits.
 * These read as ACTIVE in the Users list next to an expired date range.
 *
 *   node scripts/list-ended-course-credit-holders.js
 */
require('dotenv').config();
const supabaseDb = require('../utils/supabaseDb');
const { supabase } = supabaseDb;

(async () => {
  const today = new Date().toISOString().split('T')[0];
  const { data: enrolls } = await supabase
    .from('course_enrollments')
    .select('id, course_identifier, course_type, number_of_weeks, credits_closed_at, customers(first_name,last_name,email)')
    .eq('status', 'active');

  const rows = [];
  for (const e of enrolls) {
    if (e.credits_closed_at) continue;
    const { data: bk } = await supabase
      .from('bookings')
      .select('id, class_instances!bookings_class_instance_id_fkey(class_date)')
      .eq('course_enrollment_id', e.id)
      .in('status', ['booked', 'completed', 'attended']);

    const dates = (bk || []).map(b => b.class_instances?.class_date?.split(/[T ]/)[0]).filter(Boolean);
    if (dates.some(d => d >= today)) continue;   // still running

    const c = await supabaseDb.getEnrollmentCredits(e.id);
    if (c.remaining <= 0) continue;

    rows.push({
      id: e.id,
      name: `${e.customers?.first_name || ''} ${e.customers?.last_name || ''}`.trim(),
      email: e.customers?.email || '',
      course: e.course_identifier || '(no cohort)',
      type: (e.course_type || '').includes('Hand') ? 'HB' : 'WT',
      last: dates.sort().pop() || '—',
      allocated: c.allocated, used: c.committed, remaining: c.remaining
    });
  }

  rows.sort((a, b) => b.remaining - a.remaining);
  console.log(`${rows.length} students holding ${rows.reduce((s, r) => s + r.remaining, 0)} unspent credits on ended courses\n`);
  console.log('id     name                     type course           last class   alloc used LEFT  email');
  rows.forEach(r => console.log(
    String(r.id).padEnd(6), r.name.slice(0, 24).padEnd(24), r.type.padEnd(4),
    r.course.padEnd(16), r.last.padEnd(12),
    String(r.allocated).padStart(5), String(r.used).padStart(4), String(r.remaining).padStart(4), ' ' + r.email
  ));
})();
