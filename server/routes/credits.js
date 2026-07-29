const { getCreditBalance, getCreditHistory, earnCredits, spendCredits, CREDIT_EXPIRY } = require('../utils/creditManager');
const { supabase } = require('../utils/supabaseDb');
const FEES = require('../config/fees');

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler }) {

// ============================================
// CREDIT ENDPOINTS
// ============================================

// GET /api/credits/balance/:customerId
app.get('/api/credits/balance/:customerId', authenticateToken, asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.customerId, 10);
  if (!req.user.isAdmin && req.user.dbCustomerId !== customerId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const balance = await getCreditBalance(customerId);
  res.json({ balance });
}));

// GET /api/credits/history/:customerId
app.get('/api/credits/history/:customerId', authenticateToken, asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.customerId, 10);
  if (!req.user.isAdmin && req.user.dbCustomerId !== customerId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const history = await getCreditHistory(customerId);
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

// POST /api/admin/credits/set-earned — set a student's total earned credits directly
app.post('/api/admin/credits/set-earned', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { customerId, amount } = req.body;

  if (!customerId || amount == null || amount < 0) {
    return res.status(400).json({ error: 'customerId and a non-negative amount are required' });
  }

  const cid = parseInt(customerId, 10);
  const newAmount = parseFloat(amount);

  // Delete all existing earn transactions for this customer
  const { error: delErr } = await supabase
    .from('credit_transactions')
    .delete()
    .eq('customer_id', cid)
    .eq('type', 'earn');

  if (delErr) throw delErr;

  // Insert a single earn transaction with the correct amount (skip if zero)
  if (newAmount > 0) {
    const { error: insErr } = await supabase
      .from('credit_transactions')
      .insert([{
        customer_id: cid,
        type: 'earn',
        amount: newAmount,
        source: 'admin_set',
        description: `Initial credit — $${newAmount}`,
        expires_at: CREDIT_EXPIRY,
        created_at: new Date().toISOString(),
      }]);

    if (insErr) throw insErr;
  }

  const balance = await getCreditBalance(cid);
  res.json({ success: true, earned: newAmount, balance });
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

  const DELIVERY_FEE = FEES.DELIVERY;

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
  const customerId = parseInt(req.params.customerId, 10);
  if (!req.user.isAdmin && req.user.dbCustomerId !== customerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { data: deliveries, error } = await supabase
    .from('delivery_orders')
    .select('*')
    .eq('customer_id', customerId)
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

// ============================================
// ADMIN CREDIT ENDPOINTS
// ============================================

// GET /api/admin/credits/stats — summary for dashboard card
app.get('/api/admin/credits/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const now = new Date().toISOString();

  // All earn transactions (non-expired)
  const { data: earnRows, error: e1 } = await supabase
    .from('credit_transactions')
    .select('amount, customer_id')
    .eq('type', 'earn')
    .gt('expires_at', now);

  // All spend transactions
  const { data: spendRows, error: e2 } = await supabase
    .from('credit_transactions')
    .select('amount, customer_id')
    .eq('type', 'spend');

  if (e1 || e2) throw e1 || e2;

  // Total transaction count
  const { count: totalTransactions, error: e3 } = await supabase
    .from('credit_transactions')
    .select('*', { count: 'exact', head: true });

  // Today's transaction count
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count: todayTransactions, error: e4 } = await supabase
    .from('credit_transactions')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', todayStart.toISOString());

  if (e3 || e4) throw e3 || e4;

  const totalEarned = (earnRows || []).reduce((s, r) => s + Number(r.amount), 0);
  const totalSpent = (spendRows || []).reduce((s, r) => s + Number(r.amount), 0);
  const totalBalance = totalEarned - totalSpent;

  // Count unique customers with positive balance
  const balanceByCustomer = {};
  for (const r of (earnRows || [])) {
    balanceByCustomer[r.customer_id] = (balanceByCustomer[r.customer_id] || 0) + Number(r.amount);
  }
  for (const r of (spendRows || [])) {
    balanceByCustomer[r.customer_id] = (balanceByCustomer[r.customer_id] || 0) - Number(r.amount);
  }
  const studentsWithCredits = Object.values(balanceByCustomer).filter(b => b > 0).length;

  res.json({ totalEarned, totalSpent, totalBalance, studentsWithCredits, totalTransactions: totalTransactions || 0, todayTransactions: todayTransactions || 0 });
}));

// GET /api/admin/credits/overview — per-student balances + full transaction log
app.get('/api/admin/credits/overview', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const now = new Date().toISOString();

  // All transactions with customer info
  const { data: transactions, error: txErr } = await supabase
    .from('credit_transactions')
    .select('*, customers!inner(first_name, last_name, email)')
    .order('created_at', { ascending: false });

  if (txErr) throw txErr;

  // Build per-student balances
  const studentMap = {};
  for (const tx of (transactions || [])) {
    const cid = tx.customer_id;
    if (!studentMap[cid]) {
      studentMap[cid] = {
        customerId: cid,
        name: `${tx.customers.first_name || ''} ${tx.customers.last_name || ''}`.trim(),
        email: tx.customers.email,
        earned: 0,
        spent: 0,
      };
    }
    const amt = Number(tx.amount);
    if (tx.type === 'earn' && tx.expires_at && new Date(tx.expires_at) > new Date(now)) {
      studentMap[cid].earned += amt;
    } else if (tx.type === 'spend') {
      studentMap[cid].spent += amt;
    }
  }

  const students = Object.values(studentMap)
    .map(s => ({ ...s, balance: s.earned - s.spent }))
    .filter(s => s.earned > 0 || s.spent > 0)
    .sort((a, b) => b.balance - a.balance);

  // Flatten transactions for log
  const log = (transactions || []).map(tx => ({
    id: tx.id,
    customerId: tx.customer_id,
    name: `${tx.customers.first_name || ''} ${tx.customers.last_name || ''}`.trim(),
    type: tx.type,
    amount: Number(tx.amount),
    source: tx.source,
    description: tx.description,
    createdAt: tx.created_at,
  }));

  res.json({ students, log });
}));

}; // end module.exports
