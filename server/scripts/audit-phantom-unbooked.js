/**
 * How many students see phantom UNBOOKED rows on the admin detail page?
 *
 * GET /api/admin/students/:id/bookings drops every booking of a completed or
 * cancelled enrollment that has no future date (routes/admin.js ~3340), and also
 * anything older than 180 days. AdminStudentDetail then computes unbookedCount as
 * allocated - used, where `used` is counted from that already-filtered list — so a
 * finished course reports its full allocation as still bookable.
 */
require('dotenv').config();
const supabaseDb = require('../utils/supabaseDb');
const { supabase } = supabaseDb;

(async () => {
  const today = new Date().toISOString().split('T')[0];
  const cutoff = new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0];

  const { data: enrolls } = await supabase
    .from('course_enrollments')
    .select('id, student_id, status, course_identifier, course_type, number_of_weeks, class_credits_allocated, customers(first_name,last_name,email,classes_allocated)');

  const affected = [];
  for (const e of enrolls) {
    const { data: bk } = await supabase
      .from('bookings')
      .select('id, status, class_instances!bookings_class_instance_id_fkey(class_date)')
      .eq('course_enrollment_id', e.id)
      .in('status', ['booked', 'completed', 'attended', 'forfeited', 'absent']);
    if (!bk?.length) continue;

    const dates = bk.map(b => b.class_instances?.class_date?.split(/[T ]/)[0]).filter(Boolean);
    const hasFuture = dates.some(d => d >= today);

    // Replicate the endpoint's filter for this enrollment's bookings.
    let visible;
    if (['active', 'paused', 'upcoming'].includes(e.status)) {
      visible = dates.filter(d => d >= cutoff).length;      // only the 180-day rule
    } else {
      visible = hasFuture ? dates.filter(d => d >= cutoff).length : 0;
    }

    const hidden = bk.length - visible;
    if (hidden === 0) continue;

    const credits = await supabaseDb.getEnrollmentCredits(e.id);
    const allocated = credits.allocated || e.number_of_weeks || 0;
    const phantom = Math.max(0, allocated - visible);
    if (phantom > 0) {
      affected.push({
        id: e.id, status: e.status, course: e.course_identifier,
        name: `${e.customers?.first_name || ''} ${e.customers?.last_name || ''}`.trim(),
        real: bk.length, hidden, visible, allocated, phantom,
        attended: credits.attended, forfeited: credits.forfeited
      });
    }
  }

  const students = new Set(affected.map(a => a.name));
  console.log(`Enrollments showing phantom unbooked rows: ${affected.length}`);
  console.log(`Distinct students affected: ${students.size}`);
  console.log(`Total phantom "Book" rows offered: ${affected.reduce((s, a) => s + a.phantom, 0)}`);
  console.log(`Real bookings hidden from admin view: ${affected.reduce((s, a) => s + a.hidden, 0)}\n`);

  affected.sort((a, b) => b.phantom - a.phantom);
  console.log('id     status     course           name                     real hid vis alloc PHANTOM  att/forf');
  for (const a of affected.slice(0, 30)) {
    console.log(
      String(a.id).padEnd(6), a.status.padEnd(10), String(a.course).padEnd(16),
      a.name.slice(0, 24).padEnd(24),
      String(a.real).padStart(4), String(a.hidden).padStart(4), String(a.visible).padStart(4),
      String(a.allocated).padStart(5), String(a.phantom).padStart(8),
      `   ${a.attended}/${a.forfeited}`
    );
  }
  if (affected.length > 30) console.log(`... and ${affected.length - 30} more`);
})();
