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

// Booking a studio session spends VES credit up front. Ending the booking any
// way other than attending it has to give that credit back, or the studio keeps
// money for a session that never happened. It did: four bookings across four
// students held $120 that way, because cancel simply set a status and stopped.
const STUDIO_ACCESS_REFUND_SOURCE = 'studio_access_refund';

async function refundStudioAccessCredit(booking, reason) {
  const applied = Number(booking?.credit_applied) || 0;
  if (applied <= 0) return 0;

  const { refundCredits } = require('./creditManager');
  const { refunded, alreadyRefunded } = await refundCredits({
    customerId: booking.customer_id,
    amount: applied,
    source: STUDIO_ACCESS_REFUND_SOURCE,
    referenceId: String(booking.id),
    description: `Studio access ${booking.booking_date} ${reason} — $${applied} credit returned`,
  });

  // Clear the marker either way. If the refund was already posted, the booking
  // row is the thing that is behind, and leaving it set invites a second one.
  await supabaseDb.supabase
    .from('studio_access_bookings')
    .update({ credit_applied: 0, updated_at: new Date().toISOString() })
    .eq('id', booking.id);

  if (refunded > 0) {
    console.log(`[Credits] Returned $${refunded} to customer ${booking.customer_id} — studio access #${booking.id} ${reason}`);
  } else if (alreadyRefunded) {
    console.log(`[Credits] Studio access #${booking.id} was already refunded — booking row cleared`);
  }
  return refunded;
}

/**
 * Close out studio access bookings whose date has passed without resolution.
 *
 * A booking spends credit the moment it is made and only stops holding it when
 * someone marks it attended or cancels it. Nothing did that on a schedule, so a
 * booking nobody touched sat on the student's money indefinitely with no
 * warning anywhere. The four unreversed cancellations found in September were
 * the visible half of that; a stale booking is the half that never even shows
 * up as cancelled.
 *
 * The two states are not the same and are not treated the same:
 *
 *   pending — the admin never confirmed it, so the session was never agreed to.
 *             Safe to cancel and refund automatically.
 *   booked  — confirmed, and may well have been attended with the attendance
 *             never recorded. Refunding that would erase a real charge, so this
 *             only reports and leaves the decision to a person.
 */
async function sweepStaleStudioAccess({ dryRun = false } = {}) {
  const today = new Date().toISOString().split('T')[0];

  const { data: stale, error } = await supabaseDb.supabase
    .from('studio_access_bookings')
    .select('*')
    .in('status', ['pending', 'booked'])
    .lt('booking_date', today)
    .order('booking_date', { ascending: true });

  if (error) throw error;

  const pending = (stale || []).filter(b => b.status === 'pending');
  const confirmed = (stale || []).filter(b => b.status === 'booked');
  let refundedTotal = 0;

  for (const b of pending) {
    if (dryRun) {
      refundedTotal += Number(b.credit_applied) || 0;
      console.log(`[Studio Access Sweep] would close #${b.id} (${b.booking_date}, $${b.credit_applied || 0})`);
      continue;
    }
    await supabaseDb.supabase
      .from('studio_access_bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        admin_notes: [b.admin_notes, 'Auto-cancelled: never confirmed, date passed'].filter(Boolean).join(' • '),
      })
      .eq('id', b.id);
    refundedTotal += await refundStudioAccessCredit(b, 'never confirmed, date passed');
  }

  for (const b of confirmed) {
    console.warn(`[Studio Access Sweep] ⚠️  #${b.id} customer ${b.customer_id} ${b.booking_date} still 'booked' with $${b.credit_applied || 0} held — mark attended or cancel it`);
  }

  if (pending.length || confirmed.length) {
    console.log(`[Studio Access Sweep] closed ${pending.length} unconfirmed ($${refundedTotal} returned), ${confirmed.length} confirmed booking(s) need a human`);
  }

  return {
    closed: pending.length,
    refunded: refundedTotal,
    needsReview: confirmed.map(b => ({ id: b.id, customerId: b.customer_id, date: b.booking_date, creditHeld: Number(b.credit_applied) || 0 })),
  };
}

module.exports = {
  getStudioAccessPasses,
  refundStudioAccessCredit,
  sweepStaleStudioAccess,
  STUDIO_ACCESS_REFUND_SOURCE,
};
