const supabaseDb = require('./supabaseDb');

/**
 * Sync customer from Shopify to PostgreSQL
 * Creates or updates customer record in database
 * NOW USING SUPABASE ADAPTER TO BYPASS PRISMA CONNECTION ISSUES
 */
async function syncCustomer(shopifyCustomer, shopifyCustomerId) {
  try {
    console.log(`🔄 Syncing customer ${shopifyCustomerId} via Supabase adapter...`);
    const customer = await supabaseDb.syncCustomer(shopifyCustomer, shopifyCustomerId);
    console.log(`✅ Customer synced successfully (DB ID: ${customer.id})`);
    return customer;
  } catch (error) {
    console.error('Error syncing customer via Supabase:', error);
    throw error;
  }
}

/**
 * Migrate pottery pieces from Shopify metafield to PostgreSQL
 * One-time migration for existing data
 */
async function migratePotteryPieces(customerId, shopifyPieces) {
  try {
    if (!shopifyPieces || shopifyPieces.length === 0) {
      return [];
    }

    const migratedPieces = [];

    // Get existing pieces for this customer
    const existingPieces = await supabaseDb.getPotteryPiecesByCustomerId(customerId);

    for (const piece of shopifyPieces) {
      // Check if piece already exists (by title and date - simple deduplication)
      const existing = existingPieces.find(p =>
        p.title === piece.title &&
        new Date(p.date_completed).toDateString() === new Date(piece.date_completed).toDateString()
      );

      if (!existing) {
        const newPiece = await supabaseDb.createPotteryPiece({
          customerId: customerId,
          title: piece.title,
          dateCompleted: new Date(piece.date_completed),
          notes: piece.description || piece.student_notes || piece.instructor_notes || null,
          clayType: piece.clay_type || 'Other',
          glazes: piece.glaze ? [piece.glaze] : [],
          originalWeight: piece.original_weight ? parseFloat(piece.original_weight) : null,
          finalWeight: piece.final_weight ? parseFloat(piece.final_weight) : null,
          height: piece.height ? parseFloat(piece.height) : null,
          length: piece.length ? parseFloat(piece.length) : null,
          width: piece.width ? parseFloat(piece.width) : null,
          images: piece.images || [],
          tags: piece.tags || [],
          isPublic: piece.is_public || false,
          featured: piece.featured || false
        });
        migratedPieces.push(newPiece);
      }
    }

    console.log(`✅ Migrated ${migratedPieces.length} pottery pieces for customer ${customerId}`);
    return migratedPieces;
  } catch (error) {
    console.error('Error migrating pottery pieces:', error);
    throw error;
  }
}

/**
 * Get or sync customer by Shopify ID
 * Returns PostgreSQL customer record
 */
async function getOrSyncCustomer(shopifyCustomerId, shopifyCustomerData) {
  try {
    // Try to find existing customer
    let customer = await supabaseDb.findCustomerByShopifyId(shopifyCustomerId);

    // If not found, create from Shopify data
    if (!customer && shopifyCustomerData) {
      customer = await syncCustomer(shopifyCustomerData, shopifyCustomerId);
    }

    return customer;
  } catch (error) {
    console.error('Error getting/syncing customer:', error);
    throw error;
  }
}

/**
 * Poll Shopify for customers created in the last N hours and sync any
 * that are missing from the local database.
 *
 * Safety net for webhook delivery gaps — Shopify does not fire webhooks
 * for changes initiated by the same app's access token, and occasional
 * delivery failures can happen. This catches any customers the webhook
 * flow missed.
 */
async function syncRecentShopifyCustomers(hoursAgo = 2) {
  try {
    const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    if (!shopDomain || !accessToken) {
      console.warn('[poll] Shopify env vars not configured, skipping');
      return { synced: 0, skipped: 0, checked: 0 };
    }

    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
    const url = `https://${shopDomain}/admin/api/2025-10/customers.json?created_at_min=${encodeURIComponent(since)}&limit=250`;

    const response = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });

    if (!response.ok) {
      console.error(`[poll] Shopify customers fetch failed: ${response.status}`);
      return { synced: 0, skipped: 0, checked: 0, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const customers = data.customers || [];

    let synced = 0;
    let skipped = 0;

    for (const c of customers) {
      if (!c.email || !c.id) {
        skipped++;
        continue;
      }

      // Only sync customers who have actually purchased something — matches
      // the existing admin sync filter and avoids importing disabled/spam
      // accounts that never bought a course.
      if (!c.orders_count || c.orders_count < 1) {
        skipped++;
        continue;
      }

      const existing = await supabaseDb.findCustomerByShopifyId(c.id.toString());
      if (existing) {
        skipped++;
        continue;
      }

      await supabaseDb.syncCustomer(
        {
          id: `gid://shopify/Customer/${c.id}`,
          email: c.email,
          firstName: c.first_name || '',
          lastName: c.last_name || ''
        },
        c.id.toString()
      );
      synced++;
      console.log(`[poll] ✅ Backfilled missing customer: ${c.email}`);
    }

    if (synced > 0) {
      console.log(`[poll] Synced ${synced} missing customer(s) from last ${hoursAgo}h (checked ${customers.length})`);
    }
    return { synced, skipped, checked: customers.length };
  } catch (err) {
    console.error('[poll] Error in syncRecentShopifyCustomers:', err);
    return { synced: 0, skipped: 0, checked: 0, error: err.message };
  }
}

/**
 * Start the recurring customer poll. Runs once immediately with a wider
 * window (24h) to catch anything missed during downtime, then every
 * intervalMinutes with a 2h window.
 */
function startCustomerPolling(intervalMinutes = 15) {
  // Initial wider sweep on startup
  syncRecentShopifyCustomers(24).catch(err =>
    console.error('[poll] Initial sweep failed:', err)
  );

  // Recurring poll
  setInterval(() => {
    syncRecentShopifyCustomers(2).catch(err =>
      console.error('[poll] Recurring sweep failed:', err)
    );
  }, intervalMinutes * 60 * 1000);

  console.log(`[poll] Customer polling started (every ${intervalMinutes}m)`);
}

module.exports = {
  syncCustomer,
  migratePotteryPieces,
  getOrSyncCustomer,
  syncRecentShopifyCustomers,
  startCustomerPolling
};
