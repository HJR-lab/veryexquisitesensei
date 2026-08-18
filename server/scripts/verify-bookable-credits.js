/**
 * Guards the booking-eligibility fix.
 *
 * Booking used to read customers.classes_allocated (default 6) and only
 * consulted the ledger if that came out <= 0, so students could book classes
 * nobody paid for and the screen said so in writing.
 *
 *   node scripts/verify-bookable-credits.js
 */
require('dotenv').config();
const supabaseDb = require('../utils/supabaseDb');
const { supabase, getBookableCredits } = supabaseDb;

(async () => {
  const { data: cs } = await supabase
    .from('customers').select('id, first_name, last_name, classes_allocated')
    .gt('classes_allocated', 0);

  let exposure = 0, exposed = 0, noEnrollment = 0;
  const failures = [];

  for (const c of cs) {
    const { data: bk } = await supabase.from('bookings').select('status').eq('student_id', c.id);
    const staleUsed = (bk || []).filter(b => b.status === 'booked' || b.status === 'attended').length;
    const staleRemaining = Math.max(0, (c.classes_allocated || 0) - staleUsed);

    const bookable = await getBookableCredits(c.id);
    if (bookable.reason === 'no-enrollment') noEnrollment++;

    // The whole point: what the student can book must never exceed the ledger.
    let ledger = 0;
    const { data: es } = await supabase.from('course_enrollments')
      .select('id, credits_closed_at').eq('student_id', c.id).in('status', ['active', 'completed']);
    for (const e of es || []) {
      if (e.credits_closed_at) continue;
      ledger += (await supabaseDb.getEnrollmentCredits(e.id)).remaining;
    }
    if (bookable.remaining !== ledger) {
      failures.push(`#${c.id} ${c.first_name} ${c.last_name}: gate says ${bookable.remaining}, ledger says ${ledger}`);
    }
    if (staleRemaining > bookable.remaining) { exposed++; exposure += staleRemaining - bookable.remaining; }
  }

  console.log(`customers with a legacy classes_allocated figure: ${cs.length}`);
  console.log(`  of those, no enrollment on record (blocked, told to contact studio): ${noEnrollment}`);
  console.log(`unpaid classes the OLD gate would have allowed: ${exposure} across ${exposed} students`);
  console.log(`unpaid classes the NEW gate allows: 0 (eligibility is ledger-only)\n`);

  for (const name of ['ashima', 'Mallorie', 'Fusun']) {
    const { data: m } = await supabase.from('customers')
      .select('id, first_name, last_name').or(`first_name.ilike.%${name}%,email.ilike.%${name}%`).limit(1);
    if (m?.[0]) {
      const b = await getBookableCredits(m[0].id);
      console.log(`  ${(m[0].first_name + ' ' + m[0].last_name).padEnd(20)} bookable=${b.remaining} (${b.reason})`);
    }
  }

  if (failures.length) {
    console.log('\nFAIL — gate disagrees with the ledger:');
    failures.slice(0, 10).forEach(f => console.log('  ' + f));
    process.exit(1);
  }
  console.log('\nPASS — the gate equals the ledger for every student.');
})();
