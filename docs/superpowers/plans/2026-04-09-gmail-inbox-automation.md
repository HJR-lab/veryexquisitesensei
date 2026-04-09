# Gmail Inbox Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-classify incoming student emails and draft replies that redirect them to club.ves.sg for self-service.

**Architecture:** Cron polls Gmail every 5 min, OpenAI classifies + drafts replies, admin reviews and sends from `/admin/inbox`. OAuth2 refresh token for Gmail access, stored in admin_settings.

**Tech Stack:** googleapis (Gmail API), OpenAI gpt-4o, Express routes, Supabase (inbox_messages table), React admin page

---

## File Structure

```
server/
  routes/inbox.js            — Admin inbox API endpoints + OAuth callback
  utils/gmailClient.js       — Gmail OAuth2 setup, read/send/modify helpers
  utils/inboxProcessor.js    — Fetch emails, classify with OpenAI, draft replies
  
frontend/
  src/pages/AdminInbox.jsx   — Inbox list + detail + draft editing UI
```

Existing files modified:
- `server/package.json` — add googleapis dependency
- `server/index.js` — register inbox routes + start inbox cron
- `server/utils/cohortAutoProcessor.js` — add inbox polling to existing cron
- `frontend/src/App.jsx` — add /admin/inbox route
- `frontend/src/components/AdminLayout.jsx` — add Inbox nav item with badge

---

### Task 1: Database Migration — inbox_messages table

**Files:**
- Create: `server/migrations/inbox_messages.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
CREATE TABLE IF NOT EXISTS inbox_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  gmail_message_id text UNIQUE NOT NULL,
  gmail_thread_id text,
  from_email text NOT NULL,
  from_name text,
  subject text,
  body_snippet text,
  received_at timestamptz,
  category text DEFAULT 'general',
  confidence float DEFAULT 0,
  summary text,
  draft_reply text,
  student_id int REFERENCES customers(id) ON DELETE SET NULL,
  status text DEFAULT 'new',
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_inbox_messages_status ON inbox_messages(status);
CREATE INDEX idx_inbox_messages_category ON inbox_messages(category);
CREATE INDEX idx_inbox_messages_gmail_id ON inbox_messages(gmail_message_id);

ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Run the migration against Supabase**

Run via Supabase MCP `execute_sql` tool or dashboard SQL editor with project ID `fpdbfbxpthmaceuspcrf`.

- [ ] **Step 3: Commit**

```bash
git add server/migrations/inbox_messages.sql
git commit -m "feat: add inbox_messages table for email automation"
```

---

### Task 2: Install googleapis dependency

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Install the package**

```bash
cd server && npm install googleapis
```

- [ ] **Step 2: Verify installation**

```bash
node -e "const { google } = require('googleapis'); console.log('googleapis loaded:', typeof google.gmail)"
```

Expected: `googleapis loaded: function`

- [ ] **Step 3: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "feat: add googleapis for Gmail API integration"
```

---

### Task 3: Gmail OAuth2 Client

**Files:**
- Create: `server/utils/gmailClient.js`

- [ ] **Step 1: Create the Gmail client module**

```javascript
const { google } = require('googleapis');
const supabaseDb = require('./supabaseDb');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Get the authorization URL for Gmail consent screen
 */
function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

/**
 * Exchange auth code for tokens and store refresh token
 */
async function handleCallback(code) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  // Store refresh token in admin_settings
  const { error } = await supabaseDb.supabase
    .from('admin_settings')
    .upsert({
      key: 'gmail_refresh_token',
      value: tokens.refresh_token || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

  if (error) throw error;
  return tokens;
}

/**
 * Get an authenticated Gmail client using stored refresh token
 * Returns null if not connected
 */
async function getGmailClient() {
  const { data } = await supabaseDb.supabase
    .from('admin_settings')
    .select('value')
    .eq('key', 'gmail_refresh_token')
    .maybeSingle();

  if (!data || !data.value) return null;

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: data.value });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Fetch unread emails from the last N days
 */
async function fetchUnreadEmails(days = 7) {
  const gmail = await getGmailClient();
  if (!gmail) return [];

  const after = Math.floor(Date.now() / 1000) - (days * 86400);
  const query = `is:unread after:${after} -category:promotions -category:social -from:noreply -from:no-reply`;

  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 50,
  });

  if (!res.data.messages || res.data.messages.length === 0) return [];

  const emails = [];
  for (const msg of res.data.messages) {
    const full = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'full',
    });

    const headers = full.data.payload.headers;
    const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    // Skip emails with unsubscribe header (newsletters)
    if (getHeader('List-Unsubscribe')) continue;

    // Extract plain text body
    let body = '';
    const parts = full.data.payload.parts || [full.data.payload];
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        body = Buffer.from(part.body.data, 'base64').toString('utf-8');
        break;
      }
    }
    if (!body) {
      // Fallback: use snippet
      body = full.data.snippet || '';
    }

    const fromRaw = getHeader('From');
    const fromMatch = fromRaw.match(/^(.+?)\s*<(.+?)>$/);

    emails.push({
      gmailMessageId: full.data.id,
      gmailThreadId: full.data.threadId,
      fromName: fromMatch ? fromMatch[1].replace(/"/g, '').trim() : fromRaw,
      fromEmail: fromMatch ? fromMatch[2] : fromRaw,
      subject: getHeader('Subject'),
      body: body.substring(0, 2000), // Limit for OpenAI context
      snippet: full.data.snippet,
      receivedAt: new Date(parseInt(full.data.internalDate)),
    });
  }

  return emails;
}

/**
 * Send a reply to a Gmail thread
 */
async function sendReply({ to, subject, body, threadId, messageId }) {
  const gmail = await getGmailClient();
  if (!gmail) throw new Error('Gmail not connected');

  const raw = [
    `To: ${to}`,
    `Subject: Re: ${subject}`,
    `In-Reply-To: ${messageId}`,
    `References: ${messageId}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  const encoded = Buffer.from(raw).toString('base64url');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encoded,
      threadId: threadId,
    },
  });

  return res.data;
}

/**
 * Check if Gmail is connected
 */
async function isConnected() {
  const gmail = await getGmailClient();
  if (!gmail) return false;
  try {
    await gmail.users.getProfile({ userId: 'me' });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  getAuthUrl,
  handleCallback,
  getGmailClient,
  fetchUnreadEmails,
  sendReply,
  isConnected,
};
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/gmailClient.js
git commit -m "feat: Gmail OAuth2 client with read/send helpers"
```

---

### Task 4: Inbox Processor — Classification & Draft Generation

**Files:**
- Create: `server/utils/inboxProcessor.js`

- [ ] **Step 1: Create the inbox processor module**

```javascript
const OpenAI = require('openai');
const supabaseDb = require('./supabaseDb');
const gmailClient = require('./gmailClient');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CATEGORIES = [
  'piece_collection',
  'makeup_class',
  'firing_enquiry',
  'next_cohort',
  'membership',
  'studio_access',
  'general',
];

/**
 * Look up student context by email
 */
async function getStudentContext(email) {
  const { data: customer } = await supabaseDb.supabase
    .from('customers')
    .select('id, first_name, last_name, email, customer_type')
    .eq('email', email)
    .maybeSingle();

  if (!customer) return null;

  // Fetch enrollments
  const { data: enrollments } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('course_type, course_title, course_identifier, status, class_credits_remaining, number_of_weeks')
    .eq('student_id', customer.id)
    .in('status', ['active', 'pending', 'upcoming']);

  // Fetch upcoming bookings count
  const today = new Date().toISOString().split('T')[0];
  const { count: upcomingBookings } = await supabaseDb.supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', customer.id)
    .eq('status', 'booked')
    .gte('class_instance_id', 0); // just need the count

  // Fetch pottery pieces
  const { data: pieces } = await supabaseDb.supabase
    .from('pottery_pieces')
    .select('id, title, status, stage')
    .eq('student_id', customer.id)
    .in('status', ['in_progress', 'firing', 'ready', 'glazing']);

  // Fetch membership
  const { data: membership } = await supabaseDb.supabase
    .from('memberships')
    .select('status, start_date, end_date')
    .eq('customer_id', customer.id)
    .eq('status', 'active')
    .maybeSingle();

  return {
    id: customer.id,
    name: `${customer.first_name} ${customer.last_name}`.trim(),
    email: customer.email,
    customerType: customer.customer_type,
    enrollments: enrollments || [],
    upcomingBookings: upcomingBookings || 0,
    pieces: pieces || [],
    membership: membership || null,
  };
}

/**
 * Classify email and generate draft reply using OpenAI
 */
async function classifyAndDraft(email, studentContext) {
  const studentInfo = studentContext
    ? `Student: ${studentContext.name} (${studentContext.email})
Type: ${studentContext.customerType}
Enrollments: ${studentContext.enrollments.map(e => `${e.course_title} (${e.status}, ${e.class_credits_remaining || 0} credits left)`).join(', ') || 'None'}
Upcoming bookings: ${studentContext.upcomingBookings}
Pieces in studio: ${studentContext.pieces.map(p => `${p.title || 'Untitled'} (${p.stage || p.status})`).join(', ') || 'None'}
Membership: ${studentContext.membership ? `Active until ${studentContext.membership.end_date}` : 'None'}`
    : 'No student record found for this email address.';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are VES Studio's email assistant. Classify the email into exactly one category: ${CATEGORIES.join(', ')}.

Draft a concise, warm reply that:
- Acknowledges their specific question in 1 sentence
- Provides relevant data from their student record if available
- Directs them to the specific club.ves.sg page where they can self-serve:
  - piece_collection or firing_enquiry → club.ves.sg/dashboard
  - makeup_class → club.ves.sg/classes (mention credits remaining)
  - next_cohort → club.ves.sg/classes (mention upcoming courses/spots)
  - membership → club.ves.sg/membership
  - studio_access → club.ves.sg/studio-access
  - general → club.ves.sg/dashboard
- Keep it under 100 words
- Sign off as "Eve, Ves Studio"

Respond as JSON: { "category": "...", "confidence": 0.0-1.0, "summary": "one line summary", "draftReply": "the reply text" }`
      },
      {
        role: 'user',
        content: `From: ${email.fromName} <${email.fromEmail}>
Subject: ${email.subject}
Body: ${email.body}

Student data:
${studentInfo}`
      }
    ],
  });

  try {
    return JSON.parse(response.choices[0].message.content);
  } catch {
    return {
      category: 'general',
      confidence: 0,
      summary: 'Failed to classify',
      draftReply: '',
    };
  }
}

/**
 * Process new emails: fetch from Gmail, classify, store in DB
 * Returns number of new emails processed
 */
async function processNewEmails() {
  const connected = await gmailClient.isConnected();
  if (!connected) {
    console.log('[Inbox] Gmail not connected, skipping');
    return 0;
  }

  const emails = await gmailClient.fetchUnreadEmails(7);
  let processed = 0;

  for (const email of emails) {
    // Skip if already processed
    const { data: existing } = await supabaseDb.supabase
      .from('inbox_messages')
      .select('id')
      .eq('gmail_message_id', email.gmailMessageId)
      .maybeSingle();

    if (existing) continue;

    // Match sender to student
    const studentContext = await getStudentContext(email.fromEmail);

    // Classify and draft
    const result = await classifyAndDraft(email, studentContext);

    // Store in DB
    const { error } = await supabaseDb.supabase
      .from('inbox_messages')
      .insert({
        gmail_message_id: email.gmailMessageId,
        gmail_thread_id: email.gmailThreadId,
        from_email: email.fromEmail,
        from_name: email.fromName,
        subject: email.subject,
        body_snippet: email.body.substring(0, 500),
        received_at: email.receivedAt.toISOString(),
        category: result.category,
        confidence: result.confidence,
        summary: result.summary,
        draft_reply: result.draftReply,
        student_id: studentContext?.id || null,
        status: result.draftReply ? 'draft_ready' : 'new',
      });

    if (error) {
      console.error(`[Inbox] Failed to store email ${email.gmailMessageId}:`, error.message);
    } else {
      processed++;
      console.log(`[Inbox] Processed: "${email.subject}" → ${result.category} (${Math.round(result.confidence * 100)}%)`);
    }
  }

  return processed;
}

module.exports = {
  processNewEmails,
  getStudentContext,
  classifyAndDraft,
};
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/inboxProcessor.js
git commit -m "feat: inbox processor — classify emails and draft replies with OpenAI"
```

---

### Task 5: Backend API Routes

**Files:**
- Create: `server/routes/inbox.js`

- [ ] **Step 1: Create the inbox routes**

```javascript
module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler }) {
  const supabaseDb = require('../utils/supabaseDb');
  const gmailClient = require('../utils/gmailClient');
  const inboxProcessor = require('../utils/inboxProcessor');

  // ── Gmail OAuth ───────────────────────────────────────────────────────────
  
  // Check Gmail connection status
  app.get('/api/admin/settings/gmail', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const connected = await gmailClient.isConnected();
    res.json({ connected });
  }));

  // Start OAuth flow
  app.get('/api/admin/settings/gmail/connect', authenticateToken, requireAdmin, (req, res) => {
    const url = gmailClient.getAuthUrl();
    res.json({ url });
  });

  // OAuth callback
  app.get('/api/admin/settings/gmail/callback', asyncHandler(async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'No auth code provided' });

    await gmailClient.handleCallback(code);
    // Redirect back to admin inbox
    const frontendUrl = process.env.FRONTEND_URL || 'https://club.ves.sg';
    res.redirect(`${frontendUrl}/admin/inbox?gmail=connected`);
  }));

  // ── Inbox ─────────────────────────────────────────────────────────────────

  // List inbox messages
  app.get('/api/admin/inbox', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { category, status } = req.query;

    let query = supabaseDb.supabase
      .from('inbox_messages')
      .select('*, customers(first_name, last_name, email)')
      .order('received_at', { ascending: false })
      .limit(100);

    if (category && category !== 'all') query = query.eq('category', category);
    if (status && status !== 'all') query = query.eq('status', status);
    else query = query.in('status', ['new', 'draft_ready']); // Default: hide sent/dismissed

    const { data, error } = await query;
    if (error) throw error;

    res.json({ messages: data || [] });
  }));

  // Get inbox stats (for nav badge)
  app.get('/api/admin/inbox/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { data, error } = await supabaseDb.supabase
      .from('inbox_messages')
      .select('category, status')
      .in('status', ['new', 'draft_ready']);

    if (error) throw error;

    const stats = { total: 0 };
    (data || []).forEach(m => {
      stats.total++;
      stats[m.category] = (stats[m.category] || 0) + 1;
    });

    res.json(stats);
  }));

  // Manual refresh — trigger processing
  app.post('/api/admin/inbox/refresh', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const processed = await inboxProcessor.processNewEmails();
    res.json({ processed, message: `Processed ${processed} new email(s)` });
  }));

  // Update draft text
  app.put('/api/admin/inbox/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { draft_reply } = req.body;
    const { data, error } = await supabaseDb.supabase
      .from('inbox_messages')
      .update({ draft_reply, status: 'draft_ready' })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  }));

  // Send reply
  app.post('/api/admin/inbox/:id/send', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { data: msg, error } = await supabaseDb.supabase
      .from('inbox_messages')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !msg) return res.status(404).json({ error: 'Message not found' });
    if (!msg.draft_reply) return res.status(400).json({ error: 'No draft to send' });

    // Send via Gmail
    await gmailClient.sendReply({
      to: msg.from_email,
      subject: msg.subject,
      body: msg.draft_reply,
      threadId: msg.gmail_thread_id,
      messageId: msg.gmail_message_id,
    });

    // Update status
    await supabaseDb.supabase
      .from('inbox_messages')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', msg.id);

    console.log(`[Inbox] Sent reply to ${msg.from_email} re: ${msg.subject}`);
    res.json({ success: true, message: `Reply sent to ${msg.from_email}` });
  }));

  // Dismiss message
  app.post('/api/admin/inbox/:id/dismiss', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { error } = await supabaseDb.supabase
      .from('inbox_messages')
      .update({ status: 'dismissed' })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  }));
};
```

- [ ] **Step 2: Register routes in server/index.js**

Add after the existing route registrations (around line 192):

```javascript
require('./routes/inbox')(app, deps);
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/inbox.js server/index.js
git commit -m "feat: admin inbox API routes — list, refresh, send, dismiss"
```

---

### Task 6: Cron Integration

**Files:**
- Modify: `server/utils/cohortAutoProcessor.js`

- [ ] **Step 1: Add inbox processing to the existing cron**

At the top of the file, add the require:

```javascript
const inboxProcessor = require('./inboxProcessor');
```

Inside the `runDailyCheck` function body (after the 2:00 AM block), add a 5-minute interval check:

```javascript
// Run inbox processing every 5 minutes
if (minute % 5 === 0) {
  inboxProcessor.processNewEmails().catch(err => {
    console.error('[Inbox Cron] Error processing emails:', err.message);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/cohortAutoProcessor.js
git commit -m "feat: add inbox email processing to 5-minute cron"
```

---

### Task 7: Frontend — Admin Inbox Page

**Files:**
- Create: `frontend/src/pages/AdminInbox.jsx`

- [ ] **Step 1: Create the AdminInbox component**

```jsx
import { useState, useEffect } from 'react';
import api from '../utils/api';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';
const GREEN    = '#1E6B1E';

const CATEGORY_LABELS = {
  piece_collection: 'Pieces',
  makeup_class: 'Makeup',
  firing_enquiry: 'Firing',
  next_cohort: 'Next Cohort',
  membership: 'Membership',
  studio_access: 'Studio',
  general: 'General',
};

const CATEGORY_COLORS = {
  piece_collection: '#8B5E3C',
  makeup_class: '#2E7D32',
  firing_enquiry: '#D84315',
  next_cohort: '#1565C0',
  membership: '#6A1B9A',
  studio_access: '#00695C',
  general: MUTED,
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AdminInbox() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [editingDraft, setEditingDraft] = useState(null);
  const [gmailConnected, setGmailConnected] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);

  useEffect(() => {
    loadMessages();
    checkGmail();
  }, [filter]);

  const checkGmail = async () => {
    try {
      const { data } = await api.get('/admin/settings/gmail');
      setGmailConnected(data.connected);
    } catch { setGmailConnected(false); }
  };

  const loadMessages = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter !== 'all') params.category = filter;
      const { data } = await api.get('/admin/inbox', { params });
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Failed to load inbox:', err);
    } finally { setLoading(false); }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data } = await api.post('/admin/inbox/refresh');
      setStatusMsg(`Processed ${data.processed} new email(s)`);
      await loadMessages();
    } catch (err) {
      setStatusMsg(err.response?.data?.error || 'Failed to refresh');
    } finally { setRefreshing(false); }
  };

  const handleSend = async (msg) => {
    if (!confirm(`Send reply to ${msg.from_email}?`)) return;
    try {
      await api.post(`/admin/inbox/${msg.id}/send`);
      setStatusMsg(`Reply sent to ${msg.from_email}`);
      await loadMessages();
    } catch (err) {
      setStatusMsg(err.response?.data?.error || 'Failed to send');
    }
  };

  const handleDismiss = async (msg) => {
    try {
      await api.post(`/admin/inbox/${msg.id}/dismiss`);
      await loadMessages();
    } catch (err) {
      setStatusMsg('Failed to dismiss');
    }
  };

  const handleSaveDraft = async (msg) => {
    try {
      await api.put(`/admin/inbox/${msg.id}`, { draft_reply: editingDraft });
      setEditingDraft(null);
      await loadMessages();
    } catch (err) {
      setStatusMsg('Failed to save draft');
    }
  };

  const connectGmail = async () => {
    try {
      const { data } = await api.get('/admin/settings/gmail/connect');
      window.location.href = data.url;
    } catch (err) {
      setStatusMsg('Failed to start Gmail connection');
    }
  };

  const categories = ['all', ...Object.keys(CATEGORY_LABELS)];

  // ── Gmail not connected state ──────────────────────────────────────────────
  if (gmailConnected === false) {
    return (
      <div style={{ padding: '40px 24px', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TC, marginBottom: '6px' }}>Admin</div>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: INK, marginBottom: '12px' }}>Inbox</h1>
        <p style={{ fontSize: '14px', color: MUTED, marginBottom: '24px' }}>Connect your Gmail account to start classifying and drafting replies to student emails.</p>
        <button onClick={connectGmail} style={{ padding: '12px 28px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}>
          Connect Gmail
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TC, marginBottom: '4px' }}>Admin</div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: INK, margin: 0 }}>Inbox</h1>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{ padding: '8px 16px', backgroundColor: refreshing ? MUTED : INK, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: refreshing ? 'wait' : 'pointer' }}
        >
          {refreshing ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      {statusMsg && (
        <div style={{ padding: '10px 14px', backgroundColor: TC_LIGHT, color: TC_DARK, fontSize: '13px', marginBottom: '16px', borderLeft: `3px solid ${TC}` }}>
          {statusMsg}
          <span onClick={() => setStatusMsg(null)} style={{ float: 'right', cursor: 'pointer', fontWeight: 700 }}>x</span>
        </div>
      )}

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            style={{
              padding: '5px 12px', border: `1px solid ${filter === cat ? TC : RULE}`,
              backgroundColor: filter === cat ? TC_LIGHT : 'transparent',
              color: filter === cat ? TC_DARK : MUTED,
              fontSize: '11px', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
            }}
          >
            {cat === 'all' ? 'All' : CATEGORY_LABELS[cat] || cat}
          </button>
        ))}
      </div>

      {/* Messages */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: MUTED }}>Loading...</div>
      ) : messages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: MUTED }}>No messages</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {messages.map(msg => {
            const isExpanded = expanded === msg.id;
            const catColor = CATEGORY_COLORS[msg.category] || MUTED;
            const student = msg.customers;

            return (
              <div key={msg.id} style={{ border: `1px solid ${RULE}`, backgroundColor: isExpanded ? '#FFF' : ALT }}>
                {/* Summary row */}
                <div
                  onClick={() => setExpanded(isExpanded ? null : msg.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', cursor: 'pointer' }}
                >
                  <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '3px 8px', backgroundColor: catColor, color: '#FFF', flexShrink: 0 }}>
                    {CATEGORY_LABELS[msg.category] || msg.category}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {msg.from_name || msg.from_email}
                      {student && <span style={{ fontWeight: 400, color: MUTED }}> · {student.first_name} {student.last_name}</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {msg.subject}
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: MUTED, flexShrink: 0 }}>{timeAgo(msg.received_at)}</div>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: MUTED }}>{isExpanded ? 'expand_less' : 'expand_more'}</span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${RULE}` }}>
                    {/* AI Summary */}
                    {msg.summary && (
                      <div style={{ fontSize: '12px', color: TC_DARK, backgroundColor: TC_LIGHT, padding: '8px 10px', margin: '12px 0', borderLeft: `3px solid ${TC}` }}>
                        {msg.summary}
                      </div>
                    )}

                    {/* Original email */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED, marginBottom: '6px' }}>Email</div>
                      <div style={{ fontSize: '13px', color: INK, lineHeight: 1.6, whiteSpace: 'pre-wrap', backgroundColor: ALT, padding: '10px 12px' }}>
                        {msg.body_snippet}
                      </div>
                    </div>

                    {/* Draft reply */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED, marginBottom: '6px' }}>Draft Reply</div>
                      {editingDraft !== null && expanded === msg.id ? (
                        <div>
                          <textarea
                            value={editingDraft}
                            onChange={e => setEditingDraft(e.target.value)}
                            rows={6}
                            style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box' }}
                          />
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            <button onClick={() => handleSaveDraft(msg)} style={{ padding: '6px 14px', backgroundColor: INK, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>Save</button>
                            <button onClick={() => setEditingDraft(null)} style={{ padding: '6px 14px', backgroundColor: 'transparent', color: MUTED, border: `1px solid ${RULE}`, fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => setEditingDraft(msg.draft_reply || '')}
                          style={{ fontSize: '13px', color: INK, lineHeight: 1.6, whiteSpace: 'pre-wrap', padding: '10px 12px', border: `1px dashed ${RULE}`, cursor: 'text' }}
                        >
                          {msg.draft_reply || 'No draft — click to write one'}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleSend(msg)}
                        disabled={!msg.draft_reply}
                        style={{ padding: '8px 20px', backgroundColor: msg.draft_reply ? TC : MUTED, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: msg.draft_reply ? 'pointer' : 'not-allowed' }}
                      >
                        Send Reply
                      </button>
                      <button
                        onClick={() => setEditingDraft(msg.draft_reply || '')}
                        style={{ padding: '8px 20px', backgroundColor: 'transparent', color: INK, border: `1px solid ${RULE}`, fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDismiss(msg)}
                        style={{ padding: '8px 20px', backgroundColor: 'transparent', color: MUTED, border: `1px solid ${RULE}`, fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/AdminInbox.jsx
git commit -m "feat: admin inbox page — classified emails with draft replies"
```

---

### Task 8: Register Frontend Route + Nav Item

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/AdminLayout.jsx`

- [ ] **Step 1: Add route in App.jsx**

Add the import at the top with the other lazy imports:

```javascript
const AdminInbox = lazy(() => import('./pages/AdminInbox'));
```

Add the route inside the `/admin` Route block (after the `emails` route):

```jsx
<Route path="inbox" element={<AdminInbox />} />
```

- [ ] **Step 2: Add nav item in AdminLayout.jsx**

Find the nav items array/section and add an "Inbox" entry with the `mail` icon, linking to `/admin/inbox`. Follow the existing pattern for nav items in the file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/AdminLayout.jsx
git commit -m "feat: register admin inbox route and nav item"
```

---

### Task 9: Google Cloud OAuth Setup + Environment Variables

**Files:**
- Modify: `server/.env`

- [ ] **Step 1: Create Google Cloud OAuth credentials**

1. Go to https://console.cloud.google.com
2. Create or select a project
3. Enable Gmail API (APIs & Services → Library → Gmail API → Enable)
4. Create OAuth2 credentials (APIs & Services → Credentials → Create Credentials → OAuth client ID)
   - Application type: Web application
   - Authorized redirect URI: `https://ves-pottery-api-production.up.railway.app/api/admin/settings/gmail/callback`
   - Also add `http://localhost:3000/api/admin/settings/gmail/callback` for local dev
5. Copy Client ID and Client Secret

- [ ] **Step 2: Add env vars to server/.env**

```
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>
GOOGLE_REDIRECT_URI=https://ves-pottery-api-production.up.railway.app/api/admin/settings/gmail/callback
```

- [ ] **Step 3: Add env vars to Railway**

```bash
railway variables set "GOOGLE_CLIENT_ID=<your-client-id>"
railway variables set "GOOGLE_CLIENT_SECRET=<your-client-secret>"
railway variables set "GOOGLE_REDIRECT_URI=https://ves-pottery-api-production.up.railway.app/api/admin/settings/gmail/callback"
```

- [ ] **Step 4: Ensure admin_settings table has the right schema**

Run via Supabase SQL:

```sql
-- Ensure admin_settings can store gmail tokens
-- Check if 'key' column exists and has unique constraint
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS key text UNIQUE;
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS value text;
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
```

---

### Task 10: Deploy and Test End-to-End

- [ ] **Step 1: Push all changes to git**

```bash
git push origin main
```

- [ ] **Step 2: Deploy frontend to Vercel**

```bash
cd frontend && rm -rf dist && npx vite build --mode production && rm -rf .vercel/output/static && cp -r dist .vercel/output/static && npx vercel deploy --prebuilt --prod --scope hjr-labs-projects
```

- [ ] **Step 3: Test Gmail OAuth connection**

Navigate to `/admin/inbox` → Click "Connect Gmail" → Complete Google consent → Verify redirect back with `?gmail=connected`

- [ ] **Step 4: Test email processing**

Click "Refresh" → Verify emails appear classified with draft replies

- [ ] **Step 5: Test send flow**

Expand an email → Review draft → Click "Send Reply" → Verify email sent in Gmail sent folder
