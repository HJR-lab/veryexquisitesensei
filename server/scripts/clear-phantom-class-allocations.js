/**
 * One-off: clear the phantom default-6 class allocation.
 *
 * customers.classes_allocated defaulted to 6, and booking eligibility reads it
 * BEFORE the enrollment ledger, so every customer record ever created carried
 * six genuinely bookable classes nobody bought.
 *
 * Run from server/:
 *   node scripts/clear-phantom-class-allocations.js          # dry run
 *   node scripts/clear-phantom-class-allocations.js --apply
 *
 * DELIBERATELY CONSERVATIVE. A record is only cleared when all four hold:
 *   1. classes_allocated is exactly 6 — the default, not a purchased figure
 *   2. no bookings, ever, of any status
 *   3. no course_enrollments row, of any status
 *   4. course_purchase_count is 0
 *
 * Rules 3 and 4 matter more than they look. A student who purchased last week
 * has an enrollment but no bookings yet, because the cohort's classes are not
 * created until the threshold is met — clearing them would lock a paying
 * customer out. And 353 records have a purchase count but no enrollment at all
 * (the order-sync gap); those are potential real entitlements and are left
 * alone for someone to look at properly.
 */
require('dotenv').config();

const { supabase } = require('../utils/supabaseDb');

const APPLY = process.argv.includes('--apply');
const DEFAULT_ALLOCATION = 6;

async function fetchAll(table, columns) {
  let rows = [], page = 0, more = true;
  while (more) {
    const { data, error } = await supabase.from(table).select(columns)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    rows = rows.concat(data || []);
    more = (data || []).length === 1000;
    page++;
  }
  return rows;
}

(async () => {
  const customers = await fetchAll('customers', 'id, first_name, last_name, email, role, classes_allocated, course_purchase_count, created_at');
  const bookings = await fetchAll('bookings', 'student_id');
  const enrollments = await fetchAll('course_enrollments', 'student_id, status');

  const hasBooking = new Set(bookings.map(b => b.student_id));
  const hasEnrollment = new Set(enrollments.map(e => e.student_id));

  const target = [], skipped = { hasBookings: 0, hasEnrollment: 0, hasPurchases: 0, notDefault: 0 };

  for (const c of customers) {
    if ((c.classes_allocated || 0) !== DEFAULT_ALLOCATION) { skipped.notDefault++; continue; }
    if (hasBooking.has(c.id)) { skipped.hasBookings++; continue; }
    if (hasEnrollment.has(c.id)) { skipped.hasEnrollment++; continue; }
    if ((c.course_purchase_count || 0) > 0) { skipped.hasPurchases++; continue; }
    target.push(c);
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${customers.length} customers\n`);
  console.log(`  not at the default of ${DEFAULT_ALLOCATION} : ${skipped.notDefault}`);
  console.log(`  has bookings                 : ${skipped.hasBookings}`);
  console.log(`  has an enrollment            : ${skipped.hasEnrollment}`);
  console.log(`  has purchases                : ${skipped.hasPurchases}`);
  console.log(`\n  TO CLEAR: ${target.length} customers, ${target.length * DEFAULT_ALLOCATION} phantom classes`);

  const staff = target.filter(c => c.role && c.role !== 'student');
  if (staff.length) {
    console.log(`\n  includes ${staff.length} non-student account(s):`);
    staff.forEach(c => console.log(`     ${c.role.padEnd(12)} ${c.first_name} ${c.last_name}`));
  }
  console.log('\n  sample:');
  target.slice(0, 8).forEach(c => console.log(`     ${String(c.id).padStart(5)}  ${`${c.first_name || ''} ${c.last_name || ''}`.trim().slice(0, 28).padEnd(28)} created ${c.created_at?.slice(0, 10)}`));

  if (!APPLY) {
    console.log('\nNothing written. Re-run with --apply.');
    process.exit(0);
  }

  let done = 0;
  for (const c of target) {
    // Direct update, NOT updateCustomer() — that bumps updated_at, which the
    // Shopify sync reads as "an admin edited this" and would protect the row
    // from future syncs. See project_sync_field_protection.
    const { error } = await supabase
      .from('customers').update({ classes_allocated: 0 }).eq('id', c.id);
    if (error) { console.error(`  FAILED on ${c.id}:`, error.message); process.exit(1); }
    done++;
  }
  console.log(`\ncleared ${done} customers.`);
})();
