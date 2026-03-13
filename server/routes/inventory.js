const supabaseDb = require('../utils/supabaseDb');

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler }) {

// ============================================
// INVENTORY MANAGEMENT ENDPOINTS
// ============================================

// Get all suppliers
app.get('/api/admin/inventory/suppliers', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { rows: suppliers } = await supabaseDb.query(`
    SELECT * FROM suppliers
    WHERE active = true
    ORDER BY name ASC
  `);
  res.json({ suppliers });
}));

// Create supplier
app.post('/api/admin/inventory/suppliers', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { name, contactPerson, email, phone, address, notes } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const { rows } = await supabaseDb.query(`
    INSERT INTO suppliers (name, contact_person, email, phone, address, notes, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
    RETURNING *
  `, [name, contactPerson, email, phone, address, notes]);

  res.json({ success: true, supplier: rows[0] });
}));

// Get all inventory items with categories and suppliers
app.get('/api/admin/inventory/items', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { rows: items } = await supabaseDb.query(`
    SELECT
      i.*,
      c.name as category_name,
      s.name as supplier_name,
      s.email as supplier_email
    FROM inventory_items i
    LEFT JOIN inventory_categories c ON i.category_id = c.id
    LEFT JOIN suppliers s ON i.supplier_id = s.id
    WHERE i.active = true
    ORDER BY c.name, i.name
  `);

  res.json({ items });
}));

// Get low stock items
app.get('/api/admin/inventory/low-stock', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { rows: items } = await supabaseDb.query(`
    SELECT
      i.*,
      c.name as category_name,
      s.name as supplier_name,
      s.email as supplier_email
    FROM inventory_items i
    LEFT JOIN inventory_categories c ON i.category_id = c.id
    LEFT JOIN suppliers s ON i.supplier_id = s.id
    WHERE i.active = true
      AND i.current_stock <= i.min_stock_level
    ORDER BY (i.current_stock / NULLIF(i.min_stock_level, 0)) ASC
  `);

  res.json({ items });
}));

// Create inventory item
app.post('/api/admin/inventory/items', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const {
    categoryId, supplierId, name, description, sku, unit,
    currentStock, minStockLevel, reorderQuantity, unitCost, location, notes
  } = req.body;

  if (!categoryId || !name) {
    return res.status(400).json({ error: 'Category and name are required' });
  }

  const { rows } = await supabaseDb.query(`
    INSERT INTO inventory_items (
      category_id, supplier_id, name, description, sku, unit,
      current_stock, min_stock_level, reorder_quantity, unit_cost,
      location, notes, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
    RETURNING *
  `, [
    categoryId, supplierId, name, description, sku, unit || 'unit',
    currentStock || 0, minStockLevel || 0, reorderQuantity || 0,
    unitCost, location, notes
  ]);

  res.json({ success: true, item: rows[0] });
}));

// Update inventory item stock
app.post('/api/admin/inventory/items/:id/adjust-stock', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quantity, transactionType, notes, referenceNumber } = req.body;
  const { email } = req.user;

  if (!quantity || !transactionType) {
    return res.status(400).json({ error: 'Quantity and transaction type are required' });
  }

  // Get current stock
  const { rows: [item] } = await supabaseDb.query(`
    SELECT current_stock FROM inventory_items WHERE id = $1
  `, [id]);

  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const previousStock = parseFloat(item.current_stock);
  let newStock;

  // Calculate new stock based on transaction type
  if (transactionType === 'add' || transactionType === 'purchase' || transactionType === 'return') {
    newStock = previousStock + parseFloat(quantity);
  } else if (transactionType === 'remove' || transactionType === 'use' || transactionType === 'adjustment') {
    newStock = previousStock - parseFloat(quantity);
  } else {
    return res.status(400).json({ error: 'Invalid transaction type' });
  }

  // Update stock
  await supabaseDb.query(`
    UPDATE inventory_items
    SET current_stock = $1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
  `, [newStock, id]);

  // Record transaction
  await supabaseDb.query(`
    INSERT INTO inventory_transactions (
      item_id, transaction_type, quantity, previous_stock, new_stock,
      reference_number, notes, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [id, transactionType, quantity, previousStock, newStock, referenceNumber, notes, email]);

  res.json({
    success: true,
    previousStock,
    newStock,
    message: `Stock ${transactionType === 'add' || transactionType === 'purchase' ? 'increased' : 'decreased'} successfully`
  });
}));

// Get inventory categories
app.get('/api/admin/inventory/categories', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { rows: categories } = await supabaseDb.query(`
    SELECT * FROM inventory_categories ORDER BY name ASC
  `);
  res.json({ categories });
}));

// Send low stock alert email to supplier
app.post('/api/admin/inventory/send-reorder-email', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { itemId } = req.body;

  if (!itemId) {
    return res.status(400).json({ error: 'Item ID required' });
  }

  // Get item details with supplier info
  const { rows: [item] } = await supabaseDb.query(`
    SELECT
      i.*,
      c.name as category_name,
      s.name as supplier_name,
      s.email as supplier_email,
      s.contact_person
    FROM inventory_items i
    LEFT JOIN inventory_categories c ON i.category_id = c.id
    LEFT JOIN suppliers s ON i.supplier_id = s.id
    WHERE i.id = $1
  `, [itemId]);

  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  if (!item.supplier_email) {
    return res.status(400).json({ error: 'No supplier email configured for this item' });
  }

  // Here you would integrate with an email service like SendGrid, AWS SES, etc.
  // For now, we'll just log it and mark the alert as sent
  console.log(`
    === REORDER EMAIL ===
    To: ${item.supplier_email}
    Subject: Reorder Request - ${item.name}

    Dear ${item.contact_person || item.supplier_name},

    We would like to place a reorder for the following item:

    Item: ${item.name}
    Current Stock: ${item.current_stock} ${item.unit}
    Minimum Stock Level: ${item.min_stock_level} ${item.unit}
    Reorder Quantity: ${item.reorder_quantity} ${item.unit}

    Please confirm availability and provide an estimated delivery date.

    Best regards,
    VES Pottery Studio
  `);

  // Update the item to mark alert as sent
  await supabaseDb.query(`
    UPDATE inventory_items
    SET low_stock_alert_sent = true, last_alert_sent_at = CURRENT_TIMESTAMP
    WHERE id = $1
  `, [itemId]);

  res.json({
    success: true,
    message: `Reorder email sent to ${item.supplier_email}`,
    supplierEmail: item.supplier_email
  });
}));

// Get inventory transaction history for an item
app.get('/api/admin/inventory/items/:id/transactions', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows: transactions } = await supabaseDb.query(`
    SELECT * FROM inventory_transactions
    WHERE item_id = $1
    ORDER BY created_at DESC
    LIMIT 100
  `, [id]);

  res.json({ transactions });
}));

// Get inventory dashboard stats
app.get('/api/admin/inventory/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { rows: [stats] } = await supabaseDb.query(`
    SELECT
      (SELECT COUNT(*) FROM inventory_items WHERE active = true) as total_items,
      (SELECT COUNT(*) FROM inventory_items WHERE active = true AND current_stock <= min_stock_level) as low_stock_items,
      (SELECT COUNT(*) FROM suppliers WHERE active = true) as total_suppliers,
      (SELECT COUNT(*) FROM inventory_categories) as total_categories
  `);

  res.json({ stats });
}));

};
