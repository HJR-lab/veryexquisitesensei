/**
 * Credit Manager Utility
 *
 * Handles credit balance, history, earning, and spending for studio credits.
 * Uses the credit_transactions table in Supabase.
 */

const { supabase } = require('./supabaseDb');

const CREDIT_EXPIRY = '2026-12-31T23:59:59Z';

/**
 * Get current credit balance for a customer.
 * Balance = sum of non-expired earn transactions - sum of spend transactions.
 */
async function getCreditBalance(customerId) {
  const now = new Date().toISOString();

  // Sum of non-expired earn transactions
  const { data: earnData, error: earnError } = await supabase
    .from('credit_transactions')
    .select('amount')
    .eq('customer_id', customerId)
    .eq('type', 'earn')
    .gt('expires_at', now);

  if (earnError) throw earnError;

  // Sum of all spend transactions
  const { data: spendData, error: spendError } = await supabase
    .from('credit_transactions')
    .select('amount')
    .eq('customer_id', customerId)
    .eq('type', 'spend');

  if (spendError) throw spendError;

  const earned = (earnData || []).reduce((sum, row) => sum + Number(row.amount), 0);
  const spent = (spendData || []).reduce((sum, row) => sum + Number(row.amount), 0);

  return earned - spent;
}

/**
 * Get full credit transaction history for a customer, ordered by created_at desc.
 */
async function getCreditHistory(customerId) {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data || [];
}

/**
 * Earn credits for a customer.
 * Inserts an earn transaction with the standard expiry date.
 */
async function earnCredits({ customerId, amount, source, referenceId, description }) {
  const { data, error } = await supabase
    .from('credit_transactions')
    .insert([{
      customer_id: customerId,
      type: 'earn',
      amount,
      source,
      reference_id: referenceId || null,
      description: description || null,
      expires_at: CREDIT_EXPIRY,
      created_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw error;

  return data;
}

/**
 * Spend credits for a customer.
 * Spends up to available balance (capped at maxAmount).
 * Returns { spent, transaction } where spent is the actual amount deducted.
 *
 * notify=false suppresses the credits-spent email. Use it when the caller sends
 * its own email that already accounts for the deduction — the delivery flow
 * says "the $10 came out of your studio credit" in the shipped email, and a
 * second generic credits email arriving alongside it is just noise.
 */
async function spendCredits({ customerId, maxAmount, source, referenceId, description, notify = true }) {
  const balance = await getCreditBalance(customerId);

  if (balance <= 0) {
    return { spent: 0, transaction: null };
  }

  const spent = Math.min(balance, maxAmount);

  const { data, error } = await supabase
    .from('credit_transactions')
    .insert([{
      customer_id: customerId,
      type: 'spend',
      amount: spent,
      source,
      reference_id: referenceId || null,
      description: description || null,
      expires_at: null,
      created_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw error;

  // Send credit spent email (non-blocking)
  if (!notify) return { spent, transaction: data };

  // credits-earned is gated on the pause list in both its call sites; this one
  // was not, so a paused 'credits' category still let spend receipts out. Same
  // category, same gate.
  const { isEmailCategoryPaused } = require('./emailService');
  if (isEmailCategoryPaused('credits')) {
    console.log(`[Credits] credits-spent email suppressed for customer ${customerId} — category paused`);
    return { spent, transaction: data };
  }

  try {
    const { sendEmail } = require('./emailService');
    const { generate: generateCreditSpent } = require('../email-templates/credits-spent');

    // Fetch customer email
    const { data: customer } = await supabase
      .from('customers')
      .select('email, first_name')
      .eq('id', customerId)
      .single();

    if (customer?.email) {
      const newBalance = await getCreditBalance(customerId);
      const { subject, html } = generateCreditSpent({
        firstName: customer.first_name,
        amountSpent: spent,
        appliedTo: description,
        remainingBalance: newBalance,
      });
      sendEmail({ to: customer.email, subject, html }).catch(err =>
        console.error('[Credits] Failed to send credit spent email:', err)
      );
    }
  } catch (emailErr) {
    console.error('[Credits] Failed to send credit spent email:', emailErr);
  }

  return { spent, transaction: data };
}

/**
 * Check if a customer is a returning student.
 * Returns true if customer has more than 1 enrollment (active/upcoming/completed).
 */
async function isReturningStudent(customerId) {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('id')
    .eq('student_id', customerId)
    .in('status', ['active', 'upcoming', 'completed']);

  if (error) throw error;

  return (data || []).length > 1;
}

const COURSE_PURCHASE_CREDIT = 20;

/**
 * Award the $20 "Ves is 10" credit for one course purchase.
 *
 * Called the moment an enrollment is created — by the order webhook, by the
 * batch order sync, and once more on cohort activation as a backstop. It used
 * to be deferred until a cohort's draft classes went active, which quietly
 * dropped the credit for anyone joining a cohort that was already active.
 * Granting at order time removes that window; the (customer, source,
 * reference_id) check below keeps the repeat calls idempotent.
 *
 * $20 per order — a multi-course package is one enrollment row and earns once.
 * Returning students only, matching the Credits page copy.
 */
async function awardCoursePurchaseCredit({ customerId, enrollmentId, courseTitle }) {
  if (!customerId || !enrollmentId) return { granted: false, reason: 'missing_ids' };

  const returning = await isReturningStudent(customerId);
  if (!returning) return { granted: false, reason: 'first_time_student' };

  const { data: existing } = await supabase
    .from('credit_transactions')
    .select('id')
    .eq('customer_id', customerId)
    .eq('source', 'course_purchase')
    .eq('reference_id', enrollmentId.toString())
    .maybeSingle();
  if (existing) return { granted: false, reason: 'already_credited', transactionId: existing.id };

  const transaction = await earnCredits({
    customerId,
    amount: COURSE_PURCHASE_CREDIT,
    source: 'course_purchase',
    referenceId: enrollmentId.toString(),
    description: `Ves is 10 — $${COURSE_PURCHASE_CREDIT} credit for ${courseTitle || 'course'}`,
  });
  console.log(`[Credits] Awarded $${COURSE_PURCHASE_CREDIT} to customer ${customerId} for enrollment ${enrollmentId}`);

  // Email is best-effort and never blocks the grant.
  try {
    const { isEmailCategoryPaused, sendEmail } = require('./emailService');
    if (isEmailCategoryPaused('credits')) {
      console.log('[Credits] Email paused — skipping credit earned email');
      return { granted: true, transaction };
    }
    const { data: student } = await supabase
      .from('customers')
      .select('email, first_name')
      .eq('id', customerId)
      .single();
    if (student?.email) {
      const { generate: generateCreditEarned } = require('../email-templates/credits-earned');
      const newBalance = await getCreditBalance(customerId);
      const { subject, html } = generateCreditEarned({
        firstName: student.first_name,
        amountEarned: COURSE_PURCHASE_CREDIT,
        courseName: courseTitle || 'your course',
        newBalance,
      });
      await sendEmail({ to: student.email, subject, html });
    }
  } catch (emailErr) {
    console.error('[Credits] Failed to send credit earned email:', emailErr);
  }

  return { granted: true, transaction };
}

module.exports = {
  CREDIT_EXPIRY,
  getCreditBalance,
  getCreditHistory,
  earnCredits,
  spendCredits,
  isReturningStudent,
  awardCoursePurchaseCredit,
  COURSE_PURCHASE_CREDIT
};
