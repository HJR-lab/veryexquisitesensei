# CRM Campaign System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-house CRM with manual email campaigns, configurable automated flows, and event invitations with RSVP tracking.

**Architecture:** New route file `server/routes/crm.js` handles all CRM endpoints. Segment resolution in `server/utils/segmentResolver.js`. Cron engine in `server/utils/campaignCron.js` integrated into existing `cohortAutoProcessor.js` startup flow. Frontend page `AdminCRM.jsx` with three tabs (Campaigns, Automation, Events).

**Tech Stack:** Express.js, Supabase PostgreSQL, Resend email, React 18, JWT for RSVP tokens.

**Spec:** `docs/superpowers/specs/2026-05-01-crm-campaign-system-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `server/utils/segmentResolver.js` | Resolve segment keys to customer lists |
| Create | `server/utils/campaignCron.js` | Hourly cron: process automated campaigns + scheduled sends |
| Create | `server/routes/crm.js` | All CRM API endpoints (campaigns, automations, events, RSVP) |
| Create | `server/email-templates/event-invitation.js` | Event invite email with RSVP button |
| Create | `frontend/src/pages/AdminCRM.jsx` | Admin CRM page with 3 tabs |
| Create | `frontend/src/pages/EventRSVP.jsx` | Public RSVP landing page |
| Modify | `server/index.js:192-205` | Register crm routes |
| Modify | `server/utils/cohortAutoProcessor.js:597-606` | Add campaignCron to startup |
| Modify | `frontend/src/App.jsx:44,224` | Add AdminCRM and EventRSVP routes |
| Modify | `frontend/src/components/AdminNav.jsx:143` | Add CRM nav link |

---

## Task 1: Database Tables

**Files:**
- Create: `server/migrations/add_crm_tables.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- CRM Campaign System Tables

-- Campaigns (manual + automated)
CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'manual' CHECK (type IN ('manual', 'automated')),
  subject TEXT,
  html_body TEXT,
  segment TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'active', 'paused')),
  scheduled_at TIMESTAMPTZ,
  trigger_type TEXT CHECK (trigger_type IN ('post_course', 'lapsed', 'credit_expiry', 'welcome')),
  trigger_days INT DEFAULT 7,
  created_by INT REFERENCES customers(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track every email sent per campaign
CREATE TABLE IF NOT EXISTS campaign_sends (
  id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id INT NOT NULL REFERENCES customers(id),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  resend_message_id TEXT,
  UNIQUE(campaign_id, customer_id)
);

-- Delivery/open/bounce events from Resend webhooks
CREATE TABLE IF NOT EXISTS campaign_events (
  id SERIAL PRIMARY KEY,
  campaign_send_id INT NOT NULL REFERENCES campaign_sends(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('delivered', 'opened', 'clicked', 'bounced')),
  event_at TIMESTAMPTZ DEFAULT NOW()
);

-- Special events (workshops, collaborations, anniversary)
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  location TEXT DEFAULT 'VES Pottery Studio, 75 Jalan Kelabu Asap, Singapore 278268',
  max_capacity INT,
  rsvp_deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  target_segment TEXT,
  campaign_id INT REFERENCES campaigns(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RSVP tracking
CREATE TABLE IF NOT EXISTS event_rsvps (
  id SERIAL PRIMARY KEY,
  event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  customer_id INT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'attending', 'declined')),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE(event_id, customer_id)
);

-- Seed default automated campaigns (all start paused)
INSERT INTO campaigns (name, type, subject, html_body, segment, status, trigger_type, trigger_days) VALUES
  ('Post-Course Follow-up', 'automated', 'We miss you at VES! 🎨', '', 'returning', 'paused', 'post_course', 7),
  ('Lapsed Student Re-engagement', 'automated', 'It''s been a while — come back to VES!', '', 'lapsed_60', 'paused', 'lapsed', 60),
  ('Credit Expiry Reminder', 'automated', 'Your VES credits are expiring soon', '', 'has_credits', 'paused', 'credit_expiry', 30),
  ('Welcome Series', 'automated', 'Welcome to VES Pottery Studio!', '', 'all', 'paused', 'welcome', 1)
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign ON campaign_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_customer ON campaign_sends(customer_id);
CREATE INDEX IF NOT EXISTS idx_campaign_events_send ON campaign_events(campaign_send_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_event ON event_rsvps(event_id);
```

- [ ] **Step 2: Run migration against Supabase**

Run in Supabase SQL editor or via CLI. Verify tables exist:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('campaigns', 'campaign_sends', 'campaign_events', 'events', 'event_rsvps');
```
Expected: 5 rows.

- [ ] **Step 3: Commit**

```bash
git add server/migrations/add_crm_tables.sql
git commit -m "feat(crm): add database tables for campaigns, events, RSVPs"
```

---

## Task 2: Segment Resolver

**Files:**
- Create: `server/utils/segmentResolver.js`

- [ ] **Step 1: Create segment resolver**

```javascript
const supabaseDb = require('./supabaseDb');
const supabase = supabaseDb.supabase;

/**
 * Resolve a segment key to a list of customers.
 * @param {string} segmentKey
 * @returns {Promise<Array<{id: number, email: string, first_name: string}>>}
 */
async function resolveSegment(segmentKey) {
  const today = new Date().toISOString().split('T')[0];

  switch (segmentKey) {
    case 'returning': {
      const { data } = await supabase
        .from('customers')
        .select('id, email, first_name')
        .gte('course_purchase_count', 2)
        .not('email', 'is', null);
      return data || [];
    }

    case 'vip': {
      const { data } = await supabase
        .from('customers')
        .select('id, email, first_name')
        .gte('course_purchase_count', 4)
        .not('email', 'is', null);
      return data || [];
    }

    case 'lapsed_30':
    case 'lapsed_60':
    case 'lapsed_90': {
      const days = parseInt(segmentKey.split('_')[1]);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString();

      // Get customers with no active enrollment
      const { data: activeStudents } = await supabase
        .from('course_enrollments')
        .select('student_id')
        .eq('status', 'active');
      const activeIds = (activeStudents || []).map(e => e.student_id);

      // Get customers whose last booking was before cutoff
      const { data: allCustomers } = await supabase
        .from('customers')
        .select('id, email, first_name')
        .not('email', 'is', null)
        .gt('course_purchase_count', 0);

      const results = [];
      for (const c of (allCustomers || [])) {
        if (activeIds.includes(c.id)) continue;
        const { data: lastBooking } = await supabase
          .from('bookings')
          .select('id')
          .eq('student_id', c.id)
          .in('status', ['attended', 'completed'])
          .order('created_at', { ascending: false })
          .limit(1);
        if (lastBooking && lastBooking.length > 0) {
          const { data: bookingDetail } = await supabase
            .from('bookings')
            .select('created_at')
            .eq('id', lastBooking[0].id)
            .single();
          if (bookingDetail && bookingDetail.created_at < cutoffStr) {
            results.push(c);
          }
        }
      }
      return results;
    }

    case 'active': {
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('student_id')
        .eq('status', 'active');
      const studentIds = [...new Set((enrollments || []).map(e => e.student_id))];
      if (studentIds.length === 0) return [];
      const { data } = await supabase
        .from('customers')
        .select('id, email, first_name')
        .in('id', studentIds)
        .not('email', 'is', null);
      return data || [];
    }

    case 'hb_students': {
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('student_id')
        .eq('status', 'active')
        .ilike('course_type', '%handbuilding%');
      const studentIds = [...new Set((enrollments || []).map(e => e.student_id))];
      if (studentIds.length === 0) return [];
      const { data } = await supabase
        .from('customers')
        .select('id, email, first_name')
        .in('id', studentIds)
        .not('email', 'is', null);
      return data || [];
    }

    case 'wt_students': {
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('student_id')
        .eq('status', 'active')
        .ilike('course_type', '%wheelthrowing%');
      const studentIds = [...new Set((enrollments || []).map(e => e.student_id))];
      if (studentIds.length === 0) return [];
      const { data } = await supabase
        .from('customers')
        .select('id, email, first_name')
        .in('id', studentIds)
        .not('email', 'is', null);
      return data || [];
    }

    case 'has_credits': {
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('customer_id, type, amount');
      const balances = {};
      (transactions || []).forEach(t => {
        if (!balances[t.customer_id]) balances[t.customer_id] = 0;
        balances[t.customer_id] += t.type === 'earn' ? t.amount : -t.amount;
      });
      const customerIds = Object.entries(balances)
        .filter(([, bal]) => bal > 0)
        .map(([id]) => parseInt(id));
      if (customerIds.length === 0) return [];
      const { data } = await supabase
        .from('customers')
        .select('id, email, first_name')
        .in('id', customerIds)
        .not('email', 'is', null);
      return data || [];
    }

    case 'members': {
      const { data: memberships } = await supabase
        .from('memberships')
        .select('customer_id')
        .eq('status', 'active');
      const customerIds = [...new Set((memberships || []).map(m => m.customer_id))];
      if (customerIds.length === 0) return [];
      const { data } = await supabase
        .from('customers')
        .select('id, email, first_name')
        .in('id', customerIds)
        .not('email', 'is', null);
      return data || [];
    }

    case 'all':
    default: {
      const { data } = await supabase
        .from('customers')
        .select('id, email, first_name')
        .not('email', 'is', null)
        .neq('email', '');
      return data || [];
    }
  }
}

module.exports = { resolveSegment };
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/segmentResolver.js
git commit -m "feat(crm): add segment resolver for customer targeting"
```

---

## Task 3: Campaign Cron Engine

**Files:**
- Create: `server/utils/campaignCron.js`
- Modify: `server/utils/cohortAutoProcessor.js`

- [ ] **Step 1: Create campaign cron**

```javascript
const supabaseDb = require('./supabaseDb');
const supabase = supabaseDb.supabase;
const { sendEmail } = require('./emailService');
const { wrapEmailTemplate } = require('../email-templates/base');
const { resolveSegment } = require('./segmentResolver');

/**
 * Process all active automated campaigns and scheduled manual campaigns.
 * Called hourly from cohortAutoProcessor.
 */
async function processCampaigns() {
  console.log('[CampaignCron] Processing campaigns...');

  // 1. Process scheduled manual campaigns that are due
  await processScheduledCampaigns();

  // 2. Process active automated campaigns
  await processAutomatedCampaigns();
}

async function processScheduledCampaigns() {
  const now = new Date().toISOString();
  const { data: scheduled } = await supabase
    .from('campaigns')
    .select('*')
    .eq('type', 'manual')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now);

  for (const campaign of (scheduled || [])) {
    console.log(`[CampaignCron] Sending scheduled campaign: ${campaign.name}`);
    await sendCampaignToSegment(campaign);
    await supabase
      .from('campaigns')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', campaign.id);
  }
}

async function processAutomatedCampaigns() {
  const { data: automations } = await supabase
    .from('campaigns')
    .select('*')
    .eq('type', 'automated')
    .eq('status', 'active');

  for (const campaign of (automations || [])) {
    if (!campaign.subject || !campaign.html_body) {
      console.log(`[CampaignCron] Skipping ${campaign.name} — no email content configured`);
      continue;
    }

    const candidates = await resolveTrigger(campaign);
    if (candidates.length === 0) continue;

    // Filter out already-sent customers
    const { data: alreadySent } = await supabase
      .from('campaign_sends')
      .select('customer_id')
      .eq('campaign_id', campaign.id);
    const sentIds = new Set((alreadySent || []).map(s => s.customer_id));
    const toSend = candidates.filter(c => !sentIds.has(c.id));

    if (toSend.length === 0) continue;

    console.log(`[CampaignCron] ${campaign.name}: sending to ${toSend.length} customers`);
    for (const customer of toSend) {
      await sendCampaignEmail(campaign, customer);
    }
  }
}

/**
 * Resolve trigger conditions for an automated campaign.
 * Returns customers who match the trigger right now.
 */
async function resolveTrigger(campaign) {
  const { trigger_type, trigger_days } = campaign;
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - trigger_days);
  const targetDateStr = targetDate.toISOString().split('T')[0];
  const targetDateStart = targetDateStr + 'T00:00:00';
  const targetDateEnd = targetDateStr + 'T23:59:59';

  switch (trigger_type) {
    case 'post_course': {
      // Enrollments completed trigger_days ago
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('student_id')
        .eq('status', 'completed')
        .gte('updated_at', targetDateStart)
        .lte('updated_at', targetDateEnd);
      const studentIds = [...new Set((enrollments || []).map(e => e.student_id))];
      if (studentIds.length === 0) return [];
      const { data } = await supabase
        .from('customers')
        .select('id, email, first_name')
        .in('id', studentIds)
        .not('email', 'is', null);
      return data || [];
    }

    case 'lapsed': {
      // Use segment resolver for lapsed customers
      return resolveSegment(`lapsed_${trigger_days}`);
    }

    case 'credit_expiry': {
      // Credits expiring within trigger_days
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + trigger_days);
      const expiryStr = expiryDate.toISOString().split('T')[0];
      const { data: transactions } = await supabase
        .from('credit_transactions')
        .select('customer_id')
        .eq('type', 'earn')
        .lte('expires_at', expiryStr + 'T23:59:59')
        .gte('expires_at', new Date().toISOString());
      const customerIds = [...new Set((transactions || []).map(t => t.customer_id))];
      if (customerIds.length === 0) return [];
      const { data } = await supabase
        .from('customers')
        .select('id, email, first_name')
        .in('id', customerIds)
        .not('email', 'is', null);
      return data || [];
    }

    case 'welcome': {
      // Enrollments created trigger_days ago
      const { data: enrollments } = await supabase
        .from('course_enrollments')
        .select('student_id')
        .gte('created_at', targetDateStart)
        .lte('created_at', targetDateEnd);
      const studentIds = [...new Set((enrollments || []).map(e => e.student_id))];
      if (studentIds.length === 0) return [];
      const { data } = await supabase
        .from('customers')
        .select('id, email, first_name')
        .in('id', studentIds)
        .not('email', 'is', null);
      return data || [];
    }

    default:
      return [];
  }
}

/**
 * Send a campaign email to a single customer and log the send.
 */
async function sendCampaignEmail(campaign, customer) {
  try {
    const personalizedBody = campaign.html_body
      .replace(/\{\{first_name\}\}/g, customer.first_name || 'there')
      .replace(/\{\{email\}\}/g, customer.email || '');

    const html = wrapEmailTemplate(personalizedBody);
    const result = await sendEmail({
      to: customer.email,
      subject: campaign.subject,
      html,
    });

    if (result.success) {
      await supabase.from('campaign_sends').insert({
        campaign_id: campaign.id,
        customer_id: customer.id,
        resend_message_id: result.messageId,
      });
    }
  } catch (err) {
    console.error(`[CampaignCron] Error sending to ${customer.email}:`, err.message);
  }
}

/**
 * Send a campaign to its entire segment (for manual sends).
 */
async function sendCampaignToSegment(campaign) {
  const customers = await resolveSegment(campaign.segment || 'all');

  // Filter out already-sent
  const { data: alreadySent } = await supabase
    .from('campaign_sends')
    .select('customer_id')
    .eq('campaign_id', campaign.id);
  const sentIds = new Set((alreadySent || []).map(s => s.customer_id));
  const toSend = customers.filter(c => !sentIds.has(c.id));

  console.log(`[CampaignCron] Campaign "${campaign.name}": sending to ${toSend.length} of ${customers.length} customers`);

  let sent = 0;
  for (const customer of toSend) {
    await sendCampaignEmail(campaign, customer);
    sent++;
    // Rate limit: small delay between sends
    if (sent % 10 === 0) await new Promise(r => setTimeout(r, 1000));
  }

  return sent;
}

module.exports = { processCampaigns, sendCampaignToSegment, sendCampaignEmail };
```

- [ ] **Step 2: Integrate into cohortAutoProcessor startup**

In `server/utils/cohortAutoProcessor.js`, add to the startup function (after existing startup tasks around line 604) and to the hourly check:

Add at the top of the file:
```javascript
const { processCampaigns } = require('./campaignCron');
```

Add to the `setTimeout` block (around line 604):
```javascript
processCampaigns().catch(console.error);
```

Add to the `runDailyCheck` function, in the hourly block (where `minute === 30`):
```javascript
processCampaigns().catch(console.error);
```

- [ ] **Step 3: Commit**

```bash
git add server/utils/campaignCron.js server/utils/cohortAutoProcessor.js
git commit -m "feat(crm): add campaign cron engine with trigger resolution"
```

---

## Task 4: CRM API Routes

**Files:**
- Create: `server/routes/crm.js`
- Modify: `server/index.js`

- [ ] **Step 1: Create CRM routes**

```javascript
const supabaseDb = require('../utils/supabaseDb');
const supabase = supabaseDb.supabase;
const { resolveSegment } = require('../utils/segmentResolver');
const { sendCampaignToSegment, sendCampaignEmail } = require('../utils/campaignCron');
const { sendEmail } = require('../utils/emailService');
const { wrapEmailTemplate } = require('../email-templates/base');
const jwt = require('jsonwebtoken');

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler }) {

  // ─── CAMPAIGNS ────────────────────────────────────────────────

  // List all campaigns
  app.get('/api/admin/crm/campaigns', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    // Attach send counts
    const enriched = [];
    for (const c of (campaigns || [])) {
      const { count: sentCount } = await supabase
        .from('campaign_sends')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', c.id);

      const { count: openCount } = await supabase
        .from('campaign_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'opened')
        .in('campaign_send_id', 
          (await supabase.from('campaign_sends').select('id').eq('campaign_id', c.id)).data?.map(s => s.id) || []
        );

      enriched.push({ ...c, sent_count: sentCount || 0, open_count: openCount || 0 });
    }

    res.json(enriched);
  }));

  // Create campaign
  app.post('/api/admin/crm/campaigns', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { name, type, subject, html_body, segment, trigger_type, trigger_days, scheduled_at } = req.body;
    if (!name) return res.status(400).json({ error: 'Campaign name is required' });

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        name,
        type: type || 'manual',
        subject,
        html_body,
        segment: segment || 'all',
        status: 'draft',
        trigger_type,
        trigger_days: trigger_days || 7,
        scheduled_at,
        created_by: req.user.dbCustomerId,
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  }));

  // Update campaign
  app.patch('/api/admin/crm/campaigns/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    delete updates.created_at;
    delete updates.created_by;

    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  }));

  // Delete draft campaign
  app.delete('/api/admin/crm/campaigns/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { data: campaign } = await supabase.from('campaigns').select('status').eq('id', id).single();
    if (campaign?.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft campaigns can be deleted' });
    }
    await supabase.from('campaigns').delete().eq('id', id);
    res.json({ message: 'Campaign deleted' });
  }));

  // Send campaign immediately
  app.post('/api/admin/crm/campaigns/:id/send', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', id).single();
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (!campaign.subject || !campaign.html_body) {
      return res.status(400).json({ error: 'Campaign must have subject and body before sending' });
    }

    const sent = await sendCampaignToSegment(campaign);
    await supabase
      .from('campaigns')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', id);

    res.json({ message: `Campaign sent to ${sent} recipients`, sent });
  }));

  // Campaign stats
  app.get('/api/admin/crm/campaigns/:id/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { data: sends } = await supabase
      .from('campaign_sends')
      .select('id, customer_id, sent_at, resend_message_id')
      .eq('campaign_id', id);

    const sendIds = (sends || []).map(s => s.id);
    let events = [];
    if (sendIds.length > 0) {
      const { data } = await supabase
        .from('campaign_events')
        .select('campaign_send_id, event_type, event_at')
        .in('campaign_send_id', sendIds);
      events = data || [];
    }

    const delivered = events.filter(e => e.event_type === 'delivered').length;
    const opened = events.filter(e => e.event_type === 'opened').length;
    const clicked = events.filter(e => e.event_type === 'clicked').length;
    const bounced = events.filter(e => e.event_type === 'bounced').length;

    res.json({
      total_sent: sends?.length || 0,
      delivered,
      opened,
      clicked,
      bounced,
      open_rate: sends?.length ? Math.round((opened / sends.length) * 100) : 0,
    });
  }));

  // Preview segment audience
  app.get('/api/admin/crm/segments/:key/preview', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { key } = req.params;
    const customers = await resolveSegment(key);
    res.json({
      count: customers.length,
      sample: customers.slice(0, 10).map(c => ({ id: c.id, name: c.first_name, email: c.email })),
    });
  }));

  // ─── AUTOMATIONS ──────────────────────────────────────────────

  // List automated campaigns
  app.get('/api/admin/crm/automations', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { data: automations } = await supabase
      .from('campaigns')
      .select('*')
      .eq('type', 'automated')
      .order('created_at', { ascending: true });

    const enriched = [];
    for (const a of (automations || [])) {
      const { count: totalSends } = await supabase
        .from('campaign_sends')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', a.id);

      const { data: lastSend } = await supabase
        .from('campaign_sends')
        .select('sent_at')
        .eq('campaign_id', a.id)
        .order('sent_at', { ascending: false })
        .limit(1);

      enriched.push({
        ...a,
        total_sends: totalSends || 0,
        last_sent_at: lastSend?.[0]?.sent_at || null,
      });
    }

    res.json(enriched);
  }));

  // Update automation (toggle, trigger_days, subject, body)
  app.patch('/api/admin/crm/automations/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, trigger_days, subject, html_body, segment } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (status) updates.status = status;
    if (trigger_days !== undefined) updates.trigger_days = trigger_days;
    if (subject !== undefined) updates.subject = subject;
    if (html_body !== undefined) updates.html_body = html_body;
    if (segment !== undefined) updates.segment = segment;

    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .eq('type', 'automated')
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  }));

  // ─── EVENTS ───────────────────────────────────────────────────

  // List events
  app.get('/api/admin/crm/events', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { data: eventsList } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: false });

    const enriched = [];
    for (const evt of (eventsList || [])) {
      const { data: rsvps } = await supabase
        .from('event_rsvps')
        .select('status')
        .eq('event_id', evt.id);

      const attending = (rsvps || []).filter(r => r.status === 'attending').length;
      const declined = (rsvps || []).filter(r => r.status === 'declined').length;
      const invited = (rsvps || []).length;

      enriched.push({ ...evt, rsvp_attending: attending, rsvp_declined: declined, rsvp_invited: invited });
    }

    res.json(enriched);
  }));

  // Create event
  app.post('/api/admin/crm/events', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { title, description, event_date, location, max_capacity, rsvp_deadline, target_segment } = req.body;
    if (!title || !event_date) return res.status(400).json({ error: 'Title and event date are required' });

    const { data, error } = await supabase
      .from('events')
      .insert({
        title, description, event_date, location,
        max_capacity: max_capacity || null,
        rsvp_deadline, target_segment,
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  }));

  // Update event
  app.patch('/api/admin/crm/events/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    delete updates.id;
    const { data, error } = await supabase
      .from('events')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  }));

  // Send event invitations
  app.post('/api/admin/crm/events/:id/invite', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { data: event } = await supabase.from('events').select('*').eq('id', id).single();
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const customers = await resolveSegment(event.target_segment || 'all');

    // Filter out already invited
    const { data: existing } = await supabase
      .from('event_rsvps')
      .select('customer_id')
      .eq('event_id', parseInt(id));
    const existingIds = new Set((existing || []).map(r => r.customer_id));
    const toInvite = customers.filter(c => !existingIds.has(c.id));

    let sent = 0;
    for (const customer of toInvite) {
      const token = jwt.sign(
        { customerId: customer.id, eventId: parseInt(id) },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      const eventDate = new Date(event.event_date).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });

      const rsvpUrl = `https://club.ves.sg/events/${id}/rsvp?token=${token}`;
      const body = `
        <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">
          You're Invited!
        </h1>
        <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">
          Hi ${customer.first_name || 'there'}, we'd love for you to join us for a special event at VES!
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
          <tr><td style="padding: 16px 20px;">
            <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #9E4A1E; text-transform: uppercase; letter-spacing: 0.05em;">Event Details</p>
            <p style="margin: 0 0 2px; font-size: 15px; font-weight: 600; color: #282828;">${event.title}</p>
            <p style="margin: 0 0 2px; font-size: 15px; color: #282828;">${eventDate}</p>
            <p style="margin: 0; font-size: 15px; color: #282828;">${event.location || 'VES Pottery Studio'}</p>
          </td></tr>
        </table>
        ${event.description ? `<p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">${event.description}</p>` : ''}
        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0 0;">
          <tr><td align="center">
            <a href="${rsvpUrl}" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
              RSVP Now
            </a>
          </td></tr>
        </table>
      `;

      const result = await sendEmail({
        to: customer.email,
        subject: `VES — You're Invited: ${event.title}`,
        html: wrapEmailTemplate(body),
      });

      if (result.success) {
        await supabase.from('event_rsvps').insert({
          event_id: parseInt(id),
          customer_id: customer.id,
          status: 'invited',
        });
        sent++;
      }

      if (sent % 10 === 0) await new Promise(r => setTimeout(r, 1000));
    }

    await supabase
      .from('events')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', id);

    res.json({ message: `Invitations sent to ${sent} people`, sent });
  }));

  // Get RSVPs for an event
  app.get('/api/admin/crm/events/:id/rsvps', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { data } = await supabase
      .from('event_rsvps')
      .select('*, customers:customer_id(id, first_name, last_name, email)')
      .eq('event_id', req.params.id)
      .order('responded_at', { ascending: false });
    res.json(data || []);
  }));

  // ─── PUBLIC RSVP ──────────────────────────────────────────────

  // Public RSVP endpoint (no auth — uses JWT token)
  app.post('/api/events/:eventId/rsvp', asyncHandler(async (req, res) => {
    const { token, response } = req.body;
    if (!token || !response) return res.status(400).json({ error: 'Token and response required' });
    if (!['attending', 'declined'].includes(response)) {
      return res.status(400).json({ error: 'Response must be attending or declined' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired invitation link' });
    }

    if (parseInt(req.params.eventId) !== decoded.eventId) {
      return res.status(400).json({ error: 'Token does not match this event' });
    }

    // Check capacity if attending
    if (response === 'attending') {
      const { data: event } = await supabase.from('events').select('max_capacity').eq('id', decoded.eventId).single();
      if (event?.max_capacity) {
        const { count } = await supabase
          .from('event_rsvps')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', decoded.eventId)
          .eq('status', 'attending');
        if (count >= event.max_capacity) {
          return res.status(400).json({ error: 'Sorry, this event is now full' });
        }
      }
    }

    const { error } = await supabase
      .from('event_rsvps')
      .update({ status: response, responded_at: new Date().toISOString() })
      .eq('event_id', decoded.eventId)
      .eq('customer_id', decoded.customerId);

    if (error) throw error;
    res.json({ message: response === 'attending' ? 'See you there!' : 'Maybe next time!' });
  }));

  // Get event details (public, for RSVP page)
  app.get('/api/events/:eventId', asyncHandler(async (req, res) => {
    const { data } = await supabase
      .from('events')
      .select('id, title, description, event_date, location, max_capacity, rsvp_deadline')
      .eq('id', req.params.eventId)
      .single();
    if (!data) return res.status(404).json({ error: 'Event not found' });

    const { count: attendingCount } = await supabase
      .from('event_rsvps')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', data.id)
      .eq('status', 'attending');

    res.json({ ...data, attending_count: attendingCount || 0 });
  }));

  // ─── RESEND WEBHOOK ───────────────────────────────────────────

  app.post('/api/webhooks/resend', asyncHandler(async (req, res) => {
    const { type, data } = req.body;
    if (!data?.email_id) return res.json({ received: true });

    const eventMap = {
      'email.delivered': 'delivered',
      'email.opened': 'opened',
      'email.clicked': 'clicked',
      'email.bounced': 'bounced',
    };

    const eventType = eventMap[type];
    if (!eventType) return res.json({ received: true });

    // Find the campaign_send by resend_message_id
    const { data: send } = await supabase
      .from('campaign_sends')
      .select('id')
      .eq('resend_message_id', data.email_id)
      .maybeSingle();

    if (send) {
      await supabase.from('campaign_events').insert({
        campaign_send_id: send.id,
        event_type: eventType,
      });
    }

    res.json({ received: true });
  }));
};
```

- [ ] **Step 2: Register in index.js**

In `server/index.js`, add after the existing route registrations (around line 205):

```javascript
require('./routes/crm')(app, deps);
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/crm.js server/index.js
git commit -m "feat(crm): add CRM API routes for campaigns, automations, events, RSVP"
```

---

## Task 5: Admin CRM Frontend Page

**Files:**
- Create: `frontend/src/pages/AdminCRM.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/AdminNav.jsx`

- [ ] **Step 1: Create AdminCRM.jsx**

Build the page with three tabs (Campaigns, Automation, Events) following the AdminEmails.jsx pattern. Use inline styles with the VES design system colors (TC=#C4622D, TC_LIGHT=#F9EDE6, TC_DARK=#9E4A1E, INK=#282828, MUTED=#888888, RULE=#E8E0DA).

The page should include:

**Campaigns tab:**
- List of campaigns with name, segment, status, sent count, open rate
- "New Campaign" button → form with name, subject, HTML body textarea, segment dropdown, send/schedule buttons
- Preview button that shows the email wrapped in VES template
- Stats view per campaign (sent, delivered, opened, bounced)

**Automation tab:**
- List of 4 automated flows with toggle switch (active/paused)
- Editable fields: trigger_days, subject, html_body
- Audience preview count per flow
- Last sent date + total sends
- "Configure" button opens edit form for each automation — must be fully configured before activating

**Events tab:**
- Event list with title, date, RSVP counts
- "New Event" form: title, description, date, location, capacity, segment
- "Send Invites" button per event
- RSVP breakdown (attending/declined/no response)

This is a large component. Build it as a single file following AdminEmails.jsx patterns — inline styles, useState for all state, api calls via the existing axios instance.

- [ ] **Step 2: Add route in App.jsx**

Add lazy import at the top (around line 44):
```javascript
const AdminCRM = lazy(() => import('./pages/AdminCRM'));
```

Add route inside the admin routes block (around line 224):
```javascript
<Route path="crm" element={<AdminCRM />} />
```

- [ ] **Step 3: Add nav link in AdminNav.jsx**

Add after the "Emails" nav item (around line 143):
```javascript
{ label: 'CRM', href: '/admin/crm' },
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/AdminCRM.jsx frontend/src/App.jsx frontend/src/components/AdminNav.jsx
git commit -m "feat(crm): add admin CRM page with campaigns, automation, events tabs"
```

---

## Task 6: Public RSVP Page

**Files:**
- Create: `frontend/src/pages/EventRSVP.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create EventRSVP.jsx**

Public page (no auth required) at `/events/:eventId/rsvp?token=<jwt>`. Shows event details fetched from `GET /api/events/:eventId` and two buttons (Attend / Decline). On click, calls `POST /api/events/:eventId/rsvp` with the token and response. Shows confirmation message after.

Use VES branding (TC colors, centered card layout, Atak font via Tailwind).

- [ ] **Step 2: Add public route in App.jsx**

Add outside the admin route block, as a public route:
```javascript
<Route path="/events/:eventId/rsvp" element={<EventRSVP />} />
```

Add lazy import:
```javascript
const EventRSVP = lazy(() => import('./pages/EventRSVP'));
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/EventRSVP.jsx frontend/src/App.jsx
git commit -m "feat(crm): add public event RSVP page"
```

---

## Task 7: Integration Test & Polish

- [ ] **Step 1: Run migration and verify tables**
- [ ] **Step 2: Start backend and verify all endpoints return 200**
- [ ] **Step 3: Start frontend and verify CRM page loads with 3 tabs**
- [ ] **Step 4: Create a test manual campaign, preview segment, send**
- [ ] **Step 5: Verify automated flows appear with toggle controls**
- [ ] **Step 6: Create test event, send invites, verify RSVP page works**
- [ ] **Step 7: Final commit and push**

```bash
git push
```
