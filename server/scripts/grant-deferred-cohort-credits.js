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
 * Mirrors the production guards exactly: returning-student check, plus the same
 * (customer_id, source='course_purchase', reference_id=<enrollment id>) dedup key
 * — so this is idempotent and cannot double-grant.
 *
 * Sends NO email. The 'credits' category is paused (see PAUSED_EMAIL_CATEGORIES)
 * and a backfill should not surprise students months later; tell them by hand if
 * you want them told.
 *
 * Usage:
 *   cd server && node scripts/grant-deferred-cohort-credits.js --dry-run
 *   cd server && node scripts/grant-deferred-cohort-credits.js
 *   cd server && node scripts/grant-deferred-cohort-credits.js WT2908PM_DL6
 */
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');
const { isReturningStudent, earnCredits, getCreditBalance } = require('../utils/creditManager');

const DRY = process.argv.includes('--dry-run');
const COHORT = process.argv.find(a => !a.startsWith('-') && /^[A-Z]{2}\d/.test(a)) || 'WT2908PM_DL6';
const AMOUNT = 20;

(async () => {
  console.log(`${DRY ? '[DRY RUN] ' : ''}Cohort: ${COHORT}\n`);

  const { data: enrollments, error } = await supabase
    .from('course_enrollments')
    .select('id, student_id, course_title, course_type, status, customers!course_enrollments_student_id_fkey(first_name, last_name, email)')
    .eq('course_identifier', COHORT)
    .order('created_at');
  if (error) throw error;

  console.log(`${enrollments.length} enrollment(s) found.\n`);
  const toGrant = [];

  for (const e of enrollments) {
    const c = e.customers || {};
    const who = `${c.first_name} ${c.last_name}`.trim();

    const returning = await isReturningStudent(e.student_id);
    if (!returning) { console.log(`  skip  enr#${e.id} ${who} — first-time student`); continue; }

    const { data: existing } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('customer_id', e.student_id)
      .eq('source', 'course_purchase')
      .eq('reference_id', e.id.toString())
      .maybeSingle();
    if (existing) { console.log(`  skip  enr#${e.id} ${who} — already credited (txn #${existing.id})`); continue; }

    console.log(`  GRANT enr#${e.id} ${who} <${c.email}> — $${AMOUNT}`);
    toGrant.push({ e, who, email: c.email });
  }

  console.log(`\n${toGrant.length} credit(s) to grant.`);
  if (!toGrant.length) { console.log('Nothing to do.'); process.exit(0); }
  if (DRY) { console.log('\n[DRY RUN] No rows written.'); process.exit(0); }

  console.log('');
  for (const { e, who, email } of toGrant) {
    const txn = await earnCredits({
      customerId: e.student_id,
      amount: AMOUNT,
      source: 'course_purchase',
      referenceId: e.id.toString(),
      description: `Ves is 10 — $${AMOUNT} credit for ${e.course_title || e.course_type || 'course'}`,
    });
    const balance = await getCreditBalance(e.student_id);
    console.log(`  granted txn#${txn.id} → ${who} <${email}>  new balance $${balance}  (no email sent)`);
  }

  console.log('\nDone.');
  process.exit(0);
})().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
