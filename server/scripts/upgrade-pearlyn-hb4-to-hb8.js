/**
 * upgrade-pearlyn-hb4-to-hb8.js
 *
 * One-off: Pearlyn Poon (customer 3169) bought the 4-week handbuilding block
 * (order #2717, enrollment 5476) and has upgraded to the 8-week block. She keeps
 * everything she has already done — the upgrade is an increase in the allocation
 * on the SAME enrollment, not a new one, so the four bookings already attached to
 * 5476 (3 attended + 1 booked) stay exactly where they are and simply count
 * against a larger entitlement.
 *
 * PAYMENT: the upgrade (4 -> 8 weeks) was paid by PayNow transfer, not through
 * Shopify. Shopify therefore still shows only order #2717, "4 Weeks / FRIDAYS", $360,
 * and always will — there is no second order to sync and none is missing. The 8-week
 * entitlement lives only here, which is why it is set by hand.
 *
 * Editing the enrollment in place is safe against order sync: processCoursePurchase
 * dedupes on (shopify_order_id, shopify_line_item_id) and SKIPS an existing row
 * outright — it never rewrites one — so the raised allocation cannot be reverted
 * to 4 by a later sync.
 *
 * What changes:
 *   class_credits_allocated 4 -> 8   (the entitlement getEnrollmentCredits reads for HB)
 *   number_of_weeks         4 -> 8   (the display fallback several routes prefer)
 *   course_variant_title            "4 Weeks / ..." -> "8 Weeks / ..."
 *
 * course_end_date is deliberately NOT touched. Handbuilding credits do not expire,
 * and for HB that column is not a window: the booking route writes it as the date
 * of the last class booked, so it trails her bookings and advances by itself as she
 * spends the new credits. Writing a future date here would invent an expiry the
 * product does not have.
 *
 * used/remaining are NOT written by hand — syncStoredCredits() recomputes them
 * from the bookings ledger, which is the only sanctioned writer.
 *
 * Idempotent: re-running on an already-upgraded enrollment re-syncs the cache and
 * changes nothing else.
 *
 * Usage:
 *   cd server && node scripts/upgrade-pearlyn-hb4-to-hb8.js [--dry-run]
 */

require('dotenv').config();

const supabaseDb = require('../utils/supabaseDb');
const { supabase } = supabaseDb;

const DRY_RUN = process.argv.includes('--dry-run');

const STUDENT_ID = 3169;
const ENROLLMENT_ID = 5476;
const NEW_CREDITS = 8;

async function main() {
  console.log(`\n=== Pearlyn Poon: HB 4 weeks -> 8 weeks${DRY_RUN ? ' [DRY RUN]' : ''} ===\n`);

  const { data: student } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email')
    .eq('id', STUDENT_ID)
    .single();
  if (!student) throw new Error(`Customer ${STUDENT_ID} not found`);
  console.log(`Student: ${student.first_name} ${student.last_name} <${student.email}>`);

  const { data: enr } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_type, course_title, course_variant_title, course_identifier, status, number_of_weeks, class_credits_allocated, course_start_date, course_end_date, credits_closed_at')
    .eq('id', ENROLLMENT_ID)
    .single();
  if (!enr) throw new Error(`Enrollment ${ENROLLMENT_ID} not found`);
  if (enr.student_id !== STUDENT_ID) throw new Error(`Enrollment ${ENROLLMENT_ID} belongs to ${enr.student_id}, not ${STUDENT_ID}`);
  if (!/handbuilding/i.test(enr.course_type || '')) throw new Error(`Enrollment ${ENROLLMENT_ID} is not handbuilding (${enr.course_type})`);
  if (enr.credits_closed_at) throw new Error(`Enrollment ${ENROLLMENT_ID} credit block is closed — refusing to raise the allocation on a closed block`);

  const before = await supabaseDb.getEnrollmentCredits(ENROLLMENT_ID);
  console.log(`Before: ${enr.course_variant_title} — allocated ${before.allocated}, attended ${before.attended}, booked ${before.booked}, forfeited ${before.forfeited}, remaining ${before.remaining}`);

  if (before.allocated > NEW_CREDITS) {
    throw new Error(`Enrollment already allocates ${before.allocated} credits — this script only upgrades to ${NEW_CREDITS}`);
  }

  const newVariantTitle = (enr.course_variant_title || '').replace(/^4 Weeks\b/, '8 Weeks');

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] would set allocated ${enr.class_credits_allocated} -> ${NEW_CREDITS}, weeks ${enr.number_of_weeks} -> ${NEW_CREDITS}`);
    console.log(`[DRY RUN] would set variant "${enr.course_variant_title}" -> "${newVariantTitle}"`);
    console.log(`[DRY RUN] resulting bookable credits: ${NEW_CREDITS - before.committed} (${before.committed} already committed)`);
    return;
  }

  const { error: updErr } = await supabase
    .from('course_enrollments')
    .update({
      class_credits_allocated: NEW_CREDITS,
      number_of_weeks: NEW_CREDITS,
      course_variant_title: newVariantTitle,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ENROLLMENT_ID);
  if (updErr) throw updErr;

  await supabaseDb.syncStoredCredits(ENROLLMENT_ID);

  const after = await supabaseDb.getEnrollmentCredits(ENROLLMENT_ID);
  const { data: stored } = await supabase
    .from('course_enrollments')
    .select('number_of_weeks, course_variant_title, course_end_date, class_credits_allocated, class_credits_used, class_credits_remaining')
    .eq('id', ENROLLMENT_ID)
    .single();

  console.log(`\nAfter:  ${stored.course_variant_title} (last booked class ${stored.course_end_date}, no expiry)`);
  console.log(`Ledger: allocated ${after.allocated}, attended ${after.attended}, booked ${after.booked}, forfeited ${after.forfeited}, remaining ${after.remaining}`);
  console.log(`Stored: allocated ${stored.class_credits_allocated}, used ${stored.class_credits_used}, remaining ${stored.class_credits_remaining}`);

  const bookable = await supabaseDb.getBookableCredits(STUDENT_ID);
  console.log(`\nBookable now: ${bookable.remaining} (reason: ${bookable.reason}, enrollment ${bookable.enrollment?.id})`);

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, status, class_instances!bookings_class_instance_id_fkey(class_date, class_type)')
    .eq('course_enrollment_id', ENROLLMENT_ID);
  console.log(`\nAttendance history kept — ${bookings.length} bookings still on enrollment ${ENROLLMENT_ID}:`);
  for (const b of bookings.sort((a, b) => a.class_instances.class_date.localeCompare(b.class_instances.class_date))) {
    console.log(`  ${b.class_instances.class_date.slice(0, 10)}  ${b.class_instances.class_type}  ${b.status}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('\nFAILED:', e.message || e); process.exit(1); });
