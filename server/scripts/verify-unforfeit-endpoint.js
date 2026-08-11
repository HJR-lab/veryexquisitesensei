/**
 * Verify: POST /api/admin/bookings/:bookingId/unforfeit returns a no-show credit
 * without inflating the student's allocation.
 *
 * Runs the REAL route handler over HTTP by mounting routes/admin.js into a bare
 * Express app with stubbed auth middleware, then exercises it against a real
 * forfeited booking and restores every byte it touched.
 *
 * Guards the two ways this action can go wrong:
 *   1. Writing class_credits_allocated — a destructive override that shrinks a
 *      course (see project_credits_allocated_override / Ryan Ling's 12-vs-11).
 *   2. Leaving the stored explicit zero in place — both classes.js and
 *      admin.js:133 skip an enrollment at class_credits_remaining === 0 before
 *      the ledger is consulted, so the credit would be visible and unbookable.
 *
 * Run from server/:  node scripts/verify-unforfeit-endpoint.js
 */
require('dotenv').config();

const express = require('express');
const supabaseDb = require('../utils/supabaseDb');
const { supabase, getEnrollmentCredits } = supabaseDb;

let failures = 0;

function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'} ${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

async function buildApp(adminId, adminEmail) {
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
  if (!admin) { console.error('admin info@ves.sg not found'); process.exit(1); }

  // Pick a real forfeited booking that is attached to an enrollment.
  const { data: candidates } = await supabase
    .from('bookings')
    .select('id, student_id, status, attended, course_enrollment_id')
    .in('status', ['forfeited', 'absent'])
    .not('course_enrollment_id', 'is', null)
    .order('id', { ascending: false })
    .limit(1);

  const target = (candidates || [])[0];
  if (!target) { console.error('no forfeited booking with an enrollment to test against'); process.exit(1); }

  const { data: beforeCustomer } = await supabase
    .from('customers').select('classes_forfeited').eq('id', target.student_id).single();
  const { data: beforeEnr } = await supabase
    .from('course_enrollments')
    .select('id, class_credits_allocated, class_credits_used, class_credits_remaining, number_of_weeks')
    .eq('id', target.course_enrollment_id).single();
  const beforeCredits = await getEnrollmentCredits(target.course_enrollment_id);

  console.log(`\n— target: booking ${target.id}, student ${target.student_id}, enrollment ${beforeEnr.id} —`);
  console.log(`   before: status=${target.status} forfeited_counter=${beforeCustomer.classes_forfeited} ` +
    `allocated=${beforeEnr.class_credits_allocated} used=${beforeEnr.class_credits_used} ` +
    `remaining=${beforeEnr.class_credits_remaining} computed_remaining=${beforeCredits.remaining}`);

  const app = await buildApp(admin.id, admin.email);
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const post = async (path, body) => {
    const r = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return { status: r.status, body: await r.json() };
  };

  let restored = false;
  const restore = async () => {
    if (restored) return;
    restored = true;
    await supabase.from('bookings')
      .update({ status: target.status, attended: target.attended }).eq('id', target.id);
    await supabase.from('customers')
      .update({ classes_forfeited: beforeCustomer.classes_forfeited }).eq('id', target.student_id);
    await supabase.from('course_enrollments').update({
      class_credits_allocated: beforeEnr.class_credits_allocated,
      class_credits_used: beforeEnr.class_credits_used,
      class_credits_remaining: beforeEnr.class_credits_remaining,
    }).eq('id', beforeEnr.id);
    await supabase.from('booking_credit_adjustments').delete().eq('booking_id', target.id);
    console.log('\n   state restored.');
  };

  try {
    console.log('\n— rejections —');
    const noReason = await post(`/api/admin/bookings/${target.id}/unforfeit`, {});
    assert('missing reason is rejected', noReason.status, 400);

    const blankReason = await post(`/api/admin/bookings/${target.id}/unforfeit`, { reason: '   ' });
    assert('whitespace-only reason is rejected', blankReason.status, 400);

    const longReason = await post(`/api/admin/bookings/${target.id}/unforfeit`, { reason: 'x'.repeat(501) });
    assert('over-long reason is rejected', longReason.status, 400);

    const missing = await post('/api/admin/bookings/99999999/unforfeit', { reason: 'test' });
    assert('unknown booking is 404', missing.status, 404);

    console.log('\n— the reversal —');
    const reason = 'VERIFY SCRIPT — medical certificate provided';
    const ok = await post(`/api/admin/bookings/${target.id}/unforfeit`, { reason });
    assert('reversal succeeds', ok.status, 200);

    const { data: afterBooking } = await supabase
      .from('bookings').select('status, attended').eq('id', target.id).single();
    assert('booking is cancelled', afterBooking.status, 'cancelled');
    assert('attended is cleared', afterBooking.attended, null);

    const { data: afterCustomer } = await supabase
      .from('customers').select('classes_forfeited').eq('id', target.student_id).single();
    assert('forfeit counter decremented',
      afterCustomer.classes_forfeited, Math.max(0, beforeCustomer.classes_forfeited - 1));

    const { data: afterEnr } = await supabase
      .from('course_enrollments')
      .select('class_credits_allocated, class_credits_used, class_credits_remaining')
      .eq('id', beforeEnr.id).single();
    assert('allocation is NOT touched',
      afterEnr.class_credits_allocated, beforeEnr.class_credits_allocated);
    assert('stored used decremented',
      afterEnr.class_credits_used, Math.max(0, (beforeEnr.class_credits_used || 0) - 1));
    assert('stored remaining incremented (lifts the explicit-zero override)',
      afterEnr.class_credits_remaining, (beforeEnr.class_credits_remaining || 0) + 1);

    const afterCredits = await getEnrollmentCredits(beforeEnr.id);
    assert('computed remaining is one higher', afterCredits.remaining, beforeCredits.remaining + 1);
    assert('computed forfeited is one lower', afterCredits.forfeited, beforeCredits.forfeited - 1);

    console.log('\n— audit trail —');
    const { data: audit } = await supabase
      .from('booking_credit_adjustments')
      .select('*').eq('booking_id', target.id).order('id', { ascending: false }).limit(1);
    const row = (audit || [])[0];
    assert('audit row written', !!row, true);
    if (row) {
      assert('audit records the reason', row.reason, reason);
      assert('audit records the action', row.action, 'unforfeit');
      assert('audit records the previous status', row.previous_status, target.status);
      assert('audit records the new status', row.new_status, 'cancelled');
      assert('audit records who', row.admin_email, admin.email);
      assert('audit records the enrollment', row.course_enrollment_id, beforeEnr.id);
    }

    console.log('\n— not repeatable —');
    const twice = await post(`/api/admin/bookings/${target.id}/unforfeit`, { reason: 'second attempt' });
    assert('a cancelled booking cannot be un-forfeited again', twice.status, 400);
  } finally {
    await restore();
    server.close();
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
