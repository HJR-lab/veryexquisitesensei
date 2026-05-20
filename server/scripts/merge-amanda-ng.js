/**
 * merge-amanda-ng.js
 *
 * Merge duplicate Amanda Ng customer record. Final record lives under
 * amandang2703@gmail.com (Amanda's active Shopify account — her latest two
 * orders #2569 and #2594 came from it).
 *
 *   KEEP : id 2360  marchpoodle@gmail.com   (preserve — older record, 3 WT enrollments, 23 bookings)
 *   DUP  : id 2758  amandang2703@gmail.com  (merge in: WT 5327, HB 5352, 7 bookings)
 *
 * After data is moved, KEEP is re-targeted to Amanda's active Shopify account:
 *   email             → amandang2703@gmail.com (was marchpoodle@gmail.com)
 *   shopify_customer_id → 9271337156766       (was 9066395009182)
 *   email_locked      → true (sync must not revert)
 *   name_locked       → true (preserve "Amanda Ng")
 *
 * Caveat: the marchpoodle Shopify customer (9066395009182) is no longer linked
 * to any row in our DB. If Amanda ever places another order on THAT Shopify
 * account, syncCustomer's "no existing" branch will create a fresh customer
 * row (the duplicate recurs). Mitigate by merging her two Shopify customers
 * inside Shopify after this script runs.
 *
 * Steps (reassign-then-delete-then-rewrite, idempotent):
 *   1. Move course_enrollments rows DUP → KEEP
 *   2. Move bookings rows DUP → KEEP
 *   3. Move ancillary rows (reschedule_fees, instructor_notes,
 *      inbox_messages, verification_codes) DUP → KEEP
 *   4. Verify DUP has zero remaining dependents
 *   5. Delete DUP customer row (frees amandang2703@gmail.com + 9271337156766)
 *   6. Rewrite KEEP: email + shopify_customer_id + lock flags + course_purchase_count
 *
 * Usage:
 *   cd server && node scripts/merge-amanda-ng.js --dry-run
 *   cd server && node scripts/merge-amanda-ng.js
 */

require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');

const ID_KEEP = 2360;
const ID_DUP = 2758;
// Final identity for the consolidated record. Owner chose marchpoodle as the
// primary email (the longer-standing account in our DB). Note: Amanda's most
// recent orders (#2569, #2594) actually came from her amandang2703 Shopify
// customer (9271337156766) — that account is now orphaned, so any future
// order from it will recreate a duplicate DB row unless Amanda's two Shopify
// customers are also merged inside Shopify admin.
const NEW_EMAIL = 'marchpoodle@gmail.com';
const NEW_SHOPIFY_ID = '9066395009182';
// Duplicate WT2805 enrollment + its 6 overlapping bookings to soft-cancel
// after reassign. KEEP already has the same cohort enrollment (5326) with the
// SAME 6 class_instance bookings (29029-29034 on classes 14213-14218), so
// 5327 + 29035-29040 are pure duplicates from order #2569.
const DUPLICATE_ENROLLMENT_ID = 5327;
const DUPLICATE_BOOKING_IDS = [29035, 29036, 29037, 29038, 29039, 29040];
const DRY = process.argv.includes('--dry-run');

async function cnt(table, col, val) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(col, val);
  if (error) throw new Error(`count ${table}.${col}: ${error.message}`);
  return count;
}

async function reassign(table, col) {
  const before = await cnt(table, col, ID_DUP);
  if (before === 0) {
    console.log(`  ${table}.${col}: nothing to move`);
    return;
  }
  if (DRY) {
    console.log(`  ${table}.${col}: WOULD move ${before} row(s) ${ID_DUP} -> ${ID_KEEP}`);
    return;
  }
  const { error } = await supabase
    .from(table)
    .update({ [col]: ID_KEEP })
    .eq(col, ID_DUP);
  if (error) throw new Error(`reassign ${table}.${col}: ${error.message}`);
  const after = await cnt(table, col, ID_DUP);
  console.log(`  ${table}.${col}: moved ${before} row(s), ${after} remaining on DUP`);
}

(async () => {
  console.log(`\n=== Merge Amanda Ng  DUP ${ID_DUP} -> KEEP ${ID_KEEP}  (final email: ${NEW_EMAIL})  ${DRY ? '[DRY RUN]' : ''} ===\n`);

  const { data: keepRow } = await supabase.from('customers').select('id,email,first_name,last_name,course_purchase_count,shopify_customer_id').eq('id', ID_KEEP).maybeSingle();
  const { data: dupRow } = await supabase.from('customers').select('id,email,first_name,last_name,shopify_customer_id').eq('id', ID_DUP).maybeSingle();

  if (!keepRow) { console.error(`KEEP customer ${ID_KEEP} not found — aborting.`); process.exit(1); }
  if (!dupRow) {
    // Check KEEP already has the target email — if so, merge is complete.
    if (keepRow.email === NEW_EMAIL) {
      console.log(`DUP gone and KEEP already has email ${NEW_EMAIL} — merge already complete. Nothing to do.`);
      process.exit(0);
    }
    console.log(`DUP customer ${ID_DUP} gone but KEEP email is ${keepRow.email} — will only rewrite KEEP.`);
  } else {
    console.log(`KEEP: ${keepRow.first_name} ${keepRow.last_name} <${keepRow.email}> (shopify=${keepRow.shopify_customer_id}, purchase_count=${keepRow.course_purchase_count})`);
    console.log(`DUP : ${dupRow.first_name} ${dupRow.last_name} <${dupRow.email}> (shopify=${dupRow.shopify_customer_id})\n`);
  }

  if (dupRow) {
    console.log('1-3. Reassigning DUP-owned rows:');
    await reassign('course_enrollments', 'student_id');

    // bookings have a unique constraint on (student_id, class_instance_id).
    // The 6 duplicate bookings (29035-29040) are on the same class instances
    // KEEP already books (29029-29034), so they can't be reassigned. Delete
    // them outright — they're pure duplicates from cancelled-duplicate order
    // #2569. Then reassign the remaining (non-overlapping) DUP bookings.
    const dupBkBefore = await cnt('bookings', 'student_id', ID_DUP);
    if (dupBkBefore > 0) {
      if (DRY) {
        console.log(`  bookings: WOULD delete ${DUPLICATE_BOOKING_IDS.length} duplicate row(s) ${DUPLICATE_BOOKING_IDS.join(',')} then reassign the rest`);
      } else {
        const { data: deletedBk, error: delBkErr } = await supabase
          .from('bookings').delete().in('id', DUPLICATE_BOOKING_IDS)
          .eq('student_id', ID_DUP).select('id');
        if (delBkErr) throw new Error(`delete duplicate bookings: ${delBkErr.message}`);
        console.log(`  bookings: deleted ${deletedBk?.length || 0} duplicate row(s) (${DUPLICATE_BOOKING_IDS.join(',')})`);
      }
    }
    await reassign('bookings', 'student_id');

    await reassign('reschedule_fees', 'student_id');
    await reassign('instructor_notes', 'student_id');
    await reassign('inbox_messages', 'student_id');
    await reassign('verification_codes', 'customer_id');

    console.log('\n4. Verifying DUP has no remaining dependents:');
    const remaining = {
      course_enrollments: await cnt('course_enrollments', 'student_id', ID_DUP),
      bookings: await cnt('bookings', 'student_id', ID_DUP),
      reschedule_fees: await cnt('reschedule_fees', 'student_id', ID_DUP),
      instructor_notes: await cnt('instructor_notes', 'student_id', ID_DUP),
      inbox_messages: await cnt('inbox_messages', 'student_id', ID_DUP),
      verification_codes: await cnt('verification_codes', 'customer_id', ID_DUP),
    };
    console.log('  ', JSON.stringify(remaining));
    const totalRemaining = Object.values(remaining).reduce((a, b) => a + b, 0);

    if (DRY) {
      const { count: keepEnrAfter } = await supabase.from('course_enrollments').select('id',{count:'exact',head:true}).eq('student_id',ID_KEEP).neq('status','cancelled');
      const enrCount = keepEnrAfter + remaining.course_enrollments;
      console.log(`\n5. WOULD delete DUP customer ${ID_DUP}`);
      console.log(`6. WOULD rewrite KEEP: email -> ${NEW_EMAIL}, shopify_customer_id -> ${NEW_SHOPIFY_ID}, email_locked=true, name_locked=true, course_purchase_count -> ${enrCount}`);
      console.log('\n[DRY RUN] no changes written.');
      process.exit(0);
    }

    if (totalRemaining > 0) {
      console.error(`\n❌ DUP still has ${totalRemaining} dependent row(s) — NOT deleting customer ${ID_DUP}. Investigate above.`);
      process.exit(1);
    }

    console.log('\n4b. Cancelling duplicate WT2805 enrollment + overlapping bookings:');
    const { data: cancelledEnr, error: cancelEnrErr } = await supabase
      .from('course_enrollments').update({ status: 'cancelled' })
      .eq('id', DUPLICATE_ENROLLMENT_ID).select('id,status');
    if (cancelEnrErr) throw new Error(`cancel enrollment ${DUPLICATE_ENROLLMENT_ID}: ${cancelEnrErr.message}`);
    console.log(`   enrollment ${DUPLICATE_ENROLLMENT_ID} -> ${cancelledEnr?.[0]?.status || 'NOT FOUND'}`);
    const { data: cancelledBk, error: cancelBkErr } = await supabase
      .from('bookings').update({ status: 'cancelled' })
      .in('id', DUPLICATE_BOOKING_IDS).select('id');
    if (cancelBkErr) throw new Error(`cancel bookings: ${cancelBkErr.message}`);
    console.log(`   bookings cancelled: ${cancelledBk?.length || 0} of ${DUPLICATE_BOOKING_IDS.length} (${DUPLICATE_BOOKING_IDS.join(',')})`);

    console.log('\n5. Deleting DUP customer (frees email/shopify_id for KEEP):');
    const { error: delErr } = await supabase.from('customers').delete().eq('id', ID_DUP);
    if (delErr) throw new Error(`delete DUP: ${delErr.message}`);
    console.log(`   customer ${ID_DUP} (${dupRow.email}) deleted.`);
  }

  if (DRY) { console.log('\n[DRY RUN] no changes written.'); process.exit(0); }

  console.log('\n6. Rewriting KEEP record:');
  const { count: keepEnr } = await supabase.from('course_enrollments').select('id',{count:'exact',head:true}).eq('student_id',ID_KEEP).neq('status','cancelled');
  // Direct update (NOT updateCustomer) so we explicitly set the lock flags
  const { error: upErr } = await supabase
    .from('customers')
    .update({
      email: NEW_EMAIL,
      shopify_customer_id: NEW_SHOPIFY_ID,
      first_name: 'Amanda',
      last_name: 'Ng',
      email_locked: true,
      name_locked: true,
      course_purchase_count: keepEnr,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ID_KEEP);
  if (upErr) throw new Error(`rewrite KEEP: ${upErr.message}`);
  console.log(`   email -> ${NEW_EMAIL}`);
  console.log(`   shopify_customer_id -> ${NEW_SHOPIFY_ID}`);
  console.log(`   email_locked + name_locked -> true`);
  console.log(`   course_purchase_count -> ${keepEnr}`);

  console.log('\n=== DONE — final state of KEEP ===');
  const { data: finalKeep } = await supabase.from('customers').select('id,email,first_name,last_name,shopify_customer_id,course_purchase_count,email_locked,name_locked').eq('id', ID_KEEP).single();
  console.log(JSON.stringify(finalKeep, null, 2));
  const { data: enr } = await supabase.from('course_enrollments').select('id,course_identifier,course_type,course_title,course_start_date,status,shopify_order_id').eq('student_id', ID_KEEP).order('course_start_date',{nullsFirst:true});
  console.table(enr);
  console.log(`Total bookings on KEEP: ${await cnt('bookings', 'student_id', ID_KEEP)}`);

  process.exit(0);
})().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
