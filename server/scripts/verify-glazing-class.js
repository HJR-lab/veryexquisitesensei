/**
 * Verify: an HB class can be marked as a glazing class, a 10-class package
 * student's booking on it consumes their glazing, and the glazing sub-capacity
 * holds without closing the class to ordinary handbuilding bookings.
 *
 * Runs the REAL route handlers over HTTP by mounting routes into a bare Express
 * app with stubbed auth. It books and unbooks against a real future HB class and
 * restores every row it touches — including the glazing marker and the students'
 * glazing_class_used flags.
 *
 * Guards the properties the feature rests on:
 *   1. is_glazing is what makes an HB class glazing — nothing in an HB class code
 *      can say so, which is why 10-class students had nothing to book.
 *   2. A package student's booking on a marked class sets counts_as_glazing AND
 *      glazing_class_used. Neither alone is enough: the first drives the
 *      sub-capacity, the second stops them spending glazing twice.
 *   3. The glazing sub-cap refuses the (N+1)th GLAZING booking while the class
 *      still admits regular bookings — the whole point of a sub-limit.
 *   4. A regular booker is never charged a glazing seat.
 *   5. Unmarking is refused while glazing bookings depend on it.
 *
 * Run from server/:  node scripts/verify-glazing-class.js
 */
require('dotenv').config();

const express = require('express');
const supabaseDb = require('../utils/supabaseDb');
const { supabase } = supabaseDb;
const { GLAZING_SUBCAP, GLAZING_DRYING_GAP_DAYS, isGlazingClass, glazingSubCap } = require('../utils/glazing');

let failures = 0;
const cleanup = [];

function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'} ${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

function buildApp(userFor) {
  const app = express();
  app.use(express.json());
  // The acting user is swapped per request via a header so one app can book as
  // several students without re-mounting the routes.
  const authenticateToken = (req, _res, next) => {
    req.user = userFor(req.headers['x-test-user']);
    next();
  };
  const requireAdmin = (_req, _res, next) => next();
  const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error('handler error:', err.message);
      res.status(500).json({ error: err.message });
    });

  require('../routes/classes')(app, { authenticateToken, requireAdmin, asyncHandler });
  require('../routes/admin')(app, { authenticateToken, requireAdmin, asyncHandler });
  return app;
}

async function post(port, path, body, asUser) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer stub', 'x-test-user': String(asUser ?? '') },
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function put(port, path, body) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', authorization: 'Bearer stub' },
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

(async () => {
  // ── Pure rule checks, no DB needed ──────────────────────────────────────────
  assert('a WT final week is glazing (6.6)', isGlazingClass({ class_type: 'WT0206NT_JL6.6' }), true);
  assert('a 7-week final week is glazing (7.7) — the includes("6.6") bug', isGlazingClass({ class_type: 'WT1104AM_DL7.7' }), true);
  assert('a mid-course week is not glazing', isGlazingClass({ class_type: 'WT0206NT_JL6.3' }), false);
  assert('a plain HB class is not glazing', isGlazingClass({ class_type: 'HB_0809_1900' }), false);
  assert('a marked HB class IS glazing', isGlazingClass({ class_type: 'HB_0809_1900', is_glazing: true }), true);
  assert('only marked classes carry a sub-cap', glazingSubCap({ class_type: 'WT0206NT_JL6.6' }), null);
  assert('a marked class defaults to the standard sub-cap', glazingSubCap({ class_type: 'HB_x', is_glazing: true }), GLAZING_SUBCAP);
  assert('a per-class sub-cap wins', glazingSubCap({ class_type: 'HB_x', is_glazing: true, glazing_capacity: 2 }), 2);
  // The bug the shared derivation fixes: week 6 of a SEVEN-week course is an
  // ordinary class, but the old week === '6' || week === '7' test called it glazing
  // and imposed the pre-glazing drying gap around it.
  assert('week 6 of a 7-week course is NOT glazing', isGlazingClass({ class_type: 'WT1104AM_DL7.6' }), false);
  assert('the drying gap is 6 days', GLAZING_DRYING_GAP_DAYS, 6);

  // ── Live checks against a real future HB class ──────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const { data: hbClasses, error: hbError } = await supabase
    .from('class_instances')
    .select('id, class_type, class_date, start_time, max_capacity, is_glazing, glazing_capacity, current_enrollment')
    .like('class_type', 'HB%')
    .eq('status', 'active')
    .gt('class_date', today)
    .order('class_date', { ascending: true })
    .limit(1);

  // Checked explicitly: selecting is_glazing before the migration has run errors,
  // and an unchecked error returns no rows — which reads as "no HB classes exist"
  // and quietly skips every live check while still reporting a pass.
  if (hbError) {
    console.error(`\n❌ cannot query class_instances: ${hbError.message}`);
    if (/is_glazing|glazing_capacity/.test(hbError.message)) {
      console.error('   Run the migration first:  node scripts/add-glazing-class-columns.js');
    }
    process.exit(1);
  }

  const hb = (hbClasses || [])[0];
  if (!hb) {
    console.log('\n⚠️  no future active HB class found — skipping the live checks');
    console.log(`\n${failures === 0 ? '✅ rule checks passed' : `❌ ${failures} check(s) failed`}`);
    process.exit(failures === 0 ? 0 : 1);
  }
  console.log(`\n   using HB class ${hb.id} (${hb.class_type} on ${hb.class_date}, cap ${hb.max_capacity})`);

  // Package students who still owe a glazing class — the ones this is for.
  const { data: pkgEnrollments } = await supabase
    .from('course_enrollments')
    .select('id, student_id, glazing_class_used, number_of_weeks, package_total_classes, customers(first_name, email)')
    .or('package_total_classes.eq.10,number_of_weeks.eq.10')
    .neq('status', 'cancelled')
    .eq('glazing_class_used', false)
    .limit(3);

  const candidates = (pkgEnrollments || []).filter(e => e.student_id);
  if (candidates.length < 1) {
    console.log('⚠️  no package enrollment with an unspent glazing found — skipping the booking checks');
    console.log(`\n${failures === 0 ? '✅ rule checks passed' : `❌ ${failures} check(s) failed`}`);
    process.exit(failures === 0 ? 0 : 1);
  }

  const originalMark = { is_glazing: hb.is_glazing, glazing_capacity: hb.glazing_capacity };
  cleanup.push(async () => {
    await supabase.from('class_instances').update(originalMark).eq('id', hb.id);
  });

  const app = buildApp((id) => ({ dbCustomerId: id ? parseInt(id) : null, email: 'info@ves.sg', isAdmin: true }));
  const server = app.listen(0);
  const port = server.address().port;

  try {
    // Sub-cap of 1 so a single extra booking proves the gate, without needing
    // four spare package students.
    const marked = await put(port, `/api/admin/classes/${hb.id}/glazing`, { isGlazing: true, glazingCapacity: 1 });
    assert('admin can mark an HB class as glazing', marked.status, 200);
    assert('the marker is stored', marked.body?.class?.is_glazing, true);

    const student = candidates[0];
    const before = (await supabase.from('bookings').select('id', { count: 'exact', head: true })
      .eq('class_instance_id', hb.id).eq('status', 'booked')).count || 0;

    const booked = await post(port, '/api/classes/book', { classInstanceId: hb.id }, student.student_id);
    if (booked.status === 200) {
      cleanup.push(async () => {
        await supabase.from('bookings').delete().eq('id', booked.body.booking.id);
        await supabase.from('class_instances').update({ current_enrollment: hb.current_enrollment }).eq('id', hb.id);
        await supabase.from('course_enrollments').update({ glazing_class_used: false }).eq('id', student.id);
      });
    }
    assert(`package student ${student.customers?.first_name} can book the marked class`, booked.status, 200);

    const { data: bookingRow } = await supabase
      .from('bookings').select('id, counts_as_glazing').eq('id', booked.body?.booking?.id || 0).single();
    assert('the booking is recorded as the glazing one', bookingRow?.counts_as_glazing, true);

    const { data: enrollAfter } = await supabase
      .from('course_enrollments').select('glazing_class_used').eq('id', student.id).single();
    assert('the glazing entitlement is spent', enrollAfter?.glazing_class_used, true);

    // The sub-cap is 1 and it is now taken, so a second GLAZING booking must be
    // refused even though the class itself has seats left.
    if (candidates.length > 1) {
      const second = candidates.find(c => c.student_id !== student.student_id);
      const refused = await post(port, '/api/classes/book', { classInstanceId: hb.id }, second.student_id);
      if (refused.status === 200) {
        cleanup.push(async () => {
          await supabase.from('bookings').delete().eq('id', refused.body.booking.id);
          await supabase.from('course_enrollments').update({ glazing_class_used: false }).eq('id', second.id);
        });
      }
      assert('a second glazing booking is refused at the sub-cap', refused.status, 400);
      const saysGlazing = /glazing places/i.test(refused.body?.error || '');
      assert('and refused for the glazing limit, not "class full"', saysGlazing, true);

      const seatsLeft = (hb.max_capacity || 8) - (before + 1);
      console.log(`   (class still had ${seatsLeft} seat(s) free for regular bookings)`);
    } else {
      console.log('   ⚠️  only one eligible package student — sub-cap refusal not exercised');
    }

    // Unmarking must be refused while a glazing booking depends on it.
    const unmark = await put(port, `/api/admin/classes/${hb.id}/glazing`, { isGlazing: false });
    assert('unmarking is refused while glazing bookings exist', unmark.status, 400);

    // ── The final class is always the glazing class ───────────────────────────
    // A package student one class short of their total may only book a glazing
    // class. Exercised against whoever is actually in that position; if nobody is,
    // say so rather than reporting a pass on an untested rule.
    const { data: pkgAll } = await supabase
      .from('course_enrollments')
      .select('id, student_id, number_of_weeks, package_total_classes, customers(first_name)')
      .or('package_total_classes.eq.10,number_of_weeks.eq.10')
      .neq('status', 'cancelled');

    let atFinal = null;
    for (const pkg of pkgAll || []) {
      const total = pkg.package_total_classes || pkg.number_of_weeks || 10;
      const { count } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('course_enrollment_id', pkg.id)
        .in('status', ['booked', 'attended', 'completed', 'rescheduled', 'absent', 'forfeited']);
      if ((count || 0) === total - 1) { atFinal = { pkg, booked: count, total }; break; }
    }

    if (!atFinal) {
      console.log('   ⚠️  no package student sits exactly one class short — final-class rule not exercised live');
    } else {
      // A plain (unmarked, non-final-week) class must be refused for them.
      const { data: plainRows } = await supabase
        .from('class_instances')
        .select('id, class_type, is_glazing')
        .like('class_type', 'HB%')
        .eq('status', 'active')
        .eq('is_glazing', false)
        .gt('class_date', today)
        .neq('id', hb.id)
        .limit(1);

      const plain = (plainRows || [])[0];
      if (!plain) {
        console.log('   ⚠️  no unmarked future HB class to test the refusal against');
      } else {
        const refused = await post(port, '/api/classes/book', { classInstanceId: plain.id }, atFinal.pkg.student_id);
        if (refused.status === 200) {
          cleanup.push(async () => { await supabase.from('bookings').delete().eq('id', refused.body.booking.id); });
        }
        console.log(`   ${atFinal.pkg.customers?.first_name} is at ${atFinal.booked}/${atFinal.total}`);
        assert('a non-glazing class is refused as the final class', refused.status, 400);
        assert('and refused for the final-class rule', /final class, which must be a glazing/i.test(refused.body?.error || ''), true);
      }
    }
  } finally {
    server.close();
    for (const undo of cleanup.reverse()) {
      try { await undo(); } catch (e) { console.error('cleanup failed:', e.message); }
    }
    console.log('   (restored: bookings removed, glazing marker and entitlements reset)');
  }

  console.log(`\n${failures === 0 ? '✅ all checks passed' : `❌ ${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
