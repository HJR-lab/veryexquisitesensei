/**
 * Verifies the package glazing rule: in a 10-class package, glazing is class 6
 * and class 10 — nothing else in the ten — and class 10 is ALWAYS glazing.
 *
 * Class 6 and class 10 are independent of each other. A student who takes their
 * class-6 cohort glazing still glazes again at class 10; a student who misses
 * class 6 still glazes at class 10. Nothing in the gate consults whether the
 * earlier one happened, and check 3 below is the tripwire for that.
 *
 * 1. The position rule itself, read from utils/glazing.js — the one definition,
 *    imported rather than copied, so this script cannot drift from the gate.
 * 2. The gates are wired into every student booking path, and into no admin path
 *    — admin bookings are the studio's deliberate override.
 * 3. "Class 10 is always glazing" is decided on the ledger alone: the gate must
 *    not weaken when a package already holds a glazing class.
 * 4. A live audit of real packages.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const supabaseDb = require('../utils/supabaseDb');
const { isGlazingClass, packageGlazingPositions, isAllowedGlazingPosition } = require('../utils/glazing');

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failures++;
};

const routeBody = (src, name) => {
  const start = src.indexOf(`app.post('/api/classes/${name}'`);
  if (start === -1) return '';
  const rest = src.slice(start);
  const next = rest.indexOf("app.post('", 10);
  return next === -1 ? rest : rest.slice(0, next);
};

(async () => {
  console.log('\n— the position rule (from utils/glazing.js) —');
  check(String(packageGlazingPositions(10)) === '6,10',
    'a 10-class package glazes at class 6 and class 10');
  check(![1, 2, 3, 4, 5, 7, 8, 9].some(p => isAllowedGlazingPosition(p, 10)),
    'no other class in the ten may be glazing');
  check(isAllowedGlazingPosition(6, 10) && isAllowedGlazingPosition(10, 10),
    'both class 6 and class 10 may be glazing — they do not exclude each other');

  console.log('\n— gate wiring —');
  const src = fs.readFileSync(path.join(__dirname, '../routes/classes.js'), 'utf8');

  for (const route of ['book', 'book-makeup']) {
    const body = routeBody(src, route);
    check(/checkGlazingPositionAllowed\(/.test(body),
      `/api/classes/${route} enforces the glazing position`);
    check(/checkTenthClassMustBeGlazing\(/.test(body),
      `/api/classes/${route} enforces "class 10 is always glazing"`);
  }

  const reschedule = routeBody(src, 'reschedule');
  check(/!isOldClassGlazing && isNewClassGlazing/.test(reschedule),
    'reschedule refuses regular → glazing for package students');
  check(/checkPackageKeepsGlazing\(/.test(reschedule),
    'reschedule still guards glazing → regular');

  const adminSrc = fs.readFileSync(path.join(__dirname, '../routes/admin.js'), 'utf8');
  check(!/checkGlazingPositionAllowed|checkTenthClassMustBeGlazing/.test(adminSrc),
    'admin routes carry no glazing gate (the sanctioned override)');

  console.log('\n— class 10 is always glazing —');
  const gateStart = src.indexOf('async function checkTenthClassMustBeGlazing');
  const gate = src.slice(gateStart, src.indexOf('\n}', gateStart));
  check(/committed >= total - 1/.test(gate),
    'the final class is decided on the credit ledger (committed vs total)');
  check(!/glazing_class_used|isGlazingClass\(b\.|counts_as_glazing/.test(gate),
    'and NOT on whether the package already took its class-6 glazing');

  console.log('\n— live packages —');
  const { data: pkgs, error } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('id, student_id, course_title, number_of_weeks, package_total_classes, status')
    .or('number_of_weeks.gte.10,course_title.ilike.%10 Classes%')
    .neq('status', 'cancelled')
    .limit(500);
  if (error) throw error;

  const tooMany = [];
  const finishedWithoutGlazing = [];
  for (const pkg of pkgs || []) {
    const total = pkg.package_total_classes || pkg.number_of_weeks || 10;
    const { data: bookings } = await supabaseDb.supabase
      .from('bookings')
      .select('id, status, class_instances!bookings_class_instance_id_fkey(class_type, is_glazing)')
      .eq('course_enrollment_id', pkg.id)
      .in('status', ['attended', 'completed', 'booked', 'forfeited', 'absent']);

    const held = (bookings || []).filter(b => isGlazingClass(b.class_instances)).length;
    const committed = (bookings || []).length;
    const allowedCount = packageGlazingPositions(total).length;

    if (held > allowedCount) tooMany.push({ id: pkg.id, student: pkg.student_id, held });
    if (committed >= total && held === 0) {
      finishedWithoutGlazing.push({ id: pkg.id, student: pkg.student_id, committed });
    }
  }

  console.log(`Checked ${(pkgs || []).length} package enrollments`);
  const report = (rows, ok, bad) => {
    if (!rows.length) return console.log(`  ${ok}`);
    console.log(`  ${bad}`);
    for (const r of rows) console.log(`    enrollment ${r.id} (student ${r.student}) — ${r.held ?? r.committed}`);
  };
  report(tooMany,
    'no package holds more than its two glazing classes',
    'packages holding MORE than two glazing classes (predate the gate, not blocked retroactively):');
  report(finishedWithoutGlazing,
    'no fully-booked package has spent its class 10 on a regular class',
    'fully-booked packages with NO glazing class (spent class 10 before the gate existed):');

  console.log(`\n${failures === 0 ? '✅ all checks passed' : `❌ ${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
