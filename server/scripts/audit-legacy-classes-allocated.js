/**
 * Read-only audit of customers.classes_allocated — the legacy per-customer
 * credit counter that booking eligibility consults BEFORE the enrollment ledger.
 *
 * server/routes/classes.js:
 *     remaining = customers.classes_allocated - count(bookings in booked|attended)
 *     if (remaining > 0)  -> allow, ledger never consulted
 *     if (remaining <= 0) -> fall through to the enrollment ledger
 *
 * Only INFLATION is dangerous. If the legacy figure is short the request falls
 * through to the ledger, which is correct. If it is generous the student can
 * book classes the ledger says they do not own, and nothing we fixed in #68/#69
 * ever gets consulted.
 *
 * Writes nothing. Run from server/:
 *   node scripts/audit-legacy-classes-allocated.js
 */
require('dotenv').config();

const { supabase, getEnrollmentCredits } = require('../utils/supabaseDb');

// Exactly what the eligibility gate counts. Note what is absent: 'completed'
// and 'forfeited'. If either is common, the legacy counter is systematically
// generous, because those classes are consumed but never subtracted.
const LEGACY_COUNTED = ['booked', 'attended'];

(async () => {
  let customers = [], page = 0, more = true;
  while (more) {
    const { data } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email, classes_allocated, last_login_at')
      .range(page * 1000, (page + 1) * 1000 - 1);
    customers = customers.concat(data || []);
    more = (data || []).length === 1000;
    page++;
  }

  let bookings = [];
  page = 0; more = true;
  while (more) {
    const { data } = await supabase
      .from('bookings')
      .select('id, student_id, status, course_enrollment_id')
      .range(page * 1000, (page + 1) * 1000 - 1);
    bookings = bookings.concat(data || []);
    more = (data || []).length === 1000;
    page++;
  }

  const statusTotals = {};
  bookings.forEach(b => { statusTotals[b.status] = (statusTotals[b.status] || 0) + 1; });
  console.log('— booking statuses across the whole system —');
  Object.entries(statusTotals).sort((a, b) => b[1] - a[1])
    .forEach(([s, n]) => console.log(`   ${s.padEnd(12)} ${String(n).padStart(5)}${LEGACY_COUNTED.includes(s) ? '  <- counted by the legacy gate' : ''}`));

  const byStudent = {};
  bookings.forEach(b => {
    if (!byStudent[b.student_id]) byStudent[b.student_id] = [];
    byStudent[b.student_id].push(b);
  });

  let enrollments = [], p2 = 0, m2 = true;
  while (m2) {
    const { data } = await supabase
      .from('course_enrollments')
      .select('id, student_id, status, credits_closed_at')
      .range(p2 * 1000, (p2 + 1) * 1000 - 1);
    enrollments = enrollments.concat(data || []);
    m2 = (data || []).length === 1000;
    p2++;
  }
  const enrByStudent = {};
  enrollments.forEach(e => {
    if (!enrByStudent[e.student_id]) enrByStudent[e.student_id] = [];
    enrByStudent[e.student_id].push(e);
  });

  const inflated = [];
  let withAllocation = 0;

  for (const c of customers) {
    const allocated = c.classes_allocated || 0;
    if (allocated <= 0) continue;
    withAllocation++;

    const mine = byStudent[c.id] || [];
    const legacyCounted = mine.filter(b => LEGACY_COUNTED.includes(b.status)).length;
    const legacyRemaining = allocated - legacyCounted;
    if (legacyRemaining <= 0) continue;   // falls through to the ledger — safe

    let ledgerRemaining = 0;
    for (const e of (enrByStudent[c.id] || [])) {
      if (e.credits_closed_at) continue;
      if (!['active', 'completed'].includes(e.status)) continue;
      const credits = await getEnrollmentCredits(e.id);
      ledgerRemaining += credits.remaining;
    }

    if (legacyRemaining > ledgerRemaining) {
      const live = (enrByStudent[c.id] || [])
        .some(e => ['active', 'paused', 'upcoming'].includes(e.status));
      inflated.push({
        id: c.id,
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
        allocated,
        legacyCounted,
        legacyRemaining,
        ledgerRemaining,
        excess: legacyRemaining - ledgerRemaining,
        consumedNotCounted: mine.filter(b => ['completed', 'forfeited', 'absent'].includes(b.status)).length,
        live,
        lastLogin: c.last_login_at ? c.last_login_at.slice(0, 10) : null,
      });
    }
  }

  inflated.sort((a, b) => b.excess - a.excess);

  console.log(`\n— ${customers.length} customers, ${withAllocation} with a non-zero classes_allocated —`);
  console.log(`\nCAN BOOK BEYOND THE LEDGER: ${inflated.length} customers, ${inflated.reduce((s, r) => s + r.excess, 0)} excess classes`);

  // The raw total is not the exposure. Someone with no live enrollment who has
  // not logged in for a year is theoretical; someone mid-course is not.
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const live = inflated.filter(r => r.live);
  const recent = inflated.filter(r => !r.live && r.lastLogin && r.lastLogin >= cutoff);
  const dormant = inflated.filter(r => !r.live && !(r.lastLogin && r.lastLogin >= cutoff));

  const sum = rows => rows.reduce((s, r) => s + r.excess, 0);
  console.log(`\n   live enrollment (active/paused/upcoming) : ${String(live.length).padStart(4)} customers, ${String(sum(live)).padStart(4)} classes  <- REAL EXPOSURE`);
  console.log(`   no live enrollment, logged in since ${cutoff} : ${String(recent.length).padStart(4)} customers, ${String(sum(recent)).padStart(4)} classes  <- reachable`);
  console.log(`   dormant                                  : ${String(dormant.length).padStart(4)} customers, ${String(sum(dormant)).padStart(4)} classes  <- theoretical`);

  const show = (label, rows) => {
    if (!rows.length) return;
    console.log(`\n${label}`);
    console.log('   customer                     alloc  counted  legacy  ledger  excess  last login');
    rows.slice(0, 25).forEach(r => {
      console.log(`   ${r.name.slice(0, 26).padEnd(26)} ${String(r.allocated).padStart(5)} ${String(r.legacyCounted).padStart(8)} ${String(r.legacyRemaining).padStart(7)} ${String(r.ledgerRemaining).padStart(7)} ${String(r.excess).padStart(7)}  ${r.lastLogin || '-'}`);
    });
    if (rows.length > 25) console.log(`   ... and ${rows.length - 25} more`);
  };

  show('LIVE ENROLLMENTS — these students are in the studio now:', live);
  show('NO LIVE ENROLLMENT BUT LOGGING IN:', recent);
})();
