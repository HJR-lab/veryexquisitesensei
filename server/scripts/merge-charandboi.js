/**
 * merge-charandboi.js
 *
 * Merge duplicate customer "Charmaine Ng" into the charandboi@gmail.com record.
 *
 *   KEEP : id 2658  charandboi@gmail.com      (Sunday course WT1204AM_DL6, completed)
 *   DUP  : id 2803  kkenwongg1991@gmail.com   (Saturday course WT2305PM_DL6, upcoming)
 *
 * Steps (reassign-then-delete; data is moved before anything is removed):
 *   1. Move course_enrollments rows from DUP -> KEEP
 *   2. Move bookings rows from DUP -> KEEP
 *   3. Move any other DUP-owned rows (reschedule_fees, instructor_notes,
 *      inbox_messages) just in case
 *   4. Verify DUP has zero remaining dependents
 *   5. Bump KEEP.course_purchase_count to actual enrollment count
 *   6. Delete the DUP customer row
 *
 * Idempotent: re-running after a successful merge is a no-op (DUP gone).
 *
 * Usage:
 *   cd server && node scripts/merge-charandboi.js --dry-run
 *   cd server && node scripts/merge-charandboi.js
 */

require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');

const ID_KEEP = 2658;
const ID_DUP = 2803;
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
  console.log(`\n=== Merge Charmaine Ng  DUP ${ID_DUP} -> KEEP ${ID_KEEP} ${DRY ? '[DRY RUN]' : ''} ===\n`);

  const { data: keepRow } = await supabase.from('customers').select('id,email,first_name,last_name,course_purchase_count').eq('id', ID_KEEP).maybeSingle();
  const { data: dupRow } = await supabase.from('customers').select('id,email,first_name,last_name').eq('id', ID_DUP).maybeSingle();

  if (!keepRow) { console.error(`KEEP customer ${ID_KEEP} not found — aborting.`); process.exit(1); }
  if (!dupRow) { console.log(`DUP customer ${ID_DUP} already gone — merge already complete. Nothing to do.`); process.exit(0); }

  console.log(`KEEP: ${keepRow.first_name} ${keepRow.last_name} <${keepRow.email}> (purchase_count=${keepRow.course_purchase_count})`);
  console.log(`DUP : ${dupRow.first_name} ${dupRow.last_name} <${dupRow.email}>\n`);

  console.log('1-3. Reassigning DUP-owned rows:');
  await reassign('course_enrollments', 'student_id');
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
    const enrCount = await cnt('course_enrollments', 'student_id', ID_KEEP) + remaining.course_enrollments;
    console.log(`\n5. WOULD set KEEP.course_purchase_count -> ${enrCount}`);
    console.log(`6. WOULD delete DUP customer ${ID_DUP}`);
    console.log('\n[DRY RUN] no changes written.');
    process.exit(0);
  }

  if (totalRemaining > 0) {
    console.error(`\n❌ DUP still has ${totalRemaining} dependent row(s) — NOT deleting customer ${ID_DUP}. Investigate above.`);
    process.exit(1);
  }

  console.log('\n5. Updating KEEP.course_purchase_count:');
  const keepEnr = await cnt('course_enrollments', 'student_id', ID_KEEP);
  const { error: upErr } = await supabase
    .from('customers')
    .update({ course_purchase_count: keepEnr })
    .eq('id', ID_KEEP);
  if (upErr) throw new Error(`update KEEP: ${upErr.message}`);
  console.log(`   course_purchase_count -> ${keepEnr}`);

  console.log('\n6. Deleting DUP customer:');
  const { error: delErr } = await supabase.from('customers').delete().eq('id', ID_DUP);
  if (delErr) throw new Error(`delete DUP: ${delErr.message}`);
  console.log(`   customer ${ID_DUP} (${dupRow.email}) deleted.`);

  console.log('\n=== DONE — final state of KEEP ===');
  const { data: finalKeep } = await supabase.from('customers').select('id,email,first_name,last_name,course_purchase_count,login_count').eq('id', ID_KEEP).single();
  console.log(JSON.stringify(finalKeep, null, 2));
  const { data: enr } = await supabase.from('course_enrollments').select('id,course_identifier,course_start_date,status').eq('student_id', ID_KEEP).order('course_start_date');
  console.table(enr);
  console.log(`Total bookings on KEEP: ${await cnt('bookings', 'student_id', ID_KEEP)}`);

  process.exit(0);
})().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
