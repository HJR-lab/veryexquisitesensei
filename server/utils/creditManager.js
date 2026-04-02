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
 */
async function spendCredits({ customerId, maxAmount, source, referenceId, description }) {
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
    .eq('customer_id', customerId)
    .in('status', ['active', 'upcoming', 'completed']);

  if (error) throw error;

  return (data || []).length > 1;
}

module.exports = {
  CREDIT_EXPIRY,
  getCreditBalance,
  getCreditHistory,
  earnCredits,
  spendCredits,
  isReturningStudent
};
