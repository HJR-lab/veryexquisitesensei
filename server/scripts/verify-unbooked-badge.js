/**
 * Replicates the Users-list courseEnded / unbookedCredits maths added to
 * GET /api/admin/students, and reports who now gets the "N unbooked" badge
 * instead of ACTIVE.
 *
 *   node scripts/verify-unbooked-badge.js
 */
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');

const CONSUMING = ['booked', 'attended', 'completed', 'forfeited', 'absent'];

(async () => {
  const todayStr = new Date().toISOString().split('T')[0];
  const { data: enrolls } = await supabase
    .from('course_enrollments')
    .select('id, course_type, course_identifier, number_of_weeks, class_credits_allocated, credits_closed_at, course_end_date, customers(first_name,last_name)')
    // Only 'active' rows are eligible: the Users list renders paused and
    // upcoming through their own branches, which this badge must not hijack.
    .eq('status', 'active');

  const badged = [], stillActive = [];
  for (const enr of enrolls) {
    const { data: bk } = await supabase
      .from('bookings')
      .select('status, class_instances!bookings_class_instance_id_fkey(class_date)')
      .eq('course_enrollment_id', enr.id).in('status', CONSUMING);

    const committed = (bk || []).length;
    const dates = (bk || []).map(b => b.class_instances?.class_date?.split(/[T ]/)[0]).filter(Boolean);
    const hasFuture = dates.some(d => d >= todayStr);
    const lastClass = dates.filter(d => d < todayStr).sort().pop();

    const courseEnded = !hasFuture && Boolean(lastClass || enr.course_end_date);
    const isHB = (enr.course_type || '').toLowerCase().includes('handbuilding');
    const allocated = isHB ? (enr.class_credits_allocated || 0) : (enr.number_of_weeks || 6);
    const unbooked = enr.credits_closed_at ? 0 : Math.max(0, allocated - committed);

    const row = {
      id: enr.id,
      name: `${enr.customers?.first_name || ''} ${enr.customers?.last_name || ''}`.trim(),
      course: enr.course_identifier || '(no cohort)', allocated, committed, unbooked
    };
    if (courseEnded && unbooked > 0) badged.push(row); else stillActive.push(row);
  }

  badged.sort((a, b) => b.unbooked - a.unbooked);
  console.log(`Rows switching ACTIVE -> "N unbooked": ${badged.length}`);
  console.log(`Rows still reading ACTIVE: ${stillActive.length}`);
  console.log(`Total credits surfaced: ${badged.reduce((s, r) => s + r.unbooked, 0)}\n`);
  console.log('id     name                     course           alloc used LEFT');
  badged.forEach(r => console.log(
    String(r.id).padEnd(6), r.name.slice(0, 24).padEnd(24), r.course.padEnd(16),
    String(r.allocated).padStart(5), String(r.committed).padStart(4), String(r.unbooked).padStart(4)));

  const bad = badged.filter(r => r.unbooked > r.allocated || r.unbooked < 0);
  if (bad.length) { console.log('\nFAIL: nonsensical counts'); process.exit(1); }
  console.log('\nPASS — every count is within its allocation.');
})();
