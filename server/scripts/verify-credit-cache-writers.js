/**
 * Verify that every credit-affecting route leaves the stored cache agreeing
 * with the bookings ledger, and that the cache is DERIVED rather than adjusted.
 *
 * The distinction matters. Incremental arithmetic (+1 here, -1 there) carries
 * drift forward forever: once a counter is wrong, every subsequent operation
 * keeps it wrong. A derived cache heals. This test proves the difference by
 * deliberately corrupting the counter and confirming the next route call
 * repairs it rather than adding to the corruption.
 *
 * Run from server/:  node scripts/verify-credit-cache-writers.js
 */
require('dotenv').config();

const express = require('express');
const supabaseDb = require('../utils/supabaseDb');
const { supabase, getEnrollmentCredits } = supabaseDb;

const ENROLLMENT_ID = 5420;   // live HB block, 8 allocated
const CLASS_ID = 14142;       // future HB class, empty

let failures = 0;
function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'} ${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

async function cacheAgreesWithLedger(enrollmentId) {
  const { data: e } = await supabase
    .from('course_enrollments')
    .select('class_credits_used, class_credits_remaining, credits_closed_at')
    .eq('id', enrollmentId).single();
  const credits = await getEnrollmentCredits(enrollmentId);
  return {
    remainingMatches: e.class_credits_remaining === (e.credits_closed_at ? 0 : credits.remaining),
    usedMatches: e.credits_closed_at ? true : e.class_credits_used === credits.committed,
    stored: { used: e.class_credits_used, remaining: e.class_credits_remaining },
    ledger: { committed: credits.committed, remaining: credits.remaining },
  };
}

function buildApp(adminId, adminEmail) {
  const app = express();
  app.use(express.json());
  const authenticateToken = (req, _res, next) => {
    req.user = { dbCustomerId: adminId, email: adminEmail, isAdmin: true };
    next();
  };
  const requireAdmin = (_req, _res, next) => next();
  const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error('handler error:', err);
      res.status(500).json({ error: err.message });
    });
  require('../routes/admin')(app, { authenticateToken, requireAdmin, asyncHandler });
  return app;
}

(async () => {
  const { data: admin } = await supabase
    .from('customers').select('id, email').eq('email', 'info@ves.sg').single();

  const { data: before } = await supabase
    .from('course_enrollments')
    .select('student_id, class_credits_allocated, class_credits_used, class_credits_remaining')
    .eq('id', ENROLLMENT_ID).single();
  const { data: clsBefore } = await supabase
    .from('class_instances').select('current_enrollment').eq('id', CLASS_ID).single();

  console.log(`— enrollment ${ENROLLMENT_ID}: allocated ${before.class_credits_allocated}, used ${before.class_credits_used}, remaining ${before.class_credits_remaining} —`);

  const app = buildApp(admin.id, admin.email);
  const server = app.listen(0);
  const port = server.address().port;
  const call = async (method, path, body) => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  let createdBookingId = null;

  try {
    console.log('\n— corrupt the cache, then let a route heal it —');
    await supabase.from('course_enrollments')
      .update({ class_credits_used: 99, class_credits_remaining: 77 })
      .eq('id', ENROLLMENT_ID);
    let state = await cacheAgreesWithLedger(ENROLLMENT_ID);
    assert('cache is corrupted to start', state.remainingMatches, false);

    console.log('\n— admin creates a booking —');
    const created = await call('POST', '/api/admin/bookings', {
      studentId: before.student_id,
      classInstanceId: CLASS_ID,
      bookingType: 'regular',
      status: 'booked',
      courseEnrollmentId: ENROLLMENT_ID,
    });
    assert('booking created', created.status, 200);

    const { data: newBooking } = await supabase
      .from('bookings').select('id, status')
      .eq('course_enrollment_id', ENROLLMENT_ID).eq('class_instance_id', CLASS_ID)
      .order('id', { ascending: false }).limit(1).single();
    createdBookingId = newBooking?.id;
    assert('booking row exists', !!createdBookingId, true);

    state = await cacheAgreesWithLedger(ENROLLMENT_ID);
    assert('corruption HEALED — remaining derived from ledger', state.remainingMatches, true);
    assert('corruption HEALED — used derived from ledger', state.usedMatches, true);
    console.log(`   stored ${JSON.stringify(state.stored)} vs ledger ${JSON.stringify(state.ledger)}`);

    console.log('\n— convert that booking back to a credit —');
    const converted = await call('POST', `/api/admin/bookings/${createdBookingId}/convert-to-credit`);
    assert('conversion succeeded', converted.status, 200);

    state = await cacheAgreesWithLedger(ENROLLMENT_ID);
    assert('cache still agrees after conversion', state.remainingMatches && state.usedMatches, true);

    const { data: afterAlloc } = await supabase
      .from('course_enrollments').select('class_credits_allocated').eq('id', ENROLLMENT_ID).single();
    assert('allocation never shrank',
      afterAlloc.class_credits_allocated >= before.class_credits_allocated, true);

    console.log('\n— un-forfeit the existing no-show —');
    const { data: forfeited } = await supabase
      .from('bookings').select('id, status, attended')
      .eq('course_enrollment_id', ENROLLMENT_ID).in('status', ['forfeited', 'absent'])
      .limit(1).single();

    if (forfeited) {
      const un = await call('POST', `/api/admin/bookings/${forfeited.id}/unforfeit`, { reason: 'CACHE WRITER TEST' });
      assert('un-forfeit succeeded', un.status, 200);
      state = await cacheAgreesWithLedger(ENROLLMENT_ID);
      assert('cache still agrees after un-forfeit', state.remainingMatches && state.usedMatches, true);

      await supabase.from('bookings')
        .update({ status: forfeited.status, attended: forfeited.attended }).eq('id', forfeited.id);
      await supabase.from('booking_credit_adjustments').delete().eq('booking_id', forfeited.id);
    } else {
      console.log('   (no forfeited booking on this enrollment — skipped)');
    }
  } finally {
    if (createdBookingId) await supabase.from('bookings').delete().eq('id', createdBookingId);
    await supabase.from('course_enrollments').update({
      class_credits_allocated: before.class_credits_allocated,
      class_credits_used: before.class_credits_used,
      class_credits_remaining: before.class_credits_remaining,
    }).eq('id', ENROLLMENT_ID);
    await supabase.from('class_instances')
      .update({ current_enrollment: clsBefore.current_enrollment }).eq('id', CLASS_ID);
    server.close();

    const { data: restored } = await supabase
      .from('course_enrollments')
      .select('class_credits_allocated, class_credits_used, class_credits_remaining')
      .eq('id', ENROLLMENT_ID).single();
    console.log('\n   restored:', JSON.stringify(restored));
    assert('state fully restored', restored, {
      class_credits_allocated: before.class_credits_allocated,
      class_credits_used: before.class_credits_used,
      class_credits_remaining: before.class_credits_remaining,
    });
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
