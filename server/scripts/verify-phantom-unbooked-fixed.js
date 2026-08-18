/**
 * Confirms the phantom-UNBOOKED fix.
 *
 * Replicates AdminStudentDetail's unbookedCount math against what the bookings
 * endpoint now returns (the full history, unfiltered) and asserts that no
 * enrollment offers phantom Book buttons for classes the student already took.
 *
 *   node scripts/verify-phantom-unbooked-fixed.js
 */
require('dotenv').config();
const supabaseDb = require('../utils/supabaseDb');
const { supabase } = supabaseDb;

// AdminStudentDetail.jsx creditsUsedCount
const CONSUMING = ['booked', 'attended', 'completed', 'absent', 'missed', 'rescheduled', 'forfeited'];
// what the endpoint selects
const RETURNED = ['booked', 'completed', 'attended', 'forfeited', 'absent'];

(async () => {
  const { data: enrolls } = await supabase
    .from('course_enrollments')
    .select('id, status, course_identifier, course_type, number_of_weeks, class_credits_allocated, credits_closed_at, customers(first_name,last_name)');

  let phantomTotal = 0, worst = [], checked = 0;
  for (const e of enrolls) {
    const { data: bk } = await supabase
      .from('bookings').select('id, status')
      .eq('course_enrollment_id', e.id).in('status', RETURNED);
    if (!bk?.length) continue;
    checked++;

    // A closed credit block advertises nothing (AdminStudentDetail creditsClosed gate).
    if (e.credits_closed_at) continue;

    const used = bk.filter(b => CONSUMING.includes(b.status)).length;
    const credits = await supabaseDb.getEnrollmentCredits(e.id);
    const isHB = (e.course_type || '').toLowerCase().includes('handbuilding');
    const allocated = isHB ? credits.allocated : (e.number_of_weeks || 0);
    const phantom = Math.max(0, allocated - used);

    // A finished course must offer nothing. Genuine unspent credit is a separate,
    // legitimate case: only flag where the student has actually consumed the
    // allocation but the page would still invite more bookings.
    if (phantom > 0 && credits.remaining === 0) {
      phantomTotal += phantom;
      worst.push({ id: e.id, name: `${e.customers?.first_name} ${e.customers?.last_name}`, allocated, used, phantom });
    }
  }

  console.log(`Enrollments checked: ${checked}`);
  console.log(`Phantom Book rows on fully-consumed allocations: ${phantomTotal}`);
  if (worst.length) {
    worst.sort((a, b) => b.phantom - a.phantom).slice(0, 10)
      .forEach(w => console.log(`  FAIL #${w.id} ${w.name} alloc=${w.allocated} used=${w.used} phantom=${w.phantom}`));
    process.exit(1);
  }
  console.log('PASS — no student is offered classes they have already used.');
})();
