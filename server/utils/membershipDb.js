/**
 * Membership data access.
 *
 * Domain module extracted from the monolithic supabaseDb.js. Owns the
 * `memberships` table. supabaseDb.js re-exports these functions so existing
 * `require('./supabaseDb').<fn>` call sites keep working unchanged during the
 * incremental split.
 */

const { supabase } = require('./supabaseClient');

/**
 * Get active membership for a customer
 */
async function getActiveMembership(customerId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('*')
    .eq('customer_id', customerId)
    .eq('status', 'active')
    .gte('end_date', new Date().toISOString().split('T')[0])
    .order('end_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get all memberships for a customer
 */
async function getCustomerMemberships(customerId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Create membership
 */
async function createMembership(membershipData) {
  const { data, error } = await supabase
    .from('memberships')
    .insert([{
      customer_id: membershipData.customerId,
      membership_type: membershipData.membershipType,
      status: membershipData.status || 'active',
      start_date: membershipData.startDate ?? null,
      end_date: membershipData.endDate ?? null,
      purchase_date: membershipData.purchaseDate ?? null,
      shopify_subscription_id: membershipData.shopifySubscriptionId || null,
      perks: membershipData.perks || null
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get all memberships (admin)
 */
async function getAllMemberships() {
  const { data, error } = await supabase
    .from('memberships')
    .select(`
      *,
      customer:customers!memberships_customer_id_fkey (
        id,
        first_name,
        last_name,
        email
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Update membership
 */
async function updateMembership(membershipId, updates) {
  const dbUpdates = {};
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.membershipType !== undefined) dbUpdates.membership_type = updates.membershipType;
  if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
  if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
  if (updates.purchaseDate !== undefined) dbUpdates.purchase_date = updates.purchaseDate;
  if (updates.perks !== undefined) dbUpdates.perks = updates.perks;

  const { data, error } = await supabase
    .from('memberships')
    .update(dbUpdates)
    .eq('id', membershipId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete membership
 */
async function deleteMembership(membershipId) {
  const { error } = await supabase
    .from('memberships')
    .delete()
    .eq('id', membershipId);

  if (error) throw error;
  return { success: true };
}

/**
 * Cancel membership
 */
async function cancelMembership(membershipId) {
  return updateMembership(membershipId, { status: 'cancelled' });
}

/**
 * Check if customer has active membership
 */
async function hasActiveMembership(customerId) {
  const membership = await getActiveMembership(customerId);
  return !!membership;
}

module.exports = {
  getActiveMembership,
  getCustomerMemberships,
  createMembership,
  getAllMemberships,
  updateMembership,
  deleteMembership,
  cancelMembership,
  hasActiveMembership,
};
