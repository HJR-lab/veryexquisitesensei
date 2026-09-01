/**
 * convert-ashima-wt-to-hb.js
 *
 * One-off: Ashima Narain (customer 2829) missed the last 3 classes of her
 * 6-week wheelthrowing course WT2305PM_DL6 (enrollment 5357) and has asked to
 * move to handbuilding. Convert those 3 forfeited classes into 3 HB credits.
 *
 * The forfeited bookings are left as they are — she did miss them, and that is
 * the record. The remedy is a separate grant, so the two are never confused:
 *
 *   1. a manual HB enrollment carrying 3 credits, which is what she may book
 *      against (class_credits_allocated is the allocation for an HB block —
 *      see getEnrollmentCredits, where isHB reads it directly);
 *   2. the WT block closed, with the reason recording where the 3 went, so a
 *      later unforfeit-on-appeal cannot hand her the same 3 classes twice.
 *
 * shopify_order_id 'MANUAL' keeps the grant out of order sync, which
 * deduplicates on (shopify_order_id, shopify_line_item_id).
 *
 * Idempotent: re-running finds the existing grant and does nothing.
 *
 * Usage:
 *   cd server && node scripts/convert-ashima-wt-to-hb.js [--dry-run]
 */

require('dotenv').config();

const supabaseDb = require('../utils/supabaseDb');
const { supabase } = supabaseDb;

const DRY_RUN = process.argv.includes('--dry-run');

const STUDENT_ID = 2829;
const WT_ENROLLMENT_ID = 5357;
const CREDITS = 3;
const LINE_ITEM_ID = 'MANUAL-CONVERT-WT5357-HB';

async function main() {
  console.log(`\n=== Ashima: 3 missed WT classes -> 3 HB credits${DRY_RUN ? ' [DRY RUN]' : ''} ===\n`);

  const { data: student } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email')
    .eq('id', STUDENT_ID)
    .single();

  if (!student) throw new Error(`Customer ${STUDENT_ID} not found`);
  console.log(`Student: ${student.first_name} ${student.last_name} <${student.email}>`);

  const { data: wt } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_identifier, course_type, status, credits_closed_at, credits_closed_reason')
    .eq('id', WT_ENROLLMENT_ID)
    .single();

  if (!wt) throw new Error(`Enrollment ${WT_ENROLLMENT_ID} not found`);
  if (wt.student_id !== STUDENT_ID) throw new Error(`Enrollment ${WT_ENROLLMENT_ID} belongs to ${wt.student_id}, not ${STUDENT_ID}`);

  const before = await supabaseDb.getEnrollmentCredits(wt.id);
  console.log(`WT ${wt.course_identifier} (${wt.status}): attended ${before.attended}, forfeited ${before.forfeited}, booked ${before.booked}`);

  if (before.forfeited !== CREDITS) {
    throw new Error(`Expected ${CREDITS} forfeited classes on enrollment ${wt.id}, found ${before.forfeited}. Aborting — the grant would not match what was missed.`);
  }

  // Idempotency: has this conversion already run?
  const { data: existing } = await supabase
    .from('course_enrollments')
    .select('id, class_credits_allocated, class_credits_remaining')
    .eq('student_id', STUDENT_ID)
    .eq('shopify_line_item_id', LINE_ITEM_ID)
    .maybeSingle();

  if (existing) {
    console.log(`\nAlready converted — HB enrollment ${existing.id} exists (${existing.class_credits_remaining}/${existing.class_credits_allocated} credits). Nothing to do.`);
    return;
  }

  const now = new Date().toISOString();
  const closureReason = `Switched to handbuilding at the student's request — ${CREDITS} missed wheelthrowing classes converted to ${CREDITS} handbuilding credits`;

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] would create HB enrollment: ${CREDITS} credits, status active, order MANUAL/${LINE_ITEM_ID}`);
    console.log(`[DRY RUN] would close WT block ${wt.id}: "${closureReason}"`);
    return;
  }

  const { data: hb, error: hbErr } = await supabase
    .from('course_enrollments')
    .insert({
      student_id: STUDENT_ID,
      shopify_order_id: 'MANUAL',
      shopify_line_item_id: LINE_ITEM_ID,
      course_title: 'Handbuilding Beginner/Ext 4-8 Weeks',
      course_type: 'Handbuilding Beginner',
      number_of_weeks: CREDITS,
      class_credits_allocated: CREDITS,
      class_credits_used: 0,
      class_credits_remaining: CREDITS,
      status: 'active',
      enrollment_date: now,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (hbErr) throw hbErr;

  const hbCredits = await supabaseDb.getEnrollmentCredits(hb.id);
  console.log(`\nCreated HB enrollment ${hb.id} — ledger says ${hbCredits.remaining}/${hbCredits.allocated} credits bookable`);

  if (!wt.credits_closed_at) {
    const { error: closeErr } = await supabase
      .from('course_enrollments')
      .update({
        credits_closed_at: now,
        credits_closed_reason: `${closureReason} (HB enrollment ${hb.id})`,
        class_credits_remaining: 0,
        updated_at: now,
      })
      .eq('id', wt.id);
    if (closeErr) throw closeErr;
    console.log(`Closed WT credit block ${wt.id} — the 3 forfeited bookings stay on the record as missed`);
  } else {
    console.log(`WT credit block ${wt.id} was already closed — left alone`);
  }

  const bookable = await supabaseDb.getBookableCredits(STUDENT_ID);
  console.log(`\nBookable now: ${bookable.remaining} (reason: ${bookable.reason}, enrollment ${bookable.enrollment?.id})`);
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('\nFAILED:', e.message || e); process.exit(1); });
