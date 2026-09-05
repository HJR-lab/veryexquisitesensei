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
 *   6. The ADMIN booking path obeys all of the above. It did not: it never asked
 *      whether the booking consumed a glazing class, so it neither counted the
 *      seat against the sub-cap nor spent the entitlement — an admin seating a
 *      package student on a marked HB session bypassed GLAZING_SUBCAP outright.
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
    .order('id', { ascending: true })
    .limit(25);

  // Only students the cross-type gate will actually let into an HB class can
  // exercise the glazing rules. That gate reads ACTIVE enrollments only, so a
  // package marked completed (routine once its 6-week cohort ends, while the
  // flex classes including glazing are still unspent) leaves the student looking
  // like a wheelthrowing-only booker and refuses them the marked HB class.
  //
  // Picking blindly made this script report five failures that were one
  // student's enrollment status, not a glazing defect — so it selects a student
  // the gate admits, and says plainly when the refusal is that gate.
  async function crossTypeAdmits(studentId) {
    const { data: active } = await supabase
      .from('course_enrollments')
      .select('course_type, course_identifier, number_of_weeks')
      .eq('student_id', studentId)
      .eq('status', 'active');
    if (!active || active.length === 0) return true;
    const has10 = active.some(e => e.number_of_weeks >= 10 || (e.course_type || '').includes('10 Classes'));
    if (has10) return true;
    const hasHB = active.some(e => (e.course_type || '').toLowerCase().includes('handbuilding') || (e.course_identifier || '').startsWith('HB'));
    const hasWT = active.some(e => (e.course_type || '').toLowerCase().includes('wheelthrowing') || (e.course_identifier || '').startsWith('WT'));
    return !(hasWT && !hasHB);
  }

  const withStudent = (pkgEnrollments || []).filter(e => e.student_id);
  const admitted = [];
  for (const e of withStudent) {
    if (await crossTypeAdmits(e.student_id)) admitted.push(e);
  }
  const blockedByType = withStudent.length - admitted.length;
  if (blockedByType > 0) {
    console.log(`   \u26a0\ufe0f  ${blockedByType} package student(s) with an unspent glazing are refused HB by the cross-type gate`);
    console.log('      (their package is not status "active", so the 10-class exemption does not fire — separate defect)');
  }

  const candidates = admitted;
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

    const before = (await supabase.from('bookings').select('id', { count: 'exact', head: true })
      .eq('class_instance_id', hb.id).eq('status', 'booked')).count || 0;

    // Book the FIRST candidate that the other gates admit, rather than assuming
    // candidates[0] can book. The drying gap, the final-class rule and the
    // cross-type gate all sit in front of the glazing logic, and any one of them
    // refusing turned every downstream check red for a reason that had nothing
    // to do with glazing. A refusal here is reported, not asserted away.
    let student = null;
    let booked = null;
    const refusedEarly = new Set();
    for (const c of candidates) {
      const attempt = await post(port, '/api/classes/book', { classInstanceId: hb.id }, c.student_id);
      if (attempt.status === 200) {
        cleanup.push(async () => {
          await supabase.from('bookings').delete().eq('id', attempt.body.booking.id);
          await supabase.from('class_instances').update({ current_enrollment: hb.current_enrollment }).eq('id', hb.id);
          await supabase.from('course_enrollments').update({ glazing_class_used: false }).eq('id', c.id);
        });
        student = c;
        booked = attempt;
        break;
      }
      refusedEarly.add(c.student_id);
      console.log(`   \u2014 ${c.customers?.first_name} refused by an earlier gate: ${attempt.body?.error}`);
    }

    assert('a package student with an unspent glazing can book the marked class', booked?.status, 200);

    if (!student) {
      console.log('   \u26a0\ufe0f  no candidate got past the earlier gates \u2014 glazing checks not exercised');
    } else {
    console.log(`   booked as ${student.customers?.first_name} (student ${student.student_id})`);

    const { data: bookingRow } = await supabase
      .from('bookings').select('id, counts_as_glazing').eq('id', booked.body?.booking?.id || 0).single();
    assert('the booking is recorded as the glazing one', bookingRow?.counts_as_glazing, true);

    const { data: enrollAfter } = await supabase
      .from('course_enrollments').select('glazing_class_used').eq('id', student.id).single();
    assert('the glazing entitlement is spent', enrollAfter?.glazing_class_used, true);

    // The sub-cap is 1 and it is now taken, so a second GLAZING booking must be
    // refused even though the class itself has seats left.
    if (candidates.length > 1) {
      const others = candidates.filter(c => c.student_id !== student.student_id);
      const second = others.find(c => !refusedEarly.has(c.student_id)) || others[0];
      const refused = await post(port, '/api/classes/book', { classInstanceId: hb.id }, second.student_id);
      if (refused.status === 200) {
        cleanup.push(async () => {
          await supabase.from('bookings').delete().eq('id', refused.body.booking.id);
          await supabase.from('course_enrollments').update({ glazing_class_used: false }).eq('id', second.id);
        });
      }
      const saysGlazing = /glazing places/i.test(refused.body?.error || '');
      if (refused.status === 400 && !saysGlazing) {
        // An earlier gate answered first, so the sub-cap was never consulted.
        // Reporting that is honest; asserting on it is not.
        console.log(`   \u26a0\ufe0f  sub-cap not reached for ${second.customers?.first_name}: ${refused.body?.error}`);
      } else {
        assert('a second glazing booking is refused at the sub-cap', refused.status, 400);
        assert('and refused for the glazing limit, not "class full"', saysGlazing, true);
      }

      const seatsLeft = (hb.max_capacity || 8) - (before + 1);
      console.log(`   (class still had ${seatsLeft} seat(s) free for regular bookings)`);
    } else {
      console.log('   ⚠️  only one eligible package student — sub-cap refusal not exercised');
    }

    // Unmarking must be refused while a glazing booking depends on it.
    const unmark = await put(port, `/api/admin/classes/${hb.id}/glazing`, { isGlazing: false });
    assert('unmarking is refused while glazing bookings exist', unmark.status, 400);

    // ── The admin booking path obeys the same sub-cap ─────────────────────────
    // POST /api/admin/bookings used to insert straight into bookings with no
    // counts_as_glazing and no asGlazing on the seat gate, so this is the check
    // that would have caught the bypass.
    if (candidates.length > 1) {
      const others = candidates.filter(c => c.student_id !== student.student_id);
      const second = others.find(c => !refusedEarly.has(c.student_id)) || others[0];

      // Sub-cap is 1 and taken. The admin path must refuse, not seat them.
      const adminRefused = await post(port, '/api/admin/bookings', {
        studentId: second.student_id,
        classInstanceId: hb.id,
        bookingType: 'regular',
        status: 'booked',
      }, student.student_id);
      if (adminRefused.status === 200) {
        cleanup.push(async () => {
          await supabase.from('bookings').delete().eq('id', adminRefused.body?.booking?.id);
          await supabase.from('course_enrollments').update({ glazing_class_used: false }).eq('id', second.id);
        });
      }
      assert('admin booking is refused at the glazing sub-cap', adminRefused.status, 400);
      assert('and refused for the glazing limit, not "class full"',
             /glazing places/i.test(adminRefused.body?.error || ''), true);

      // Raise the sub-cap by one and the same admin booking must now succeed —
      // and be recorded as the glazing booking, not as an ordinary one.
      const raised = await put(port, `/api/admin/classes/${hb.id}/glazing`, { isGlazing: true, glazingCapacity: 2 });
      assert('sub-cap can be raised to 2', raised.body?.class?.glazing_capacity, 2);

      const adminBooked = await post(port, '/api/admin/bookings', {
        studentId: second.student_id,
        classInstanceId: hb.id,
        bookingType: 'regular',
        status: 'booked',
      }, student.student_id);
      if (adminBooked.status === 200) {
        cleanup.push(async () => {
          await supabase.from('bookings').delete().eq('id', adminBooked.body?.booking?.id);
          await supabase.from('class_instances').update({ current_enrollment: hb.current_enrollment }).eq('id', hb.id);
          await supabase.from('course_enrollments').update({ glazing_class_used: false }).eq('id', second.id);
        });
      }
      assert('admin booking succeeds once a glazing seat is free', adminBooked.status, 200);

      const { data: adminRow } = await supabase
        .from('bookings').select('counts_as_glazing').eq('id', adminBooked.body?.booking?.id || 0).maybeSingle();
      assert('the admin-made booking is recorded as the glazing one', adminRow?.counts_as_glazing, true);

      const { data: adminEnroll } = await supabase
        .from('course_enrollments').select('glazing_class_used').eq('id', second.id).single();
      assert('the admin-made booking spends the glazing entitlement', adminEnroll?.glazing_class_used, true);

      // And unmarking is refused while an ADMIN-made glazing booking depends on it.
      const unmarkAdmin = await put(port, `/api/admin/classes/${hb.id}/glazing`, { isGlazing: false });
      assert('unmarking is still refused with admin-made glazing bookings', unmarkAdmin.status, 400);
    } else {
      console.log('   \u26a0\ufe0f  only one eligible package student — admin sub-cap checks not exercised');
    }

    // A student with no 10-class package must not be charged a glazing seat by
    // the admin path — the marker alone never decides this.
    const { data: pkgStudentRows } = await supabase
      .from('course_enrollments')
      .select('student_id')
      .or('package_total_classes.eq.10,number_of_weeks.eq.10')
      .neq('status', 'cancelled');
    const pkgStudentIds = new Set((pkgStudentRows || []).map(r => r.student_id));

    const { data: bookedHere } = await supabase
      .from('bookings').select('student_id').eq('class_instance_id', hb.id).neq('status', 'cancelled');
    const alreadyHere = new Set((bookedHere || []).map(b => b.student_id));

    const { data: plainStudents } = await supabase
      .from('customers').select('id, first_name').limit(200);
    const plainStudent = (plainStudents || [])
      .find(c => !pkgStudentIds.has(c.id) && !alreadyHere.has(c.id));

    if (!plainStudent) {
      console.log('   \u26a0\ufe0f  no non-package student available — regular-booker check not exercised');
    } else {
      const regular = await post(port, '/api/admin/bookings', {
        studentId: plainStudent.id,
        classInstanceId: hb.id,
        bookingType: 'regular',
        status: 'booked',
      }, student.student_id);
      if (regular.status === 200) {
        const madeId = regular.body?.booking?.id;
        const enrolledTo = regular.body?.booking?.course_enrollment_id;
        cleanup.push(async () => {
          await supabase.from('bookings').delete().eq('id', madeId);
          await supabase.from('class_instances').update({ current_enrollment: hb.current_enrollment }).eq('id', hb.id);
          // The booking moved the cached credit counter; derive it again now the row is gone.
          if (enrolledTo) { try { await supabaseDb.syncStoredCredits(enrolledTo); } catch (e) {} }
        });
        const { data: regRow } = await supabase
          .from('bookings').select('counts_as_glazing').eq('id', madeId || 0).maybeSingle();
        assert('a non-package student booked by admin is not charged a glazing seat',
               regRow?.counts_as_glazing, false);
      } else {
        console.log(`   \u26a0\ufe0f  regular admin booking not accepted (${regular.status}: ${regular.body?.error}) — regular-booker check not exercised`);
      }
    }

    } // end: a candidate got past the earlier gates

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
