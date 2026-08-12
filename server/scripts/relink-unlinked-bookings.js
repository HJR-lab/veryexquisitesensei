/**
 * Repair upcoming bookings that were saved without an enrollment link.
 *
 * A booking with no course_enrollment_id is invisible to getEnrollmentCredits,
 * which counts by that column — the seat is taken but no credit is ever spent.
 * Cause was the makeup-booking fallback resolving only 10-class packages, so a
 * 6-week student got a null link and a free class.
 *
 * Run from server/:
 *   node scripts/relink-unlinked-bookings.js          # dry run
 *   node scripts/relink-unlinked-bookings.js --apply
 *
 * The sweep is UPCOMING ONLY, deliberately. A past unlinked booking is history:
 * the student attended, the class is gone, and relinking it retroactively
 * rewrites a balance they have been living with. That is a per-student
 * decision, so past bookings are only ever repaired one at a time:
 *
 *   node scripts/relink-unlinked-bookings.js --booking=29013 --apply
 *
 * Nicole Wong (bookings 29013, 29014) was the first such case: she had attended
 * all 10 classes of her package, but two were unlinked, so the system still
 * offered her 2. Justin confirmed 12/08/26 that she had completed all 10.
 */
require('dotenv').config();

const { supabase, resolveBookingEnrollment, syncStoredCredits } = require('../utils/supabaseDb');

const APPLY = process.argv.includes('--apply');
const ONLY_BOOKING = (() => {
  const arg = process.argv.find(a => a.startsWith('--booking='));
  return arg ? parseInt(arg.split('=')[1], 10) : null;
})();
const CONSUMING = ['booked', 'attended', 'completed', 'forfeited', 'absent'];

(async () => {
  const todayStr = new Date().toISOString().split('T')[0];

  let bookings = [], page = 0, more = true;
  while (more) {
    const { data } = await supabase
      .from('bookings')
      .select('id, student_id, status, course_enrollment_id, class_instances!bookings_class_instance_id_fkey(class_date, class_type)')
      .range(page * 1000, (page + 1) * 1000 - 1);
    bookings = bookings.concat(data || []);
    more = (data || []).length === 1000;
    page++;
  }

  const unlinked = bookings.filter(b => !b.course_enrollment_id && CONSUMING.includes(b.status));
  const upcoming = unlinked.filter(b =>
    (b.class_instances?.class_date || '').split(/[T ]/)[0] >= todayStr);

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}\n`);

  let inScope;
  if (ONLY_BOOKING) {
    inScope = unlinked.filter(b => b.id === ONLY_BOOKING);
    if (!inScope.length) {
      console.log(`  booking ${ONLY_BOOKING} is not an unlinked credit-consuming booking — nothing to do.`);
      process.exit(0);
    }
    console.log(`  targeting booking ${ONLY_BOOKING} only (deliberate per-student correction)\n`);
  } else {
    inScope = upcoming;
    console.log(`  unlinked credit-consuming bookings : ${unlinked.length}`);
    console.log(`  ...upcoming (in scope)             : ${upcoming.length}`);
    console.log(`  ...past (needs --booking=ID)       : ${unlinked.length - upcoming.length}\n`);
  }

  const plan = [];
  for (const b of inScope) {
    const enrollmentId = await resolveBookingEnrollment(b.student_id, b.class_instances);
    const { data: cu } = await supabase
      .from('customers').select('first_name, last_name').eq('id', b.student_id).single();
    plan.push({ booking: b, enrollmentId, name: `${cu?.first_name || ''} ${cu?.last_name || ''}`.trim() });
  }

  for (const p of plan) {
    const d = p.booking.class_instances?.class_date?.slice(0, 10);
    console.log(`   booking ${p.booking.id}  ${p.name.padEnd(22)} ${d} ${p.booking.class_instances?.class_type || ''}` +
      `  ->  ${p.enrollmentId ? `enrollment ${p.enrollmentId}` : 'NO CANDIDATE (left unlinked)'}`);
  }

  if (!APPLY) {
    console.log('\nNothing written. Re-run with --apply.');
    process.exit(0);
  }

  let done = 0;
  for (const p of plan) {
    if (!p.enrollmentId) continue;
    const { error } = await supabase
      .from('bookings')
      .update({ course_enrollment_id: p.enrollmentId, updated_at: new Date().toISOString() })
      .eq('id', p.booking.id);
    if (error) { console.error(`  FAILED on booking ${p.booking.id}:`, error.message); process.exit(1); }
    // The ledger now counts this booking; bring the stored cache along with it.
    await syncStoredCredits(p.enrollmentId);
    done++;
  }
  console.log(`\nrelinked ${done} booking(s).`);
})();
