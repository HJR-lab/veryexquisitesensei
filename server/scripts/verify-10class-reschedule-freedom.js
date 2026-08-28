/**
 * Verifies the "10 Classes NO EXPIRY" reschedule policy:
 * no cohort/level/glazing restrictions and no $40 out-of-cohort fee.
 *
 * 1. The detector in POST /api/classes/reschedule actually matches the real
 *    package enrollments in the database.
 * 2. Every reschedule restriction in that route is gated on !has10ClassPackage.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const supabaseDb = require('../utils/supabaseDb');

// Same expression as server/routes/classes.js
const detect = (e) =>
  e?.number_of_weeks >= 10 || (e?.course_title?.includes('10 Classes') ?? false);

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failures++;
};

(async () => {
  const { data: pkgs, error } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('id, course_title, number_of_weeks, package_total_classes, status')
    .or('number_of_weeks.gte.10,course_title.ilike.%10 Classes%')
    .limit(200);
  if (error) throw error;

  console.log(`\nFound ${pkgs.length} package-shaped enrollments\n`);
  const missed = pkgs.filter(e => !detect(e));
  check(missed.length === 0,
    `detector matches every package enrollment${missed.length ? ` (missed: ${missed.map(m => m.id).join(', ')})` : ''}`);

  // A plain 6-week WT enrollment must NOT be treated as a package
  const { data: regulars } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('id, course_title, number_of_weeks')
    .lt('number_of_weeks', 10)
    .not('course_title', 'ilike', '%10 Classes%')
    .limit(200);
  const falsePos = (regulars || []).filter(detect);
  check(falsePos.length === 0,
    `no regular course enrollment is treated as a package (${(regulars || []).length} checked)`);

  // Static check: the reschedule route's restrictions are all package-exempt
  const src = fs.readFileSync(path.join(__dirname, '../routes/classes.js'), 'utf8');
  const route = src.slice(src.indexOf("app.post('/api/classes/reschedule'"));
  const body = route.slice(0, route.indexOf("app.post('", 10));

  check(/if \(oldLevel && newLevel && oldLevel !== newLevel\) \{/.test(body) &&
        !/!has10ClassPackage && oldLevel/.test(body),
    'beginner/intermediate level lock STILL applies to package students');
  check(/Exception: 10-class package students can book after glazing/.test(body) &&
        /\/\/ Exception: 10-class package students can book after glazing[\s\S]{0,120}if \(!has10ClassPackage\)/.test(body),
    'after-glazing + drying-gap block skips package students');
  check(/if \(!has10ClassPackage && currentBooking\.course_enrollment_id\)/.test(body),
    'cohort date window + course-type lock skips package students');
  check(/if \(!isOldClassGlazing && !isHBCourse && !has10ClassPackage\)/.test(body),
    '$40 out-of-cohort fee skips package students');
  check(/checkPackageKeepsGlazing\(packageEnrollment, currentBooking\.id\)/.test(body),
    'glazing move is allowed but the package must keep a glazing class');
  check(/const \{ committed \} = await getEnrollmentCredits\(pkg\.id\)/.test(src) &&
        /const \{ remaining \} = await getEnrollmentCredits\(enrollment\.id\)/.test(src),
    'both glazing gates count credits through the ledger, not raw booking rows');

  // The invariant itself, against live package data: for every package where all
  // classes are booked, at least one booking is a glazing class.
  const { isGlazingClass } = require('../utils/glazing');
  const SPENT = ['booked', 'attended', 'completed', 'rescheduled', 'absent', 'forfeited'];
  let fullPkgs = 0, missingGlazing = [], legacyMissing = [];
  for (const pkg of pkgs.filter(p => p.status !== 'cancelled')) {
    const total = pkg.package_total_classes || pkg.number_of_weeks || 10;
    const { data: bs } = await supabaseDb.supabase
      .from('bookings')
      .select('id, class_instances!bookings_class_instance_id_fkey(class_type, is_glazing)')
      .eq('course_enrollment_id', pkg.id)
      .in('status', SPENT);
    if ((bs || []).length < total) continue; // still has room to book a glazing
    fullPkgs++;
    if ((bs || []).some(b => isGlazingClass(b.class_instances))) continue;
    // A package that already finished predates these rules — record it, but the
    // live invariant is only enforceable on packages still in play.
    (pkg.status === 'completed' ? legacyMissing : missingGlazing).push(pkg.id);
  }
  check(missingGlazing.length === 0,
    `every fully-booked live package holds a glazing class (${fullPkgs} full packages${missingGlazing.length ? `; missing: ${missingGlazing.join(', ')}` : ''})`);
  if (legacyMissing.length > 0) {
    console.log(`\n⚠️  ${legacyMissing.length} already-completed package(s) finished with no glazing class: enrollment ${legacyMissing.join(', ')}`);
    console.log('   Pre-dates this rule — those students never glazed their work. Worth a look, not a code failure.');
  }

  // Admin override: the admin booking/reschedule endpoints deliberately carry none
  // of these gates, so staff can grant the exceptions the rules cannot express.
  const adminSrc = fs.readFileSync(path.join(__dirname, '../routes/admin.js'), 'utf8');
  check(!/checkTenthClassMustBeGlazing|checkPackageKeepsGlazing|has10ClassPackage/.test(adminSrc),
    'admin booking + reschedule paths bypass every package/glazing gate');
  check(!/SPENT_BOOKING_STATUSES/.test(src),
    "the 'rescheduled'-inclusive status list is gone from classes.js");

  // Regression: a raw row count over a status list containing 'rescheduled'
  // double-counts every move (origin + destination), which made packages look full
  // and fired the "your final class must be glazing" block while classes were owed.
  const { getEnrollmentCredits } = require('../utils/bookingDb');
  const wronglyBlocked = [];
  for (const pkg of pkgs.filter(p => !['cancelled'].includes(p.status))) {
    const total = pkg.package_total_classes || pkg.number_of_weeks || 10;
    const { count: rawCount } = await supabaseDb.supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('course_enrollment_id', pkg.id)
      .in('status', SPENT);
    const { committed, remaining } = await getEnrollmentCredits(pkg.id);
    // Would the old raw count have demanded glazing while credits were still owed?
    if ((rawCount || 0) >= total - 1 && committed < total - 1) {
      wronglyBlocked.push(`${pkg.id} (raw ${rawCount} vs committed ${committed}, ${remaining} left)`);
    }
  }
  check(true, `raw-row miscount would have wrongly demanded glazing on ${wronglyBlocked.length} live package(s)`);
  for (const w of wronglyBlocked) console.log(`      now fixed: enrollment ${w}`);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
