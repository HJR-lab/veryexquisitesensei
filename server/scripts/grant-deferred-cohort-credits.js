/**
 * grant-deferred-cohort-credits.js
 *
 * Grant the $20 "Ves is 10" VES Credit to returning students whose credit was
 * deferred and then never awarded.
 *
 * WHY THIS EXISTS
 *   On order sync (routes/shopify.js) a returning student's $20 is DEFERRED when
 *   the enrollment still needs a cohort threshold:  requiresThreshold && !thresholdMet.
 *   The deferred grant is then only issued by activateDraftClasses() in
 *   courseEnrollmentManager.js, on the draft -> active transition.
 *
 *   A returning student who joins a cohort whose classes are ALREADY active never
 *   sees that transition again, so the deferred credit is dropped on the floor.
 *   WT2908PM_DL6 lost three that way (Charmaine Ng, Mitchell Chan, Sarah Ong).
 *
 * Delegates every decision to awardCoursePurchaseCredit, the same helper the
 * order webhook and the batch sync call, so a backfill can never drift from
 * production policy: $20 per ORDER, and only for a student who already held a
 * course from an EARLIER order. That second rule matters most here — asked as
 * of today rather than as of the purchase, a backfill would wrongly credit a
 * first-ever course to anyone who has since bought again.
 *
 * Sends no email while the 'credits' category stays paused (see
 * PAUSED_EMAIL_CATEGORIES) — and it should stay paused for a backfill, which
 * has no business surprising students months later. Tell them by hand instead.
 *
 * Usage:
 *   cd server && node scripts/grant-deferred-cohort-credits.js --dry-run
 *   cd server && node scripts/grant-deferred-cohort-credits.js
 *   cd server && node scripts/grant-deferred-cohort-credits.js WT2908PM_DL6
 */
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');
const { awardCoursePurchaseCredit, getCreditBalance } = require('../utils/creditManager');

const DRY = process.argv.includes('--dry-run');
const COHORT = process.argv.find(a => !a.startsWith('-') && /^[A-Z]{2}\d/.test(a)) || 'WT2908PM_DL6';
const AMOUNT = 20;

(async () => {
  console.log(`${DRY ? '[DRY RUN] ' : ''}Cohort: ${COHORT}\n`);

  const { data: enrollments, error } = await supabase
    .from('course_enrollments')
    .select('id, student_id, shopify_order_id, course_title, course_type, status, customers!course_enrollments_student_id_fkey(first_name, last_name, email)')
    .eq('course_identifier', COHORT)
    .order('created_at');
  if (error) throw error;

  console.log(`${enrollments.length} enrollment(s) found.\n`);
  const toGrant = [];

  for (const e of enrollments) {
    const c = e.customers || {};
    const who = `${c.first_name} ${c.last_name}`.trim();

    const verdict = await awardCoursePurchaseCredit({
      customerId: e.student_id,
      enrollmentId: e.id,
      courseTitle: e.course_title || e.course_type,
      dryRun: true,
    });

    if (!verdict.granted) {
      console.log(`  skip  enr#${e.id} ${who} — ${verdict.reason}${verdict.transactionId ? ` (txn #${verdict.transactionId})` : ''}`);
      continue;
    }

    console.log(`  GRANT enr#${e.id} ${who} <${c.email}> — $${AMOUNT}`);
    toGrant.push({ e, who, email: c.email });
  }

  // The dry pass writes nothing, so every row of a multi-course order still
  // reads as grantable. Count orders, not rows, or the money looks 3x too big.
  const orders = new Set(toGrant.map(({ e }) =>
    `${e.student_id}|${/^\d+$/.test(String(e.shopify_order_id)) ? e.shopify_order_id : 'enr' + e.id}`
  ));
  console.log(`\n${orders.size} credit(s) to grant — $${orders.size * AMOUNT} across ${toGrant.length} enrollment row(s).`);
  if (!toGrant.length) { console.log('Nothing to do.'); process.exit(0); }
  if (DRY) { console.log('\n[DRY RUN] No rows written.'); process.exit(0); }

  console.log('');
  for (const { e, who, email } of toGrant) {
    // Re-checked for real here, not just in the pass above: an earlier grant in
    // this same run can settle a later row that shares its order.
    const res = await awardCoursePurchaseCredit({
      customerId: e.student_id,
      enrollmentId: e.id,
      courseTitle: e.course_title || e.course_type,
    });
    if (!res.granted) { console.log(`  skip  enr#${e.id} ${who} — ${res.reason}`); continue; }
    const balance = await getCreditBalance(e.student_id);
    console.log(`  granted txn#${res.transaction.id} → ${who} <${email}>  new balance $${balance}`);
  }

  console.log('\nDone.');
  process.exit(0);
})().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
