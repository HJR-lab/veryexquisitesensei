const { getCreditBalance, getCreditHistory, earnCredits, spendCredits } = require('../utils/creditManager');
const { supabase } = require('../utils/supabaseDb');

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler }) {

// ============================================
// CREDIT ENDPOINTS
// ============================================

// GET /api/credits/balance/:customerId
app.get('/api/credits/balance/:customerId', authenticateToken, asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const balance = await getCreditBalance(parseInt(customerId, 10));
  res.json({ balance });
}));

// GET /api/credits/history/:customerId
app.get('/api/credits/history/:customerId', authenticateToken, asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const history = await getCreditHistory(parseInt(customerId, 10));
  res.json({ history });
}));

// POST /api/credits/adjust — admin manual credit adjustment
app.post('/api/credits/adjust', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { customerId, amount, type, description } = req.body;

  if (!customerId || !amount || !type || !description) {
    return res.status(400).json({ error: 'customerId, amount, type, and description are required' });
  }

  if (!['earn', 'spend'].includes(type)) {
    return res.status(400).json({ error: 'type must be "earn" or "spend"' });
  }

  let transaction;
  if (type === 'earn') {
    transaction = await earnCredits({
      customerId: parseInt(customerId, 10),
      amount: parseFloat(amount),
      source: 'manual_adjustment',
      description,
    });
  } else {
    transaction = await spendCredits({
      customerId: parseInt(customerId, 10),
      maxAmount: parseFloat(amount),
      source: 'manual_adjustment',
      description,
    });
  }

  res.json({ success: true, transaction });
}));

// POST /api/credits/delivery — create delivery order with credit auto-offset
app.post('/api/credits/delivery', authenticateToken, asyncHandler(async (req, res) => {
  const {
    customerId,
    courseEnrollmentId,
    deliveryType,
    recipientName,
    recipientAddress,
    recipientPhone,
    giftMessage,
    pieces,
  } = req.body;

  if (!customerId || !deliveryType || !recipientName || !recipientAddress) {
    return res.status(400).json({ error: 'customerId, deliveryType, recipientName, and recipientAddress are required' });
  }

  const DELIVERY_FEE = 10;

  // Create delivery order record
  const { data: order, error: orderError } = await supabase
    .from('delivery_orders')
    .insert({
      customer_id: parseInt(customerId, 10),
      course_enrollment_id: courseEnrollmentId || null,
      delivery_type: deliveryType,
      recipient_name: recipientName,
      recipient_address: recipientAddress,
      recipient_phone: recipientPhone || null,
      gift_message: giftMessage || null,
      pieces: pieces || null,
      amount: DELIVERY_FEE,
      credit_applied: 0,
      status: 'pending',
    })
    .select()
    .single();

  if (orderError) {
    console.error('Error creating delivery order:', orderError);
    return res.status(500).json({ error: 'Failed to create delivery order' });
  }

  // Auto-offset with credits
  let creditApplied = 0;
  let spendTransaction = null;

  try {
    spendTransaction = await spendCredits({
      customerId: parseInt(customerId, 10),
      maxAmount: DELIVERY_FEE,
      source: 'delivery',
      referenceId: order.id,
      description: `Delivery order #${order.id} — ${deliveryType}`,
    });
    creditApplied = spendTransaction ? spendTransaction.amount : 0;
  } catch (err) {
    // Credit spend failure is non-fatal — order still created
    console.warn('Credit spend failed for delivery order:', err.message);
  }

  // Update delivery order with actual credit applied
  if (creditApplied > 0) {
    await supabase
      .from('delivery_orders')
      .update({ credit_applied: creditApplied })
      .eq('id', order.id);
    order.credit_applied = creditApplied;
  }

  const netAmount = DELIVERY_FEE - creditApplied;

  res.json({ success: true, order, creditApplied, netAmount });
}));

// GET /api/credits/deliveries/:customerId
app.get('/api/credits/deliveries/:customerId', authenticateToken, asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  const { data: deliveries, error } = await supabase
    .from('delivery_orders')
    .select('*')
    .eq('customer_id', parseInt(customerId, 10))
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching deliveries:', error);
    return res.status(500).json({ error: 'Failed to fetch deliveries' });
  }

  res.json({ deliveries: deliveries || [] });
}));

// PATCH /api/credits/delivery/:id/status
app.patch('/api/credits/delivery/:id/status', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const VALID_STATUSES = ['pending', 'packed', 'shipped', 'delivered'];

  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const { data: updated, error } = await supabase
    .from('delivery_orders')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating delivery status:', error);
    return res.status(500).json({ error: 'Failed to update delivery status' });
  }

  res.json({ success: true, order: updated });
}));

}; // end module.exports
