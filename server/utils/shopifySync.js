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

module.exports = {
  syncCustomer,
  migratePotteryPieces,
  getOrSyncCustomer
};
