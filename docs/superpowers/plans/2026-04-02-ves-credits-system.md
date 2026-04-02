# VES Credits System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a loyalty credit system where returning students earn $20 per course purchase, auto-offset against studio access, firing, delivery, and reschedule fees.

**Architecture:** Single `credit_transactions` ledger table with derived balance. New `firing_charges` and `delivery_orders` tables for those charge types. Credit logic lives in a new `server/utils/creditManager.js` utility. API endpoints in a new `server/routes/credits.js`. Student-facing Credits page + admin Credits tab on student detail.

**Tech Stack:** Express.js, Supabase PostgreSQL, React 18, Resend email

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `server/utils/creditManager.js` | Core credit logic: getBalance, earnCredits, spendCredits, getHistory |
| `server/routes/credits.js` | API endpoints for credits (balance, history, admin adjust, delivery orders) |
| `server/email-templates/credits-earned.js` | Email template for credit earned notification |
| `server/email-templates/credits-spent.js` | Email template for credit spent notification |
| `server/email-templates/credits-retroactive.js` | Email template for retroactive grant |
| `server/scripts/retroactive-credit-grant.js` | One-time script to grant retroactive credits |
| `frontend/src/pages/Credits.jsx` | Student-facing Credits page (balance + history) |
| `frontend/src/components/StudentCreditsTab.jsx` | Admin student detail Credits tab |

### Modified Files
| File | Changes |
|------|---------|
| `server/utils/supabaseDb.js` | Add credit transaction DB helpers |
| `server/routes/shopify.js` | Add credit earning after course enrollment creation |
| `server/routes/classes.js` | Add firing_pieces recording + credit offset on reschedule fees |
| `frontend/src/App.jsx` | Add `/credits` route and lazy import |
| `frontend/src/components/StudentLayout.jsx` | Add Credits tab to bottom nav |
| `frontend/src/components/Navigation.jsx` | Add Credits link to desktop nav |
| `frontend/src/pages/AdminStudentDetail.jsx` | Add Credits tab with StudentCreditsTab component |

---

### Task 1: Database Tables — credit_transactions, firing_charges, delivery_orders

**Files:**
- Modify: `server/utils/supabaseDb.js:1434` (add new DB helper functions before module.exports)

- [ ] **Step 1: Create database tables via Supabase SQL**

Run these SQL statements against the Supabase database (use the MCP Supabase execute_sql tool):

```sql
-- Credit transactions ledger
CREATE TABLE credit_transactions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  type TEXT NOT NULL CHECK (type IN ('earn', 'spend')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  source TEXT NOT NULL,
  reference_id TEXT,
  description TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_transactions_customer ON credit_transactions(customer_id);
CREATE INDEX idx_credit_transactions_type ON credit_transactions(type);

-- Firing charges
CREATE TABLE firing_charges (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  course_enrollment_id INTEGER REFERENCES course_enrollments(id),
  pieces INTEGER NOT NULL CHECK (pieces > 0),
  amount NUMERIC(10,2) NOT NULL,
  credit_applied NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Delivery orders
CREATE TABLE delivery_orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  course_enrollment_id INTEGER REFERENCES course_enrollments(id),
  delivery_type TEXT NOT NULL CHECK (delivery_type IN ('self', 'gift')),
  recipient_name TEXT,
  recipient_address TEXT,
  recipient_phone TEXT,
  gift_message TEXT,
  pieces INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC(10,2) NOT NULL DEFAULT 10,
  credit_applied NUMERIC(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'packed', 'shipped', 'delivered')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add firing_pieces to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS firing_pieces INTEGER;

-- Add credit_applied to studio_access_bookings
ALTER TABLE studio_access_bookings ADD COLUMN IF NOT EXISTS credit_applied NUMERIC(10,2) DEFAULT 0;
```

- [ ] **Step 2: Verify tables were created**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('credit_transactions', 'firing_charges', 'delivery_orders');
```

Expected: 3 rows returned.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: document DB schema changes for VES credits (tables created via Supabase)"
```

---

### Task 2: Credit Manager Utility — core credit logic

**Files:**
- Create: `server/utils/creditManager.js`

- [ ] **Step 1: Create the credit manager module**

Create `server/utils/creditManager.js`:

```javascript
const { supabase } = require('./supabaseDb');

const CREDIT_EXPIRY = '2026-12-31T23:59:59Z';

/**
 * Get a customer's current credit balance
 */
async function getCreditBalance(customerId) {
  const { data, error } = await supabase.rpc('get_credit_balance', { p_customer_id: customerId });

  // Fallback to manual calculation if RPC not available
  if (error) {
    const { data: txns, error: txnError } = await supabase
      .from('credit_transactions')
      .select('type, amount, expires_at')
      .eq('customer_id', customerId);

    if (txnError) throw txnError;

    const now = new Date();
    let earned = 0;
    let spent = 0;
    for (const t of (txns || [])) {
      if (t.type === 'earn' && new Date(t.expires_at) > now) {
        earned += parseFloat(t.amount);
      } else if (t.type === 'spend') {
        spent += parseFloat(t.amount);
      }
    }
    return Math.max(0, earned - spent);
  }

  return parseFloat(data) || 0;
}

/**
 * Get credit transaction history for a customer
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
 * Earn credits for a customer
 * @returns {object} The created transaction
 */
async function earnCredits({ customerId, amount, source, referenceId, description }) {
  const { data, error } = await supabase
    .from('credit_transactions')
    .insert({
      customer_id: customerId,
      type: 'earn',
      amount,
      source,
      reference_id: referenceId || null,
      description,
      expires_at: CREDIT_EXPIRY,
    })
    .select()
    .single();

  if (error) throw error;
  console.log(`[Credits] Earned $${amount} for customer ${customerId}: ${description}`);
  return data;
}

/**
 * Spend credits for a customer (auto-offset).
 * Spends up to the available balance. Returns the amount actually spent.
 * @returns {{ spent: number, transaction: object|null }}
 */
async function spendCredits({ customerId, maxAmount, source, referenceId, description }) {
  const balance = await getCreditBalance(customerId);
  if (balance <= 0) return { spent: 0, transaction: null };

  const spent = Math.min(balance, maxAmount);

  const { data, error } = await supabase
    .from('credit_transactions')
    .insert({
      customer_id: customerId,
      type: 'spend',
      amount: spent,
      source,
      reference_id: referenceId || null,
      description,
      expires_at: null, // spends don't expire
    })
    .select()
    .single();

  if (error) throw error;
  console.log(`[Credits] Spent $${spent} for customer ${customerId}: ${description}`);
  return { spent, transaction: data };
}

/**
 * Check if a customer is a returning student (has prior enrollments)
 */
async function isReturningStudent(customerId) {
  const { count, error } = await supabase
    .from('course_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', customerId)
    .in('status', ['active', 'upcoming', 'completed']);

  if (error) throw error;
  return (count || 0) > 1; // more than 1 means they had a prior enrollment before this new one
}

module.exports = {
  getCreditBalance,
  getCreditHistory,
  earnCredits,
  spendCredits,
  isReturningStudent,
  CREDIT_EXPIRY,
};
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/creditManager.js
git commit -m "feat: add creditManager utility for VES Credits core logic"
```

---

### Task 3: Credit API Endpoints

**Files:**
- Create: `server/routes/credits.js`
- Modify: `server/routes/shopify.js` (to mount the credits router — find where other routers are mounted)

- [ ] **Step 1: Create credits route file**

Create `server/routes/credits.js`:

```javascript
const express = require('express');
const router = express.Router();
const { getCreditBalance, getCreditHistory, earnCredits, spendCredits } = require('../utils/creditManager');
const { supabase } = require('../utils/supabaseDb');

/**
 * GET /api/credits/balance/:customerId
 * Get credit balance for a customer (used by both admin and student views)
 */
router.get('/balance/:customerId', async (req, res) => {
  try {
    const balance = await getCreditBalance(parseInt(req.params.customerId));
    res.json({ balance });
  } catch (err) {
    console.error('[Credits] Balance fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch credit balance' });
  }
});

/**
 * GET /api/credits/history/:customerId
 * Get credit transaction history for a customer
 */
router.get('/history/:customerId', async (req, res) => {
  try {
    const history = await getCreditHistory(parseInt(req.params.customerId));
    res.json({ history });
  } catch (err) {
    console.error('[Credits] History fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch credit history' });
  }
});

/**
 * POST /api/credits/adjust
 * Admin manual credit adjustment (earn or spend)
 */
router.post('/adjust', async (req, res) => {
  try {
    const { customerId, amount, type, description } = req.body;

    if (!customerId || !amount || !type || !description) {
      return res.status(400).json({ error: 'Missing required fields: customerId, amount, type, description' });
    }

    if (type === 'earn') {
      const txn = await earnCredits({
        customerId,
        amount: parseFloat(amount),
        source: 'admin_adjustment',
        description,
      });
      res.json({ success: true, transaction: txn });
    } else if (type === 'spend') {
      const { spent, transaction } = await spendCredits({
        customerId,
        maxAmount: parseFloat(amount),
        source: 'admin_adjustment',
        description,
      });
      res.json({ success: true, spent, transaction });
    } else {
      res.status(400).json({ error: 'type must be "earn" or "spend"' });
    }
  } catch (err) {
    console.error('[Credits] Adjust error:', err);
    res.status(500).json({ error: 'Failed to adjust credits' });
  }
});

/**
 * POST /api/credits/delivery
 * Create a delivery order with credit auto-offset
 */
router.post('/delivery', async (req, res) => {
  try {
    const {
      customerId, courseEnrollmentId, deliveryType,
      recipientName, recipientAddress, recipientPhone,
      giftMessage, pieces
    } = req.body;

    if (!customerId || !deliveryType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const amount = 10; // flat $10 delivery fee

    // Create delivery order
    const { data: order, error: orderError } = await supabase
      .from('delivery_orders')
      .insert({
        customer_id: customerId,
        course_enrollment_id: courseEnrollmentId || null,
        delivery_type: deliveryType,
        recipient_name: recipientName || null,
        recipient_address: recipientAddress || null,
        recipient_phone: recipientPhone || null,
        gift_message: giftMessage || null,
        pieces: pieces || 1,
        amount,
        status: 'pending',
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // Auto-offset with credits
    const deliveryDesc = deliveryType === 'gift'
      ? `Delivery to ${recipientName} (gift)`
      : 'Piece delivery';

    const { spent } = await spendCredits({
      customerId,
      maxAmount: amount,
      source: 'delivery_fee',
      referenceId: order.id.toString(),
      description: deliveryDesc,
    });

    // Update delivery order with credit applied
    if (spent > 0) {
      await supabase
        .from('delivery_orders')
        .update({ credit_applied: spent })
        .eq('id', order.id);
      order.credit_applied = spent;
    }

    res.json({ success: true, order, creditApplied: spent, netAmount: amount - spent });
  } catch (err) {
    console.error('[Credits] Delivery order error:', err);
    res.status(500).json({ error: 'Failed to create delivery order' });
  }
});

/**
 * GET /api/credits/deliveries/:customerId
 * Get delivery orders for a customer
 */
router.get('/deliveries/:customerId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('delivery_orders')
      .select('*')
      .eq('customer_id', parseInt(req.params.customerId))
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ deliveries: data || [] });
  } catch (err) {
    console.error('[Credits] Deliveries fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch deliveries' });
  }
});

/**
 * PATCH /api/credits/delivery/:id/status
 * Update delivery order status (admin)
 */
router.patch('/delivery/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'packed', 'shipped', 'delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    const { data, error } = await supabase
      .from('delivery_orders')
      .update({ status })
      .eq('id', parseInt(req.params.id))
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, order: data });
  } catch (err) {
    console.error('[Credits] Delivery status update error:', err);
    res.status(500).json({ error: 'Failed to update delivery status' });
  }
});

module.exports = router;
```

- [ ] **Step 2: Mount the credits router**

Find where routes are mounted in the main app. Check if routes are mounted in `server/index.js` or a setup file. Add:

```javascript
const creditsRouter = require('./routes/credits');
app.use('/api/credits', creditsRouter);
```

Mount it near the other route registrations (look for patterns like `app.use('/api/admin'` or `require('./routes/shopify')`).

- [ ] **Step 3: Commit**

```bash
git add server/routes/credits.js
git commit -m "feat: add credit API endpoints — balance, history, adjust, delivery"
```

---

### Task 4: Credit Earning on Course Purchase

**Files:**
- Modify: `server/routes/shopify.js:1184` (after `result.success` in order webhook)

- [ ] **Step 1: Add credit earning after successful enrollment**

In `server/routes/shopify.js`, after line 1184 where `result.success` is checked, add credit earning logic. Find the block:

```javascript
if (result.success) {
  console.log(`✅ Course enrollment processed successfully`);
```

After that log line (before the HB email auto-send block), add:

```javascript
            // Award VES Credit for returning students
            try {
              const { isReturningStudent, earnCredits } = require('../utils/creditManager');
              const { sendEmail } = require('../utils/emailService');
              const returning = await isReturningStudent(dbCustomer.id);
              if (returning) {
                const creditTxn = await earnCredits({
                  customerId: dbCustomer.id,
                  amount: 20,
                  source: 'course_purchase',
                  referenceId: result.enrollment?.id?.toString(),
                  description: `Earned $20 from ${productTitle}`,
                });
                console.log(`💰 Awarded $20 VES Credit to ${customer.email}`);

                // Send credit earned email
                try {
                  const { getCreditBalance } = require('../utils/creditManager');
                  const { generate: generateCreditEarned } = require('../email-templates/credits-earned');
                  const newBalance = await getCreditBalance(dbCustomer.id);
                  const { subject, html } = generateCreditEarned({
                    firstName: customer.first_name,
                    amountEarned: 20,
                    courseName: productTitle,
                    newBalance,
                  });
                  await sendEmail({ to: customer.email, subject, html });
                } catch (emailErr) {
                  console.error('[Credits] Failed to send credit earned email:', emailErr);
                }
              }
            } catch (creditErr) {
              console.error('[Credits] Failed to award credit:', creditErr);
              // Don't block the enrollment flow
            }
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/shopify.js
git commit -m "feat: award $20 VES Credit to returning students on course purchase"
```

---

### Task 5: Auto-Offset on Reschedule Fees

**Files:**
- Modify: `server/routes/classes.js` (find where reschedule fees are inserted into `reschedule_fees` table)

- [ ] **Step 1: Find the reschedule fee creation code**

Search `server/routes/classes.js` for `reschedule_fees` insert. After the fee is inserted, add credit auto-offset:

```javascript
// Auto-offset reschedule fee with VES Credits
try {
  const { spendCredits } = require('../utils/creditManager');
  const feeAmount = parseFloat(newFee.amount);
  const { spent } = await spendCredits({
    customerId: newFee.student_id,
    maxAmount: feeAmount,
    source: 'reschedule_fee',
    referenceId: newFee.id.toString(),
    description: `Reschedule fee offset`,
  });
  if (spent > 0) {
    // If fully covered, mark as paid
    if (spent >= feeAmount) {
      await supabase
        .from('reschedule_fees')
        .update({ payment_status: 'paid', notes: (newFee.notes || '') + ` [Credit: $${spent}]` })
        .eq('id', newFee.id);
    } else {
      await supabase
        .from('reschedule_fees')
        .update({ notes: (newFee.notes || '') + ` [Credit: $${spent} of $${feeAmount}]` })
        .eq('id', newFee.id);
    }
    console.log(`💰 Applied $${spent} VES Credit to reschedule fee ${newFee.id}`);
  }
} catch (creditErr) {
  console.error('[Credits] Failed to offset reschedule fee:', creditErr);
}
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/classes.js
git commit -m "feat: auto-offset reschedule fees with VES Credits"
```

---

### Task 6: Auto-Offset on Studio Access Bookings

**Files:**
- Modify: Find the studio access booking creation endpoint (likely in `server/routes/instructors.js` or `server/routes/classes.js`)

- [ ] **Step 1: Find the studio access booking creation**

Search for where `studio_access_bookings` records are inserted. After the booking is created, add:

```javascript
// Auto-offset studio access with VES Credits
try {
  const { spendCredits } = require('../utils/creditManager');
  const bookingAmount = parseFloat(newBooking.amount_sgd);
  const { spent } = await spendCredits({
    customerId: newBooking.customer_id,
    maxAmount: bookingAmount,
    source: 'studio_access',
    referenceId: newBooking.id.toString(),
    description: `Studio access — ${newBooking.hours}hrs`,
  });
  if (spent > 0) {
    await supabase
      .from('studio_access_bookings')
      .update({ credit_applied: spent })
      .eq('id', newBooking.id);
    console.log(`💰 Applied $${spent} VES Credit to studio access booking ${newBooking.id}`);
  }
} catch (creditErr) {
  console.error('[Credits] Failed to offset studio access:', creditErr);
}
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/instructors.js  # or wherever the endpoint lives
git commit -m "feat: auto-offset studio access bookings with VES Credits"
```

---

### Task 7: Firing Pieces Recording + Credit Offset

**Files:**
- Modify: `server/routes/classes.js` (attendance marking endpoint, around line 1544)

- [ ] **Step 1: Add firing_pieces support to attendance endpoint**

In the attendance marking endpoint in `server/routes/classes.js`, accept an optional `firingPieces` field. When provided and > 7 (WT allowance), create a firing charge and auto-offset:

After attendance is marked successfully, add:

```javascript
// Handle firing pieces if provided
if (req.body.firingPieces && parseInt(req.body.firingPieces) > 0) {
  const firingPieces = parseInt(req.body.firingPieces);
  const allowance = 7; // WT standard allowance
  const extraPieces = Math.max(0, firingPieces - allowance);

  // Save firing_pieces on the booking
  await supabase
    .from('bookings')
    .update({ firing_pieces: firingPieces })
    .eq('id', bookingId);

  if (extraPieces > 0) {
    const chargeAmount = extraPieces * 20;

    // Create firing charge
    const { data: charge, error: chargeError } = await supabase
      .from('firing_charges')
      .insert({
        customer_id: booking.student_id,
        course_enrollment_id: booking.course_enrollment_id,
        pieces: extraPieces,
        amount: chargeAmount,
      })
      .select()
      .single();

    if (!chargeError && charge) {
      // Auto-offset with credits
      const { spendCredits } = require('../utils/creditManager');
      const { spent } = await spendCredits({
        customerId: booking.student_id,
        maxAmount: chargeAmount,
        source: 'firing_fee',
        referenceId: charge.id.toString(),
        description: `${extraPieces} extra firing piece${extraPieces > 1 ? 's' : ''} @ $20`,
      });

      if (spent > 0) {
        await supabase
          .from('firing_charges')
          .update({ credit_applied: spent })
          .eq('id', charge.id);
      }

      console.log(`🔥 Firing charge: ${extraPieces} extra pieces = $${chargeAmount}, credit applied: $${spent}`);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/classes.js
git commit -m "feat: record firing pieces at attendance + auto-offset extra with credits"
```

---

### Task 8: Email Templates — credits-earned, credits-spent, credits-retroactive

**Files:**
- Create: `server/email-templates/credits-earned.js`
- Create: `server/email-templates/credits-spent.js`
- Create: `server/email-templates/credits-retroactive.js`

- [ ] **Step 1: Create credits-earned email template**

Create `server/email-templates/credits-earned.js`:

```javascript
const { wrapEmailTemplate } = require('./base');

function generate({ firstName, amountEarned, courseName, newBalance }) {
  const subject = "You've earned VES Credits!";

  const body = `
    <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      You've Earned VES Credits!
    </h1>
    <p style="margin: 0 0 24px; font-size: 14px; color: #888888; text-align: center;">Thank you for being a returning student</p>

    <!-- Credit Earned Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 24px;">
      <tr>
        <td style="padding: 20px; text-align: center;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Credit Earned</p>
          <p style="margin: 0; font-size: 32px; font-weight: 700; color: #C4622D;">+$${amountEarned}</p>
          <p style="margin: 8px 0 0; font-size: 14px; color: #282828;">from ${courseName}</p>
        </td>
      </tr>
    </table>

    <!-- Balance Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid rgba(40,40,40,0.09); border-radius: 8px; margin: 0 0 24px;">
      <tr>
        <td style="padding: 16px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size: 14px; color: #888888;">Your Balance</td>
              <td style="text-align: right; font-size: 20px; font-weight: 700; color: #282828;">$${newBalance}</td>
            </tr>
            <tr>
              <td colspan="2" style="font-size: 12px; color: #888888; padding-top: 4px;">Expires 31 Dec 2026</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- What You Can Use Credits For -->
    <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #282828;">Use your credits for:</p>
    <p style="margin: 0 0 4px; font-size: 14px; color: #282828;">&#8226; Studio access fees</p>
    <p style="margin: 0 0 4px; font-size: 14px; color: #282828;">&#8226; Extra firing pieces</p>
    <p style="margin: 0 0 4px; font-size: 14px; color: #282828;">&#8226; Piece delivery (self or gift)</p>
    <p style="margin: 0 0 4px; font-size: 14px; color: #282828;">&#8226; Reschedule fees</p>
    <p style="margin: 0 0 20px; font-size: 14px; color: #282828;">&#8226; Course discount (on request)</p>

    <p style="margin: 0; text-align: center;">
      <a href="https://club.ves.sg/credits" style="display: inline-block; padding: 12px 28px; background-color: #C4622D; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 6px;">View Your Credits</a>
    </p>
  `;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
```

- [ ] **Step 2: Create credits-spent email template**

Create `server/email-templates/credits-spent.js`:

```javascript
const { wrapEmailTemplate } = require('./base');

function generate({ firstName, amountSpent, appliedTo, remainingBalance }) {
  const subject = 'VES Credit Applied';

  const body = `
    <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      VES Credit Applied
    </h1>
    <p style="margin: 0 0 24px; font-size: 14px; color: #888888; text-align: center;">Your credit was used automatically</p>

    <!-- Credit Applied Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F5F3F0; border-radius: 8px; margin: 0 0 24px;">
      <tr>
        <td style="padding: 20px; text-align: center;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #888888; text-transform: uppercase; letter-spacing: 0.05em;">Credit Applied</p>
          <p style="margin: 0; font-size: 32px; font-weight: 700; color: #282828;">-$${amountSpent}</p>
          <p style="margin: 8px 0 0; font-size: 14px; color: #282828;">${appliedTo}</p>
        </td>
      </tr>
    </table>

    <!-- Remaining Balance Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid rgba(40,40,40,0.09); border-radius: 8px; margin: 0 0 24px;">
      <tr>
        <td style="padding: 16px 20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size: 14px; color: #888888;">Remaining Balance</td>
              <td style="text-align: right; font-size: 20px; font-weight: 700; color: #282828;">$${remainingBalance}</td>
            </tr>
            <tr>
              <td colspan="2" style="font-size: 12px; color: #888888; padding-top: 4px;">Expires 31 Dec 2026</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin: 0; text-align: center;">
      <a href="https://club.ves.sg/credits" style="display: inline-block; padding: 12px 28px; background-color: #C4622D; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 6px;">View Your Credits</a>
    </p>
  `;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
```

- [ ] **Step 3: Create credits-retroactive email template**

Create `server/email-templates/credits-retroactive.js`:

```javascript
const { wrapEmailTemplate } = require('./base');

function generate({ firstName, totalCredits, courseCount, balance }) {
  const subject = 'You have VES Credits waiting!';

  const body = `
    <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
      You Have VES Credits!
    </h1>
    <p style="margin: 0 0 24px; font-size: 14px; color: #888888; text-align: center;">A thank you for being part of the VES community</p>

    <!-- Credit Grant Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 24px;">
      <tr>
        <td style="padding: 24px; text-align: center;">
          <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Your VES Credits</p>
          <p style="margin: 0; font-size: 40px; font-weight: 700; color: #C4622D;">$${balance}</p>
          <p style="margin: 8px 0 0; font-size: 14px; color: #282828;">${courseCount} past course${courseCount > 1 ? 's' : ''} &times; $20 = $${totalCredits}</p>
        </td>
      </tr>
    </table>

    <!-- How It Works -->
    <p style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #282828;">How VES Credits Work</p>
    <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.7; color: #282828;">
      As a returning student, you earn <strong>$20 in VES Credits</strong> every time you sign up for a new course. Your credits are automatically applied to offset fees:
    </p>
    <p style="margin: 0 0 4px; font-size: 14px; color: #282828;">&#8226; Studio access fees</p>
    <p style="margin: 0 0 4px; font-size: 14px; color: #282828;">&#8226; Extra firing pieces ($20/pc beyond allowance)</p>
    <p style="margin: 0 0 4px; font-size: 14px; color: #282828;">&#8226; Piece delivery — to you or as a gift ($10)</p>
    <p style="margin: 0 0 4px; font-size: 14px; color: #282828;">&#8226; Reschedule fees</p>
    <p style="margin: 0 0 20px; font-size: 14px; color: #282828;">&#8226; Course discount (contact us to request)</p>

    <p style="margin: 0 0 20px; font-size: 12px; color: #888888;">Credits expire 31 Dec 2026.</p>

    <p style="margin: 0; text-align: center;">
      <a href="https://club.ves.sg/credits" style="display: inline-block; padding: 12px 28px; background-color: #C4622D; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 6px;">View Your Credits</a>
    </p>
  `;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
```

- [ ] **Step 4: Commit**

```bash
git add server/email-templates/credits-earned.js server/email-templates/credits-spent.js server/email-templates/credits-retroactive.js
git commit -m "feat: add email templates for VES Credits — earned, spent, retroactive"
```

---

### Task 9: Retroactive Credit Grant Script

**Files:**
- Create: `server/scripts/retroactive-credit-grant.js`

- [ ] **Step 1: Create the one-time grant script**

Create `server/scripts/retroactive-credit-grant.js`:

```javascript
/**
 * One-time script: Grant retroactive VES Credits to active/upcoming students
 * with 2+ course purchases.
 *
 * Usage: cd server && node scripts/retroactive-credit-grant.js [--dry-run]
 */
require('dotenv').config();
const { supabase } = require('../utils/supabaseDb');
const { earnCredits, getCreditBalance } = require('../utils/creditManager');
const { sendEmail } = require('../utils/emailService');
const { generate: generateRetroEmail } = require('../email-templates/credits-retroactive');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`\n🎁 VES Credits Retroactive Grant ${DRY_RUN ? '(DRY RUN)' : ''}\n`);

  // Find eligible students: active/upcoming enrollment + course_purchase_count >= 2
  const { data: students, error } = await supabase
    .from('customers')
    .select('id, email, first_name, last_name, course_purchase_count')
    .gte('course_purchase_count', 2);

  if (error) {
    console.error('Failed to fetch students:', error);
    process.exit(1);
  }

  // Filter to only those with active or upcoming enrollments
  const eligible = [];
  for (const student of students) {
    const { count } = await supabase
      .from('course_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', student.id)
      .in('status', ['active', 'upcoming']);

    if (count > 0) {
      eligible.push(student);
    }
  }

  console.log(`Found ${eligible.length} eligible students (of ${students.length} with 2+ purchases)\n`);

  let totalGranted = 0;
  let grantCount = 0;

  for (const student of eligible) {
    const pastCourses = student.course_purchase_count - 1;
    const creditAmount = pastCourses * 20;

    console.log(`  ${student.first_name} ${student.last_name} (${student.email}): ${student.course_purchase_count} courses → $${creditAmount} credit`);

    if (!DRY_RUN) {
      // Check if already granted (idempotency)
      const { data: existing } = await supabase
        .from('credit_transactions')
        .select('id')
        .eq('customer_id', student.id)
        .eq('source', 'admin_adjustment')
        .ilike('description', '%Retroactive%')
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`    ⏭ Already granted, skipping`);
        continue;
      }

      await earnCredits({
        customerId: student.id,
        amount: creditAmount,
        source: 'admin_adjustment',
        description: `Retroactive VES Credit grant — ${pastCourses} past courses × $20`,
      });

      // Send email
      try {
        const balance = await getCreditBalance(student.id);
        const { subject, html } = generateRetroEmail({
          firstName: student.first_name,
          totalCredits: creditAmount,
          courseCount: pastCourses,
          balance,
        });
        await sendEmail({ to: student.email, subject, html });
        console.log(`    ✅ Granted $${creditAmount} + email sent`);
      } catch (emailErr) {
        console.log(`    ✅ Granted $${creditAmount} (email failed: ${emailErr.message})`);
      }

      grantCount++;
      totalGranted += creditAmount;
    }
  }

  console.log(`\n📊 Summary: ${grantCount} students granted, $${totalGranted} total credits\n`);
}

main().catch(console.error);
```

- [ ] **Step 2: Commit**

```bash
git add server/scripts/retroactive-credit-grant.js
git commit -m "feat: add retroactive credit grant script for existing students"
```

---

### Task 10: Student Credits Page (Frontend)

**Files:**
- Create: `frontend/src/pages/Credits.jsx`
- Modify: `frontend/src/App.jsx:41` (add lazy import)
- Modify: `frontend/src/App.jsx:194` (add route under StudentLayout)

- [ ] **Step 1: Create the Credits page**

Create `frontend/src/pages/Credits.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../api/axios';

const TC = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK = '#9E4A1E';
const INK = '#282828';
const MUTED = '#888888';
const RULE = 'rgba(40,40,40,0.09)';

export default function Credits() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      api.get(`/credits/balance/${user.id}`),
      api.get(`/credits/history/${user.id}`),
    ]).then(([balRes, histRes]) => {
      setBalance(balRes.data.balance || 0);
      setHistory(histRes.data.history || []);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [user?.id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <div style={{ width: 24, height: 24, border: `2px solid ${RULE}`, borderTopColor: TC, borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      </div>
    );
  }

  // Calculate running balance for history display
  let runningBalance = 0;
  const historyWithBalance = [...history].reverse().map(txn => {
    if (txn.type === 'earn') runningBalance += parseFloat(txn.amount);
    else runningBalance -= parseFloat(txn.amount);
    return { ...txn, runningBalance: Math.max(0, runningBalance) };
  }).reverse();

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px 100px' }}>
      {/* Balance Card */}
      <div style={{ backgroundColor: TC_LIGHT, borderRadius: 12, padding: '28px 24px', textAlign: 'center', marginBottom: 24 }}>
        <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: TC_DARK, textTransform: 'uppercase', letterSpacing: '0.08em' }}>VES Credits</p>
        <p style={{ margin: 0, fontSize: 44, fontWeight: 700, color: TC }}>${balance}</p>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: MUTED }}>Expires 31 Dec 2026</p>
      </div>

      {/* What can I use credits for */}
      <div style={{ border: `1px solid ${RULE}`, borderRadius: 8, padding: '16px 20px', marginBottom: 24 }}>
        <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: INK }}>Use your credits for</p>
        <p style={{ margin: '0 0 4px', fontSize: 13, color: INK }}>&#8226; Studio access fees <span style={{ color: MUTED }}>(automatic)</span></p>
        <p style={{ margin: '0 0 4px', fontSize: 13, color: INK }}>&#8226; Extra firing pieces <span style={{ color: MUTED }}>(automatic)</span></p>
        <p style={{ margin: '0 0 4px', fontSize: 13, color: INK }}>&#8226; Piece delivery — self or gift <span style={{ color: MUTED }}>(automatic)</span></p>
        <p style={{ margin: '0 0 4px', fontSize: 13, color: INK }}>&#8226; Reschedule fees <span style={{ color: MUTED }}>(automatic)</span></p>
        <p style={{ margin: 0, fontSize: 13, color: INK }}>&#8226; Course discount <span style={{ color: MUTED }}>(contact us)</span></p>
      </div>

      {/* Transaction History */}
      <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: INK }}>Transaction History</p>
      {historyWithBalance.length === 0 ? (
        <p style={{ fontSize: 13, color: MUTED, textAlign: 'center', padding: '20px 0' }}>No transactions yet</p>
      ) : (
        <div style={{ border: `1px solid ${RULE}`, borderRadius: 8, overflow: 'hidden' }}>
          {historyWithBalance.map((txn, i) => (
            <div key={txn.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderTop: i > 0 ? `1px solid ${RULE}` : 'none' }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, color: INK }}>{txn.description}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: MUTED }}>
                  {new Date(txn.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: txn.type === 'earn' ? '#2D8F4E' : INK }}>
                  {txn.type === 'earn' ? '+' : '-'}${parseFloat(txn.amount).toFixed(0)}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: MUTED }}>Bal: ${txn.runningBalance.toFixed(0)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add lazy import and route in App.jsx**

In `frontend/src/App.jsx`, add the lazy import near line 41 (after StudioAccess):

```javascript
const Credits = lazy(() => import('./pages/Credits'));
```

Add the route under the StudentLayout routes (after line 194, the `/studio-access` route):

```jsx
<Route path="/credits" element={<Credits />} />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Credits.jsx frontend/src/App.jsx
git commit -m "feat: add student-facing Credits page with balance and transaction history"
```

---

### Task 11: Student Navigation — Credits Link

**Files:**
- Modify: `frontend/src/components/Navigation.jsx:244` (add Credits link after Membership, before Contact)
- Modify: `frontend/src/components/StudentLayout.jsx:6-11` (add Credits tab to bottom nav)

- [ ] **Step 1: Add Credits to desktop nav**

In `frontend/src/components/Navigation.jsx`, find the Membership link block (around line 238-244) and add a Credits link after it, before the Contact link:

```jsx
<Link
  ref={el => linksRef.current['/credits'] = el}
  className={`text-sm font-normal uppercase tracking-wide relative pb-1 ${isActive('/credits') ? 'text-text' : 'text-text-muted hover:text-text'}`}
  to="/credits"
>
  Credits
</Link>
```

- [ ] **Step 2: Add Credits to mobile bottom nav**

In `frontend/src/components/StudentLayout.jsx`, the TABS array currently has 5 items (Home, Classes, Studio, Gallery, Account). Add Credits. Replace the TABS array:

```javascript
const TABS = [
  { id: 'home',    label: 'Home',    icon: 'home',           href: '/dashboard' },
  { id: 'classes', label: 'Classes', icon: 'calendar_month', href: '/classes' },
  { id: 'credits', label: 'Credits', icon: 'toll',           href: '/credits' },
  { id: 'studio',  label: 'Studio',  icon: 'door_open',      href: '/studio-access' },
  { id: 'gallery', label: 'Gallery', icon: 'photo_library',  href: '/gallery' },
  { id: 'account', label: 'Account', icon: 'person',         href: '/account' },
];
```

Also add to `getActiveTab`:

```javascript
if (pathname.startsWith('/credits')) return 'credits';
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Navigation.jsx frontend/src/components/StudentLayout.jsx
git commit -m "feat: add Credits nav link to desktop and mobile student navigation"
```

---

### Task 12: Admin Student Detail — Credits Tab

**Files:**
- Create: `frontend/src/components/StudentCreditsTab.jsx`
- Modify: `frontend/src/pages/AdminStudentDetail.jsx` (add Credits tab alongside Fees, Studio Access tabs)

- [ ] **Step 1: Create StudentCreditsTab component**

Create `frontend/src/components/StudentCreditsTab.jsx`:

```jsx
import { useState } from 'react';
import api from '../api/axios';

const TC = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK = '#9E4A1E';
const INK = '#282828';
const MUTED = '#888888';
const RULE = 'rgba(40,40,40,0.09)';

export default function StudentCreditsTab({ studentId, balance, history, onRefresh }) {
  const [adjustType, setAdjustType] = useState('earn');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);

  const handleAdjust = async () => {
    if (!adjustAmount || !adjustNote) return;
    setAdjusting(true);
    try {
      await api.post('/credits/adjust', {
        customerId: studentId,
        type: adjustType,
        amount: parseFloat(adjustAmount),
        description: adjustNote,
      });
      setAdjustAmount('');
      setAdjustNote('');
      setShowAdjust(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to adjust credits:', err);
      alert('Failed to adjust credits');
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF' }}>
      {/* Balance Header */}
      <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${RULE}` }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: TC_DARK, textTransform: 'uppercase', letterSpacing: '0.05em' }}>VES Credits Balance</p>
          <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 700, color: TC }}>${balance}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: MUTED }}>Expires 31 Dec 2026</p>
        </div>
        <button
          onClick={() => setShowAdjust(!showAdjust)}
          style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, color: TC, backgroundColor: TC_LIGHT, border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          {showAdjust ? 'Cancel' : 'Adjust Credits'}
        </button>
      </div>

      {/* Adjust Form */}
      {showAdjust && (
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${RULE}`, backgroundColor: '#FAFAFA' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select
              value={adjustType}
              onChange={e => setAdjustType(e.target.value)}
              style={{ padding: '6px 8px', fontSize: 13, border: `1px solid ${RULE}`, borderRadius: 4 }}
            >
              <option value="earn">Add credits</option>
              <option value="spend">Deduct credits</option>
            </select>
            <input
              type="number"
              placeholder="Amount"
              value={adjustAmount}
              onChange={e => setAdjustAmount(e.target.value)}
              style={{ width: 80, padding: '6px 8px', fontSize: 13, border: `1px solid ${RULE}`, borderRadius: 4 }}
            />
          </div>
          <input
            type="text"
            placeholder="Note (required)"
            value={adjustNote}
            onChange={e => setAdjustNote(e.target.value)}
            style={{ width: '100%', padding: '6px 8px', fontSize: 13, border: `1px solid ${RULE}`, borderRadius: 4, marginBottom: 8, boxSizing: 'border-box' }}
          />
          <button
            onClick={handleAdjust}
            disabled={adjusting || !adjustAmount || !adjustNote}
            style={{ padding: '8px 20px', fontSize: 12, fontWeight: 600, color: '#fff', backgroundColor: adjusting || !adjustAmount || !adjustNote ? MUTED : TC, border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            {adjusting ? 'Saving...' : 'Save Adjustment'}
          </button>
        </div>
      )}

      {/* Transaction History */}
      <div style={{ padding: '16px 24px 8px' }}>
        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Transaction History</p>
      </div>
      {(!history || history.length === 0) ? (
        <p style={{ padding: '12px 24px 20px', fontSize: 13, color: MUTED }}>No transactions yet</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>
              <th style={{ padding: '8px 24px', textAlign: 'left', fontWeight: 600, color: MUTED, fontSize: 11, textTransform: 'uppercase' }}>Date</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: MUTED, fontSize: 11, textTransform: 'uppercase' }}>Description</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: MUTED, fontSize: 11, textTransform: 'uppercase' }}>Source</th>
              <th style={{ padding: '8px 24px', textAlign: 'right', fontWeight: 600, color: MUTED, fontSize: 11, textTransform: 'uppercase' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {history.map(txn => (
              <tr key={txn.id} style={{ borderBottom: `1px solid ${RULE}` }}>
                <td style={{ padding: '10px 24px', color: MUTED, whiteSpace: 'nowrap' }}>
                  {new Date(txn.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                </td>
                <td style={{ padding: '10px 12px', color: INK }}>{txn.description}</td>
                <td style={{ padding: '10px 12px', color: MUTED }}>{txn.source.replace(/_/g, ' ')}</td>
                <td style={{ padding: '10px 24px', textAlign: 'right', fontWeight: 600, color: txn.type === 'earn' ? '#2D8F4E' : INK }}>
                  {txn.type === 'earn' ? '+' : '-'}${parseFloat(txn.amount).toFixed(0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrate into AdminStudentDetail.jsx**

In `frontend/src/pages/AdminStudentDetail.jsx`:

1. Add import at top (near line 7 where StudentFeesTab is imported):
```javascript
import StudentCreditsTab from '../components/StudentCreditsTab';
```

2. Add state variables (near line 137 where `fees` state is):
```javascript
const [creditBalance, setCreditBalance] = useState(0);
const [creditHistory, setCreditHistory] = useState([]);
```

3. In the data fetching useEffect (around line 334 where fees and studio access are fetched), add:
```javascript
api.get(`/credits/balance/${studentData.id}`).then(r => setCreditBalance(r.data.balance || 0)).catch(() => {}),
api.get(`/credits/history/${studentData.id}`).then(r => setCreditHistory(r.data.history || [])).catch(() => {}),
```

4. Add a "Credits" option to the section tabs (find where `section` buttons are rendered — look for 'fees' and 'access' tab buttons). Add a "Credits" button in the same pattern.

5. Add the Credits tab content after the Fees tab block (after line 1262):
```jsx
{/* ── CREDITS TAB ── */}
{section === 'credits' && (
  <StudentCreditsTab
    studentId={student?.id}
    balance={creditBalance}
    history={creditHistory}
    onRefresh={() => {
      api.get(`/credits/balance/${student.id}`).then(r => setCreditBalance(r.data.balance || 0));
      api.get(`/credits/history/${student.id}`).then(r => setCreditHistory(r.data.history || []));
    }}
  />
)}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/StudentCreditsTab.jsx frontend/src/pages/AdminStudentDetail.jsx
git commit -m "feat: add Credits tab to admin student detail page"
```

---

### Task 13: Send Credit Spent Emails on Auto-Offset

**Files:**
- Modify: `server/utils/creditManager.js` (add email sending after spend)

- [ ] **Step 1: Add email notification to spendCredits**

Update the `spendCredits` function in `server/utils/creditManager.js` to send an email after a successful spend. Add after the successful insert:

```javascript
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
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/creditManager.js
git commit -m "feat: send email notification when VES Credits are spent"
```

---

### Task 14: Integration Testing

**Files:** No new files — manual testing across the system

- [ ] **Step 1: Start the dev servers**

```bash
cd server && npm run dev &
cd frontend && npm run dev &
```

- [ ] **Step 2: Test credit balance endpoint**

Pick a known student with `course_purchase_count >= 2` and test:

```bash
curl http://localhost:3000/api/credits/balance/{customerId}
```

Expected: `{"balance": 0}` (no credits granted yet)

- [ ] **Step 3: Test admin adjustment**

```bash
curl -X POST http://localhost:3000/api/credits/adjust \
  -H "Content-Type: application/json" \
  -d '{"customerId": {id}, "type": "earn", "amount": 40, "description": "Test credit"}'
```

Expected: `{"success": true, "transaction": {...}}`

- [ ] **Step 4: Verify balance updated**

```bash
curl http://localhost:3000/api/credits/balance/{customerId}
```

Expected: `{"balance": 40}`

- [ ] **Step 5: Test credit history**

```bash
curl http://localhost:3000/api/credits/history/{customerId}
```

Expected: Array with the test transaction

- [ ] **Step 6: Test delivery order with credit offset**

```bash
curl -X POST http://localhost:3000/api/credits/delivery \
  -H "Content-Type: application/json" \
  -d '{"customerId": {id}, "deliveryType": "self", "pieces": 3}'
```

Expected: `{"success": true, "order": {...}, "creditApplied": 10, "netAmount": 0}`

- [ ] **Step 7: Run retroactive grant in dry-run mode**

```bash
cd server && node scripts/retroactive-credit-grant.js --dry-run
```

Expected: List of eligible students with calculated credits, no DB changes

- [ ] **Step 8: Verify frontend Credits page**

Navigate to `http://localhost:5173/credits` while logged in as a student. Verify:
- Balance card shows correctly
- Transaction history displays
- "Use credits for" section renders

- [ ] **Step 9: Verify admin Credits tab**

Navigate to a student detail page in admin. Click the Credits tab. Verify:
- Balance displays
- Adjust credits form works
- Transaction history table renders

- [ ] **Step 10: Clean up test data**

Delete any test transactions from the database:

```sql
DELETE FROM credit_transactions WHERE description LIKE 'Test%';
DELETE FROM delivery_orders WHERE customer_id = {testId};
```
