/**
 * retroactive-credit-grant.js
 *
 * One-time script to grant retroactive VES Credits to existing students.
 *
 * Eligibility:
 *   - customer.course_purchase_count >= 2
 *   - Has at least one enrollment with status IN ('active', 'upcoming')
 *
 * Grant amount: (course_purchase_count - 1) × $20
 *
 * Idempotent: skips customers who already have a credit_transaction with
 * source='admin_adjustment' and description ILIKE '%Retroactive%'
 *
 * Usage:
 *   cd server && node scripts/retroactive-credit-grant.js [--dry-run]
 */

require('dotenv').config();

const { supabase } = require('../utils/supabaseDb');
const { earnCredits, getCreditBalance } = require('../utils/creditManager');
const { sendEmail } = require('../utils/emailService');
const { generate: generateRetroEmail } = require('../email-templates/credits-retroactive');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`\n=== Retroactive Credit Grant${DRY_RUN ? ' [DRY RUN]' : ''} ===\n`);

  // Step 1: Fetch all customers with course_purchase_count >= 2
  const { data: customers, error: custError } = await supabase
    .from('customers')
    .select('id, email, first_name, last_name, course_purchase_count')
    .gte('course_purchase_count', 2)
    .order('id', { ascending: true });

  if (custError) {
    console.error('Failed to fetch customers:', custError);
    process.exit(1);
  }

  console.log(`Found ${customers.length} customers with course_purchase_count >= 2`);

  let eligible = 0;
  let skippedNoActiveEnrollment = 0;
  let skippedAlreadyGranted = 0;
  let granted = 0;
  let errors = 0;

  for (const customer of customers) {
    const { id: customerId, email, first_name, course_purchase_count } = customer;
    const firstName = first_name || email;

    // Step 2: Check for active or upcoming enrollment
    const { data: enrollments, error: enrollError } = await supabase
      .from('course_enrollments')
      .select('id')
      .eq('student_id', customerId)
      .in('status', ['active', 'upcoming'])
      .limit(1);

    if (enrollError) {
      console.error(`  [${customerId}] Error checking enrollments:`, enrollError.message);
      errors++;
      continue;
    }

    if (!enrollments || enrollments.length === 0) {
      console.log(`  [${customerId}] ${email} — skipped (no active/upcoming enrollment)`);
      skippedNoActiveEnrollment++;
      continue;
    }

    // Step 3: Idempotency — check for existing retroactive grant
    const { data: existingGrant, error: txError } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('customer_id', customerId)
      .eq('source', 'admin_adjustment')
      .ilike('description', '%Retroactive%')
      .limit(1);

    if (txError) {
      console.error(`  [${customerId}] Error checking existing grants:`, txError.message);
      errors++;
      continue;
    }

    if (existingGrant && existingGrant.length > 0) {
      console.log(`  [${customerId}] ${email} — skipped (retroactive grant already exists)`);
      skippedAlreadyGranted++;
      continue;
    }

    // Step 4: Compute grant amount
    const pastCourses = course_purchase_count - 1;
    const amount = pastCourses * 20;
    const description = `Retroactive VES Credit grant — ${pastCourses} past course${pastCourses !== 1 ? 's' : ''} × $20`;

    eligible++;

    if (DRY_RUN) {
      console.log(`  [DRY RUN] ${email} — would grant $${amount} (${pastCourses} past courses)`);
      continue;
    }

    // Step 5: Grant credits
    try {
      await earnCredits({
        customerId,
        amount,
        source: 'admin_adjustment',
        description,
      });

      const balance = await getCreditBalance(customerId);

      console.log(`  [${customerId}] ${email} — granted $${amount} (balance now $${balance})`);
      granted++;

      // Step 6: Send retroactive email
      try {
        const { subject, html } = generateRetroEmail({
          firstName,
          totalCredits: amount,
          courseCount: pastCourses,
          balance,
        });

        await sendEmail({ to: email, subject, html });
      } catch (emailErr) {
        console.warn(`  [${customerId}] Email failed (credits still granted):`, emailErr.message);
      }
    } catch (grantErr) {
      console.error(`  [${customerId}] Failed to grant credits:`, grantErr.message);
      errors++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`  Customers checked:              ${customers.length}`);
  console.log(`  Eligible (active/upcoming):     ${eligible}`);
  console.log(`  Skipped (no active enrollment): ${skippedNoActiveEnrollment}`);
  console.log(`  Skipped (already granted):      ${skippedAlreadyGranted}`);
  if (!DRY_RUN) {
    console.log(`  Grants issued:                  ${granted}`);
    console.log(`  Errors:                         ${errors}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
