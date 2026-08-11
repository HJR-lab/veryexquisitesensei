/**
 * Customer data access.
 *
 * Domain module extracted from the monolithic supabaseDb.js. Owns the
 * `customers` table, Shopify customer sync, and customer_type derivation.
 * supabaseDb.js re-exports these functions so existing
 * `require('./supabaseDb').<fn>` call sites keep working unchanged during the
 * incremental split.
 */

const { supabase } = require('./supabaseClient');

/**
 * Find customer by Shopify ID
 */
async function findCustomerByShopifyId(shopifyCustomerId) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('shopify_customer_id', shopifyCustomerId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
    throw error;
  }

  return data;
}

/**
 * Find customer by email
 */
async function findCustomerByEmail(email) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('email', email)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data;
}

/**
 * Create (or return existing) a duplicate customer record for an extra "pax" spot
 * on a multi-quantity course order. Each extra spot needs its own account/portfolio.
 *
 * IMPORTANT: customers.shopify_customer_id is NOT NULL, so a synthetic unique id is
 * derived from the primary customer's shopify id (e.g. "<baseId>-2"). Historically this
 * insert omitted shopify_customer_id and silently failed (supabase-js returns the error
 * on the result object rather than throwing), so extra spots were never enrolled. This
 * helper surfaces any failure instead of swallowing it.
 *
 * @param {Object} p
 * @param {string} p.baseEmail  - primary buyer's email (to derive the synthetic shopify id)
 * @param {string} p.paxEmail   - the extra pax's email (e.g. buyer+dup@…)
 * @param {string} p.firstName
 * @param {string} p.lastName
 * @param {number} p.paxIndex   - 0-based pax index (>=1 for extras)
 * @returns {Promise<Object>} the customer row (existing or newly created)
 */
async function createDuplicatePaxCustomer({ baseEmail, paxEmail, firstName, lastName, paxIndex }) {
  const existing = await findCustomerByEmail(paxEmail);
  if (existing) return existing;

  const primary = baseEmail ? await findCustomerByEmail(baseEmail) : null;
  const baseShopifyId = primary && primary.shopify_customer_id;
  const dupShopifyId = baseShopifyId
    ? `${baseShopifyId}-${paxIndex + 1}`
    : `dup-${paxEmail}`; // fallback for manually-created primaries lacking a shopify id

  const { data, error } = await supabase
    .from('customers')
    .insert({
      email: paxEmail,
      shopify_customer_id: dupShopifyId,
      customer_type: 'student',
      first_name: firstName || '',
      last_name: lastName || '',
      classes_allocated: 0, // extra pax start at 0 so additive allocation is correct (the column default is now 0 too)
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    // Unique violation → created concurrently; return whatever exists now
    if (error.code === '23505') return await findCustomerByEmail(paxEmail);
    throw new Error(`Failed to create duplicate pax customer ${paxEmail}: ${error.message}`);
  }
  return data;
}

/**
 * Create customer
 */
async function createCustomer(customerData) {
  const { data, error } = await supabase
    .from('customers')
    .insert([{
      shopify_customer_id: customerData.shopifyCustomerId,
      email: customerData.email,
      first_name: customerData.firstName,
      last_name: customerData.lastName,
      customer_type: customerData.customerType || 'student',
      // 0, not 6. This used to default to six bookable classes for every
      // customer record ever created — including staff — and booking
      // eligibility reads this counter BEFORE the enrollment ledger, so it was
      // a real entitlement rather than a placeholder. 994 accounts were holding
      // one they never bought (audit 11/08/26). Allocation now comes from an
      // actual purchase, via courseEnrollmentManager.
      classes_allocated: customerData.classesAllocated || 0,
      classes_used: customerData.classesUsed || 0,
      classes_forfeited: customerData.classesForfeited || 0,
      course_purchase_date: customerData.coursePurchaseDate || null,
      course_expiry_date: customerData.courseExpiryDate || null,
      course_purchase_count: customerData.coursePurchaseCount || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Update customer
 */
async function updateCustomer(id, updates) {
  const { data, error } = await supabase
    .from('customers')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Sync customer from Shopify (create or update)
 */
async function syncCustomer(shopifyCustomer, shopifyCustomerId, classStartDate = null, classEndDate = null, coursePurchaseCount = 0) {
  try {
    // Check if customer exists
    let existingCustomer = await findCustomerByShopifyId(shopifyCustomerId);

    // Format dates for database
    const purchaseDate = classStartDate ? classStartDate.toISOString().split('T')[0] : null;
    const expiryDate = classEndDate ? classEndDate.toISOString().split('T')[0] : null;

    if (existingCustomer) {
      // Update existing customer — preserve manual edits.
      // *_locked: permanent flag set when admin manually edits the field — survives every sync.
      // Fallback: detect a recent manual edit via updated_at > last_synced_at. This is only
      // one-time protection (the next sync rewrites last_synced_at), which is exactly why the
      // permanent *_locked flags exist.
      const nameLocked = existingCustomer.name_locked === true;
      const emailLocked = existingCustomer.email_locked === true;
      const recentlyEdited = existingCustomer.updated_at && existingCustomer.last_synced_at &&
        new Date(existingCustomer.updated_at) > new Date(existingCustomer.last_synced_at);

      const updates = {
        last_synced_at: new Date().toISOString()
      };

      if (!emailLocked && !recentlyEdited && shopifyCustomer.email) {
        // Email not locked or recently edited — safe to take Shopify's value
        updates.email = shopifyCustomer.email;
      }
      // else: email is locked or manually edited — preserve admin's value

      if (!nameLocked && !recentlyEdited) {
        // Name not locked or recently edited — safe to overwrite from Shopify
        updates.first_name = shopifyCustomer.firstName;
        updates.last_name = shopifyCustomer.lastName;
      }
      // else: name is locked or manually edited — preserve admin's value

      // Update course dates if we have them
      if (purchaseDate) {
        updates.course_purchase_date = purchaseDate;
      }
      if (expiryDate) {
        updates.course_expiry_date = expiryDate;
      }
      // Update course purchase count — use max of Shopify count and actual non-cancelled enrollment rows
      if (coursePurchaseCount > 0) {
        // Count actual enrollments to include manual ones (exclude cancelled)
        const { data: enrollments } = await supabase
          .from('course_enrollments')
          .select('id')
          .eq('student_id', existingCustomer.id)
          .neq('status', 'cancelled');
        const enrollmentCount = (enrollments || []).length;
        updates.course_purchase_count = Math.max(coursePurchaseCount, enrollmentCount);
      }

      // Use direct update (NOT updateCustomer) to avoid bumping updated_at
      // This preserves the manual edit detection for next sync
      const { data: updated, error: updateErr } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', existingCustomer.id)
        .select()
        .single();
      if (updateErr) throw updateErr;
      return updated;
    } else {
      // Create new customer
      const created = await createCustomer({
        shopifyCustomerId: shopifyCustomerId,
        email: shopifyCustomer.email,
        firstName: shopifyCustomer.firstName,
        lastName: shopifyCustomer.lastName,
        customerType: 'student',
        coursePurchaseDate: purchaseDate,
        courseExpiryDate: expiryDate,
        coursePurchaseCount: coursePurchaseCount
      });
      return created;
    }
  } catch (error) {
    console.error('Error syncing customer:', error);
    throw error;
  }
}

/**
 * Get all customers
 */
async function getAllCustomers() {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('first_name', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Increment customer's forfeited classes count
 */
async function incrementClassesForfeited(customerId) {
  const { data: customer } = await supabase
    .from('customers')
    .select('classes_forfeited')
    .eq('id', customerId)
    .single();

  const { data, error } = await supabase
    .from('customers')
    .update({ classes_forfeited: (customer?.classes_forfeited || 0) + 1 })
    .eq('id', customerId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Give back one forfeited class on appeal.
 *
 * Floors at 0 on purpose: this counter predates the bookings ledger and already
 * runs ahead of it on live data (29 forfeited bookings against a counter total
 * several times that), so it must never be driven negative by a reversal of a
 * forfeit it never counted.
 */
async function decrementClassesForfeited(customerId) {
  const { data: customer } = await supabase
    .from('customers')
    .select('classes_forfeited')
    .eq('id', customerId)
    .single();

  const { data, error } = await supabase
    .from('customers')
    .update({ classes_forfeited: Math.max(0, (customer?.classes_forfeited || 0) - 1) })
    .eq('id', customerId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get customer by ID
 */
async function getCustomerById(customerId) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Sync customer_type based on active memberships and enrollments
 * Sets: 'member' (membership only), 'student & member' (both), 'student' (no membership)
 */
async function syncCustomerTypeFromMemberships() {
  const today = new Date().toISOString().split('T')[0];
  let updated = 0;

  // Members = anyone with a live membership. That includes:
  //   • active memberships not yet expired (status=active, end_date >= today), and
  //   • pending memberships — purchased but not yet started (term begins on first
  //     studio visit, so they have no end_date yet but are still paying members).
  const { data: activeMemberships, error: memErr } = await supabase
    .from('memberships')
    .select('customer_id')
    .or(`status.eq.pending,and(status.eq.active,end_date.gte.${today})`);

  if (memErr) {
    console.error('Error fetching active memberships:', memErr);
    return 0;
  }

  const memberCustomerIds = [...new Set((activeMemberships || []).map(m => m.customer_id))];

  if (memberCustomerIds.length > 0) {
    // Check which members also have active course enrollments
    const { data: activeEnrollments } = await supabase
      .from('course_enrollments')
      .select('student_id')
      .in('student_id', memberCustomerIds)
      .in('status', ['active', 'pending']);

    const enrolledIds = new Set((activeEnrollments || []).map(e => e.student_id));

    for (const customerId of memberCustomerIds) {
      const newType = enrolledIds.has(customerId) ? 'student & member' : 'member';
      // Use direct update to avoid bumping updated_at
      const { error: upErr } = await supabase
        .from('customers')
        .update({ customer_type: newType })
        .eq('id', customerId)
        .neq('customer_type', newType);
      if (!upErr) updated++;
    }
  }

  // Reset expired members back to 'student' (those with member/student & member but no active membership)
  const { data: memberCustomers } = await supabase
    .from('customers')
    .select('id')
    .in('customer_type', ['member', 'student & member']);

  if (memberCustomers && memberCustomers.length > 0) {
    const expiredIds = (memberCustomers || [])
      .filter(c => !memberCustomerIds.includes(c.id))
      .map(c => c.id);

    if (expiredIds.length > 0) {
      const { error: resetErr } = await supabase
        .from('customers')
        .update({ customer_type: 'student' })
        .in('id', expiredIds);
      if (!resetErr) updated += expiredIds.length;
    }
  }

  console.log(`🏷️  Customer type sync: ${memberCustomerIds.length} active members, ${updated} customers updated`);
  return updated;
}

/**
 * Update customer_type for a single customer after membership CRUD
 */
async function updateSingleCustomerType(customerId) {
  const today = new Date().toISOString().split('T')[0];

  // A live membership = active-and-unexpired OR pending (reserved: purchased but
  // not yet started — term begins on first studio visit). Both make them a member.
  const { data: activeMembership } = await supabase
    .from('memberships')
    .select('id')
    .eq('customer_id', customerId)
    .or(`status.eq.pending,and(status.eq.active,end_date.gte.${today})`)
    .limit(1)
    .maybeSingle();

  if (activeMembership) {
    // Has active membership — check enrollments
    const { data: activeEnrollment } = await supabase
      .from('course_enrollments')
      .select('id')
      .eq('student_id', customerId)
      .in('status', ['active', 'pending'])
      .limit(1)
      .maybeSingle();

    const newType = activeEnrollment ? 'student & member' : 'member';
    await supabase
      .from('customers')
      .update({ customer_type: newType })
      .eq('id', customerId);
  } else {
    // No active membership — reset to student
    await supabase
      .from('customers')
      .update({ customer_type: 'student' })
      .eq('id', customerId)
      .in('customer_type', ['member', 'student & member']);
  }
}

module.exports = {
  findCustomerByShopifyId,
  findCustomerByEmail,
  createDuplicatePaxCustomer,
  createCustomer,
  updateCustomer,
  syncCustomer,
  getAllCustomers,
  getCustomerById,
  incrementClassesForfeited,
  decrementClassesForfeited,
  syncCustomerTypeFromMemberships,
  updateSingleCustomerType,
};
