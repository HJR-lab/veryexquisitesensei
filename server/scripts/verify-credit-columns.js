/**
 * Verify the credit invariant: the bookings ledger is the source of truth for
 * the NUMBER, and credits_closed_at is the source of truth for WHETHER a block
 * is open. The stored class_credits_* columns are a cache and must agree.
 *
 * Standing regression guard. Run from server/:
 *   node scripts/verify-credit-columns.js
 *
 * The bug class this catches: a stored value drifting away from the ledger, or
 * a block being closed by the accident of a zero rather than by decision — the
 * two failures that produced Amanda Ng's unbookable credit and Geraldine Lai's
 * latently-trapped package.
 */
require('dotenv').config();

const { supabase, getEnrollmentCredits, resolveBookingEnrollment } = require('../utils/supabaseDb');

let failures = 0;
function fail(msg) { failures++; console.log(`❌ ${msg}`); }
function pass(msg) { console.log(`✅ ${msg}`); }

(async () => {
  let all = [], page = 0, more = true;
  while (more) {
    const { data } = await supabase
      .from('course_enrollments')
      .select('id, student_id, status, class_credits_remaining, credits_closed_at, credits_closed_reason')
      .range(page * 1000, (page + 1) * 1000 - 1);
    all = all.concat(data || []);
    more = (data || []).length === 1000;
    page++;
  }

  const drifted = [], closedWithoutReason = [], trapped = [], closedButOpenLooking = [];

  for (const e of all) {
    const credits = await getEnrollmentCredits(e.id);
    const closed = !!e.credits_closed_at;

    if (closed && !e.credits_closed_reason) closedWithoutReason.push(e.id);

    if (!closed && e.class_credits_remaining !== credits.remaining) {
      drifted.push({ id: e.id, stored: e.class_credits_remaining, computed: credits.remaining });
    }

    // The Geraldine Lai trap: an open, live enrollment the ledger says owes
    // credits, but whose stored cache reads zero. Under the old gate this was
    // silently unbookable.
    if (!closed
      && ['active', 'paused', 'upcoming'].includes(e.status)
      && credits.remaining > 0
      && (e.class_credits_remaining === 0 || e.class_credits_remaining == null)) {
      trapped.push({ id: e.id, computed: credits.remaining });
    }

    // A closed block whose stored value still advertises credits is
    // contradictory — one of the two says the student can book.
    if (closed && (e.class_credits_remaining || 0) > 0) {
      closedButOpenLooking.push({ id: e.id, stored: e.class_credits_remaining });
    }
  }

  console.log(`— ${all.length} enrollments —\n`);

  const closedCount = all.filter(e => e.credits_closed_at).length;
  console.log(`   ${closedCount} blocks explicitly closed, ${all.length - closedCount} open\n`);

  if (drifted.length === 0) pass('every open enrollment\'s stored cache matches the ledger');
  else {
    fail(`${drifted.length} open enrollment(s) drifted from the ledger`);
    drifted.slice(0, 20).forEach(d => console.log(`      enr ${d.id}: stored ${d.stored}, ledger ${d.computed}`));
  }

  if (closedWithoutReason.length === 0) pass('every closed block records why');
  else fail(`${closedWithoutReason.length} closed block(s) have no reason: ${closedWithoutReason.join(', ')}`);

  if (trapped.length === 0) pass('no live enrollment is owed credits it cannot offer');
  else {
    fail(`${trapped.length} live enrollment(s) trapped — ledger owes credits, stored reads zero`);
    trapped.forEach(t => console.log(`      enr ${t.id}: ledger owes ${t.computed}`));
  }

  if (closedButOpenLooking.length === 0) pass('no closed block still advertises a stored balance');
  else {
    fail(`${closedButOpenLooking.length} closed block(s) still show a stored balance`);
    closedButOpenLooking.forEach(c => console.log(`      enr ${c.id}: stored ${c.stored}`));
  }

  // A booking with no course_enrollment_id is invisible to getEnrollmentCredits,
  // which counts by that column — the seat is taken but no credit is spent. The
  // checks above cannot see this: they compare stored against computed, and both
  // agree, because both are blind to the same booking.
  //
  // Only UPCOMING bookings fail the run. A past unlinked booking is history — the
  // student attended, the class is gone, and relinking it would rewrite a
  // balance retroactively. An upcoming one is a live free class.
  const todayStr = new Date().toISOString().split('T')[0];
  let bookings = [], bp = 0, bmore = true;
  while (bmore) {
    const { data } = await supabase
      .from('bookings')
      .select('id, student_id, status, course_enrollment_id, class_instances!bookings_class_instance_id_fkey(class_date, class_type)')
      .range(bp * 1000, (bp + 1) * 1000 - 1);
    bookings = bookings.concat(data || []);
    bmore = (data || []).length === 1000;
    bp++;
  }

  const CONSUMING = ['booked', 'attended', 'completed', 'forfeited', 'absent'];
  const unlinked = bookings.filter(b => !b.course_enrollment_id && CONSUMING.includes(b.status));
  const unlinkedUpcoming = unlinked.filter(b =>
    (b.class_instances?.class_date || '').split(/[T ]/)[0] >= todayStr);

  if (unlinkedUpcoming.length === 0) {
    pass(`no upcoming booking is unlinked from an enrollment (${unlinked.length} historical, not counted)`);
  } else {
    fail(`${unlinkedUpcoming.length} upcoming booking(s) consume no credit — not linked to any enrollment`);
    for (const b of unlinkedUpcoming) {
      const suggested = await resolveBookingEnrollment(b.student_id, b.class_instances);
      console.log(`      booking ${b.id} (student ${b.student_id}, ${b.class_instances?.class_date?.slice(0, 10)} ${b.class_instances?.class_type || ''})` +
        `${suggested ? ` -> should be enrollment ${suggested}` : ' -> no candidate enrollment'}`);
    }
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
