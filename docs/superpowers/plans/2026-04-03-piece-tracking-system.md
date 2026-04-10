# Piece Tracking & Collection System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a batch-based piece tracking system where students log their pottery pieces per course, staff updates firing status, and students get notified when pieces are ready for collection or delivery.

**Architecture:** New `piece_batches` table linked to `course_enrollments`. New route file `server/routes/pieces.js` for all piece batch endpoints. New admin page `AdminPiecePipeline.jsx` for staff. New student page `MyPieces.jsx`. Two new email templates. Daily cron job for reminders integrated into existing `cohortAutoProcessor.js`.

**Tech Stack:** Express.js routes, Supabase PostgreSQL, React 18 + Tailwind CSS, Resend email, OpenAI Vision API (optional)

**Spec:** `docs/superpowers/specs/2026-04-02-piece-tracking-system-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `server/routes/pieces.js` | All piece batch API endpoints (student + admin) |
| `server/email-templates/pieces/pieces-ready.js` | "Your pottery is ready!" email |
| `server/email-templates/pieces/pieces-reminder.js` | Bi-weekly reminder email |
| `frontend/src/pages/MyPieces.jsx` | Student piece batch list + logging form |
| `frontend/src/pages/AdminPiecePipeline.jsx` | Staff pipeline dashboard + identify/search |

### Modified Files
| File | Changes |
|------|---------|
| `server/utils/supabaseDb.js` | Add piece_batches CRUD functions |
| `server/utils/cohortAutoProcessor.js` | Add `checkPieceReminders()` to daily cron |
| `server/index.js` | Mount `pieces` route |
| `frontend/src/App.jsx` | Add MyPieces + AdminPiecePipeline routes |

---

## Task 1: Database Migration — `piece_batches` Table + `initials` Column

**Files:**
- Create: `server/migrations/piece_batches.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Create piece_batches table
CREATE TABLE IF NOT EXISTS piece_batches (
  id SERIAL PRIMARY KEY,
  course_enrollment_id INTEGER REFERENCES course_enrollments(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'logged'
    CHECK (status IN ('logged', 'bisque_fired', 'glaze_fired', 'ready', 'collecting', 'delivering', 'collected', 'shipped', 'recycled')),
  piece_count INTEGER NOT NULL DEFAULT 1,
  initials TEXT NOT NULL,
  notes TEXT,
  photo_urls JSONB DEFAULT '[]'::jsonb,
  delivery_method TEXT CHECK (delivery_method IN ('collect', 'deliver')),
  delivery_fee NUMERIC(10,2) DEFAULT 0,
  ready_at TIMESTAMPTZ,
  hold_expires_at TIMESTAMPTZ,
  last_reminder_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_piece_batches_customer ON piece_batches(customer_id);
CREATE INDEX idx_piece_batches_status ON piece_batches(status);
CREATE INDEX idx_piece_batches_enrollment ON piece_batches(course_enrollment_id);
CREATE INDEX idx_piece_batches_initials ON piece_batches(initials);

-- Add initials column to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS initials TEXT;

-- Unique constraint: one batch per enrollment
CREATE UNIQUE INDEX idx_piece_batches_enrollment_unique
  ON piece_batches(course_enrollment_id)
  WHERE course_enrollment_id IS NOT NULL;
```

Save to `server/migrations/piece_batches.sql`.

- [ ] **Step 2: Run the migration against Supabase**

Run via Supabase MCP tool `execute_sql` with the migration SQL. Verify the table was created.

- [ ] **Step 3: Commit**

```bash
git add server/migrations/piece_batches.sql
git commit -m "feat: add piece_batches table and initials column on customers"
```

---

## Task 2: Database Functions in `supabaseDb.js`

**Files:**
- Modify: `server/utils/supabaseDb.js` (add functions at end, before module.exports)

- [ ] **Step 1: Add piece batch CRUD functions**

Add these functions before the `module.exports` block in `server/utils/supabaseDb.js`:

```javascript
// ==================== Piece Batches ====================

async function createPieceBatch({ courseEnrollmentId, customerId, pieceCount, initials, notes, photoUrls }) {
  const { data, error } = await supabase
    .from('piece_batches')
    .insert({
      course_enrollment_id: courseEnrollmentId || null,
      customer_id: customerId,
      piece_count: pieceCount,
      initials: initials,
      notes: notes || null,
      photo_urls: photoUrls || [],
      status: 'logged',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getPieceBatchesByCustomerId(customerId) {
  const { data, error } = await supabase
    .from('piece_batches')
    .select('*, course_enrollments(course_type, course_title, course_variant_title, course_identifier)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function getPieceBatchById(batchId) {
  const { data, error } = await supabase
    .from('piece_batches')
    .select('*, customers(id, first_name, last_name, email), course_enrollments(course_type, course_title, course_variant_title, course_identifier)')
    .eq('id', batchId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function getAllActivePieceBatches() {
  const { data, error } = await supabase
    .from('piece_batches')
    .select('*, customers(id, first_name, last_name, email), course_enrollments(course_type, course_title, course_variant_title, course_identifier)')
    .not('status', 'in', '("collected","shipped","recycled")')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function updatePieceBatchStatus(batchId, status, extraFields = {}) {
  const updateData = { status, updated_at: new Date().toISOString(), ...extraFields };

  if (status === 'ready') {
    const readyAt = new Date().toISOString();
    updateData.ready_at = readyAt;
    const holdExpires = new Date();
    holdExpires.setDate(holdExpires.getDate() + 60);
    updateData.hold_expires_at = holdExpires.toISOString();
  }

  if (status === 'collected' || status === 'shipped') {
    updateData.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('piece_batches')
    .update(updateData)
    .eq('id', batchId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updatePieceBatch(batchId, updates) {
  const { data, error } = await supabase
    .from('piece_batches')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', batchId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function searchPieceBatchesByInitials(initials) {
  const { data, error } = await supabase
    .from('piece_batches')
    .select('*, customers(id, first_name, last_name, email), course_enrollments(course_type, course_title, course_variant_title, course_identifier)')
    .ilike('initials', `%${initials}%`)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function getReadyBatchesNeedingReminder() {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const cutoff = fourteenDaysAgo.toISOString();

  const { data, error } = await supabase
    .from('piece_batches')
    .select('*, customers(id, first_name, last_name, email), course_enrollments(course_type, course_title, course_variant_title)')
    .in('status', ['ready', 'collecting', 'delivering'])
    .not('status', 'in', '("collected","shipped","recycled")')
    .or(`last_reminder_at.is.null,last_reminder_at.lt.${cutoff}`)
    .not('ready_at', 'is', null);

  if (error) throw error;

  // Filter: only batches where ready_at is at least 14 days ago
  const now = new Date();
  return (data || []).filter(batch => {
    const readyAt = new Date(batch.ready_at);
    const daysSinceReady = Math.floor((now - readyAt) / (1000 * 60 * 60 * 24));
    return daysSinceReady >= 14;
  });
}
```

- [ ] **Step 2: Export the new functions**

Add to the `module.exports` block:

```javascript
  createPieceBatch,
  getPieceBatchesByCustomerId,
  getPieceBatchById,
  getAllActivePieceBatches,
  updatePieceBatchStatus,
  updatePieceBatch,
  searchPieceBatchesByInitials,
  getReadyBatchesNeedingReminder,
```

- [ ] **Step 3: Commit**

```bash
git add server/utils/supabaseDb.js
git commit -m "feat: add piece batch CRUD functions to supabaseDb"
```

---

## Task 3: Email Templates

**Files:**
- Create: `server/email-templates/pieces/pieces-ready.js`
- Create: `server/email-templates/pieces/pieces-reminder.js`

- [ ] **Step 1: Create the "ready" email template**

```javascript
const { wrapEmailTemplate } = require('../base');

function generate({ studentName, courseName, pieceCount, photoUrl, appUrl }) {
  const subject = 'Your pottery is ready! 🏺';

  const body = `
    <h2 style="margin: 0 0 16px; font-size: 22px; color: #282828; font-weight: 600;">
      Hi ${studentName},
    </h2>
    <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #333;">
      Great news! Your <strong>${pieceCount} piece${pieceCount !== 1 ? 's' : ''}</strong> from
      <strong>${courseName}</strong> have been fired and are ready.
    </p>
    ${photoUrl ? `
    <div style="margin: 0 0 20px; text-align: center;">
      <img src="${photoUrl}" alt="Your pottery pieces" style="max-width: 100%; border-radius: 8px; max-height: 300px;" />
    </div>
    ` : ''}
    <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333;">
      How would you like to get them?
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td width="48%" align="center" style="padding-right: 8px;">
          <a href="${appUrl}/gallery?tab=pieces" style="display: block; padding: 14px 20px; background-color: #2D8C4E; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
            I'll Collect
          </a>
        </td>
        <td width="48%" align="center" style="padding-left: 8px;">
          <a href="${appUrl}/gallery?tab=pieces" style="display: block; padding: 14px 20px; background-color: #C4622D; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
            Deliver ($10)
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #888;">
      We'll hold your pieces for up to 60 days. After that, uncollected pieces may be recycled.
      <br /><br />
      Questions? Reply to this email or visit the studio.
    </p>
  `;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
```

Save to `server/email-templates/pieces/pieces-ready.js`.

- [ ] **Step 2: Create the reminder email template**

```javascript
const { wrapEmailTemplate } = require('../base');

function generate({ studentName, courseName, pieceCount, photoUrl, appUrl, daysSinceReady, holdExpiresDate }) {
  const daysLeft = Math.max(0, 60 - daysSinceReady);
  const isUrgent = daysLeft <= 7;
  const isFinal = daysLeft <= 4;

  let headline;
  if (isFinal) {
    headline = 'Last chance — your pieces will be recycled soon';
  } else if (isUrgent) {
    headline = 'Your pottery will be recycled in ' + daysLeft + ' days';
  } else if (daysSinceReady >= 42) {
    headline = "Don't forget your pottery!";
  } else if (daysSinceReady >= 28) {
    headline = 'Your pottery is still here';
  } else {
    headline = 'Just a reminder — your pieces are waiting!';
  }

  const subject = isUrgent ? `⚠️ ${headline}` : `🏺 ${headline}`;

  const body = `
    <h2 style="margin: 0 0 16px; font-size: 22px; color: ${isUrgent ? '#D32F2F' : '#282828'}; font-weight: 600;">
      ${headline}
    </h2>
    <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #333;">
      Hi ${studentName}, your <strong>${pieceCount} piece${pieceCount !== 1 ? 's' : ''}</strong> from
      <strong>${courseName}</strong> ${pieceCount !== 1 ? 'are' : 'is'} ready for collection.
    </p>
    ${photoUrl ? `
    <div style="margin: 0 0 20px; text-align: center;">
      <img src="${photoUrl}" alt="Your pottery pieces" style="max-width: 100%; border-radius: 8px; max-height: 300px;" />
    </div>
    ` : ''}
    ${isUrgent ? `
    <div style="margin: 0 0 20px; padding: 16px; background: #FFF3E0; border-radius: 8px; border-left: 4px solid #E65100;">
      <p style="margin: 0; font-size: 14px; color: #E65100; font-weight: 600;">
        ⚠️ Your pieces will be recycled after ${holdExpiresDate}. Please collect or arrange delivery before then.
      </p>
    </div>
    ` : ''}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td width="48%" align="center" style="padding-right: 8px;">
          <a href="${appUrl}/gallery?tab=pieces" style="display: block; padding: 14px 20px; background-color: #2D8C4E; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
            I'll Collect
          </a>
        </td>
        <td width="48%" align="center" style="padding-left: 8px;">
          <a href="${appUrl}/gallery?tab=pieces" style="display: block; padding: 14px 20px; background-color: #C4622D; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
            Deliver ($10)
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #888;">
      We hold pieces for 60 days from the ready date.
      <br /><br />
      Questions? Reply to this email or visit the studio.
    </p>
  `;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
```

Save to `server/email-templates/pieces/pieces-reminder.js`.

- [ ] **Step 3: Commit**

```bash
git add server/email-templates/pieces/
git commit -m "feat: add piece ready and reminder email templates"
```

---

## Task 4: Backend Routes — `server/routes/pieces.js`

**Files:**
- Create: `server/routes/pieces.js`

- [ ] **Step 1: Create the route file with student endpoints**

```javascript
const supabaseDb = require('../utils/supabaseDb');
const { sendAndLogEmail } = require('../utils/emailService');
const courseConfig = require('../utils/courseConfig');

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler, upload }) {

  // ==================== Student Endpoints ====================

  // Get student's piece batches
  app.get('/api/pieces/my-batches', authenticateToken, asyncHandler(async (req, res) => {
    const customerId = req.user.customerId;
    const batches = await supabaseDb.getPieceBatchesByCustomerId(customerId);

    // Enrich with allowance from course_config
    const enriched = batches.map(batch => {
      let allowance = null;
      if (batch.course_enrollments) {
        const enrollment = batch.course_enrollments;
        const templateKey = detectCourseTypeKey(enrollment);
        const config = courseConfig.getConfig(templateKey);
        if (config) allowance = config.finished_pieces;
      }
      return { ...batch, pieces_allowed: allowance };
    });

    res.json({ success: true, batches: enriched });
  }));

  // Log a new piece batch
  app.post('/api/pieces/log', authenticateToken, upload.array('photos', 5), asyncHandler(async (req, res) => {
    const customerId = req.user.customerId;
    const { courseEnrollmentId, pieceCount, initials, notes } = req.body;

    if (!initials || !pieceCount) {
      return res.status(400).json({ error: 'Initials and piece count are required' });
    }

    // Upload photos if provided
    let photoUrls = [];
    if (req.files && req.files.length > 0) {
      const { uploadImageToSupabase } = require('../utils/imageUpload');
      for (const file of req.files) {
        const { url } = await uploadImageToSupabase(file.buffer, file.originalname, file.mimetype, `customers/${customerId}/pieces`);
        photoUrls.push(url);
      }
    }

    // Also accept pre-uploaded URLs
    if (req.body.photoUrls) {
      const urls = typeof req.body.photoUrls === 'string' ? JSON.parse(req.body.photoUrls) : req.body.photoUrls;
      photoUrls = photoUrls.concat(urls);
    }

    const batch = await supabaseDb.createPieceBatch({
      courseEnrollmentId: courseEnrollmentId ? parseInt(courseEnrollmentId) : null,
      customerId,
      pieceCount: parseInt(pieceCount),
      initials: initials.toUpperCase().trim(),
      notes,
      photoUrls,
    });

    // Update customer initials if not set
    const customer = await supabaseDb.getCustomerById(customerId);
    if (!customer.initials) {
      await supabaseDb.supabase
        .from('customers')
        .update({ initials: initials.toUpperCase().trim() })
        .eq('id', customerId);
    }

    res.json({ success: true, batch });
  }));

  // Update a piece batch (add photos, update count/notes)
  app.put('/api/pieces/batches/:id', authenticateToken, asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.id);
    const customerId = req.user.customerId;

    const batch = await supabaseDb.getPieceBatchById(batchId);
    if (!batch || batch.customer_id !== customerId) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const updates = {};
    if (req.body.pieceCount !== undefined) updates.piece_count = parseInt(req.body.pieceCount);
    if (req.body.initials !== undefined) updates.initials = req.body.initials.toUpperCase().trim();
    if (req.body.notes !== undefined) updates.notes = req.body.notes;
    if (req.body.photoUrls !== undefined) updates.photo_urls = req.body.photoUrls;

    const updated = await supabaseDb.updatePieceBatch(batchId, updates);
    res.json({ success: true, batch: updated });
  }));

  // Set delivery method
  app.put('/api/pieces/batches/:id/delivery', authenticateToken, asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.id);
    const customerId = req.user.customerId;
    const { method } = req.body; // 'collect' or 'deliver'

    if (!['collect', 'deliver'].includes(method)) {
      return res.status(400).json({ error: 'Method must be "collect" or "deliver"' });
    }

    const batch = await supabaseDb.getPieceBatchById(batchId);
    if (!batch || batch.customer_id !== customerId) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const updates = {
      delivery_method: method,
      delivery_fee: method === 'deliver' ? 10.00 : 0,
      status: method === 'collect' ? 'collecting' : 'delivering',
    };

    const updated = await supabaseDb.updatePieceBatch(batchId, updates);
    res.json({ success: true, batch: updated });
  }));

  // ==================== Admin Endpoints ====================

  // Pipeline dashboard — all active batches
  app.get('/api/admin/pieces/pipeline', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const batches = await supabaseDb.getAllActivePieceBatches();

    const grouped = {
      logged: batches.filter(b => b.status === 'logged'),
      bisque_fired: batches.filter(b => b.status === 'bisque_fired'),
      glaze_fired: batches.filter(b => b.status === 'glaze_fired'),
      ready: batches.filter(b => ['ready', 'collecting', 'delivering'].includes(b.status)),
    };

    const stats = {
      logged: { count: grouped.logged.length, pieces: grouped.logged.reduce((s, b) => s + b.piece_count, 0) },
      bisque_fired: { count: grouped.bisque_fired.length, pieces: grouped.bisque_fired.reduce((s, b) => s + b.piece_count, 0) },
      glaze_fired: { count: grouped.glaze_fired.length, pieces: grouped.glaze_fired.reduce((s, b) => s + b.piece_count, 0) },
      ready: { count: grouped.ready.length, pieces: grouped.ready.reduce((s, b) => s + b.piece_count, 0) },
    };

    res.json({ success: true, batches: grouped, stats });
  }));

  // Search by initials
  app.get('/api/admin/pieces/search', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { initials } = req.query;
    if (!initials) return res.status(400).json({ error: 'initials query param required' });

    const batches = await supabaseDb.searchPieceBatchesByInitials(initials);
    res.json({ success: true, batches });
  }));

  // Update batch status
  app.put('/api/admin/pieces/batches/:id/status', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.id);
    const { status } = req.body;

    const validStatuses = ['logged', 'bisque_fired', 'glaze_fired', 'ready', 'collecting', 'delivering', 'collected', 'shipped', 'recycled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const batch = await supabaseDb.updatePieceBatchStatus(batchId, status);

    // Send notification email when marking as ready
    if (status === 'ready' && batch.customers) {
      const student = batch.customers;
      const courseName = batch.course_enrollments?.course_title || batch.course_enrollments?.course_variant_title || 'your course';
      const photoUrl = batch.photo_urls && batch.photo_urls.length > 0 ? batch.photo_urls[0] : null;
      const appUrl = process.env.FRONTEND_URL || 'https://club.ves.sg';

      const piecesReadyTemplate = require('../email-templates/pieces/pieces-ready');
      const { subject, html } = piecesReadyTemplate.generate({
        studentName: student.first_name || 'there',
        courseName,
        pieceCount: batch.piece_count,
        photoUrl,
        appUrl,
      });

      await sendAndLogEmail({
        emailType: 'pieces-ready',
        courseIdentifier: batch.course_enrollments?.course_identifier || `batch-${batchId}`,
        subject,
        html,
        recipientEmails: [student.email],
        sentBy: 'system',
      });
    }

    res.json({ success: true, batch });
  }));

  // Complete a batch (collected or shipped)
  app.put('/api/admin/pieces/batches/:id/complete', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.id);
    const { completionType } = req.body; // 'collected' or 'shipped'

    if (!['collected', 'shipped'].includes(completionType)) {
      return res.status(400).json({ error: 'completionType must be "collected" or "shipped"' });
    }

    const batch = await supabaseDb.updatePieceBatchStatus(batchId, completionType);
    res.json({ success: true, batch });
  }));

  // Bulk status update
  app.post('/api/admin/pieces/bulk-status', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { batchIds, status } = req.body;

    if (!Array.isArray(batchIds) || !status) {
      return res.status(400).json({ error: 'batchIds array and status required' });
    }

    const results = [];
    for (const batchId of batchIds) {
      const batch = await supabaseDb.updatePieceBatchStatus(batchId, status);
      results.push(batch);

      // Send ready email for each batch if status is 'ready'
      if (status === 'ready' && batch.customers) {
        const student = batch.customers;
        const courseName = batch.course_enrollments?.course_title || batch.course_enrollments?.course_variant_title || 'your course';
        const photoUrl = batch.photo_urls && batch.photo_urls.length > 0 ? batch.photo_urls[0] : null;
        const appUrl = process.env.FRONTEND_URL || 'https://club.ves.sg';

        const piecesReadyTemplate = require('../email-templates/pieces/pieces-ready');
        const { subject, html } = piecesReadyTemplate.generate({
          studentName: student.first_name || 'there',
          courseName,
          pieceCount: batch.piece_count,
          photoUrl,
          appUrl,
        });

        await sendAndLogEmail({
          emailType: 'pieces-ready',
          courseIdentifier: batch.course_enrollments?.course_identifier || `batch-${batchId}`,
          subject,
          html,
          recipientEmails: [student.email],
          sentBy: 'system',
        });
      }
    }

    res.json({ success: true, batches: results });
  }));

  // AI identify (optional, placeholder for now)
  app.post('/api/admin/pieces/identify', authenticateToken, requireAdmin, upload.single('photo'), asyncHandler(async (req, res) => {
    // Check if AI matching is enabled
    const aiEnabled = process.env.PIECE_TRACKING_AI_ENABLED === 'true';
    if (!aiEnabled) {
      return res.status(400).json({ error: 'AI matching is not enabled. Use manual search instead.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Photo required' });
    }

    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Convert buffer to base64
    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'This is a photo of the bottom of a pottery piece with hand-inscribed initials/letters. Read the inscription and return ONLY the letters/numbers you can see, in uppercase. If you cannot read it clearly, return "UNCLEAR". Do not add any other text.',
            },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64Image}` },
            },
          ],
        },
      ],
      max_tokens: 50,
    });

    const detected = response.choices[0].message.content.trim();

    if (detected === 'UNCLEAR') {
      return res.json({ success: true, detected: null, message: 'Could not read inscription clearly', matches: [] });
    }

    // Search for matches
    const matches = await supabaseDb.searchPieceBatchesByInitials(detected);

    res.json({ success: true, detected, matches });
  }));
};

// Helper: determine course type key from enrollment data
function detectCourseTypeKey(enrollment) {
  const courseType = (enrollment.course_type || '').toLowerCase();
  const title = (enrollment.course_title || '').toLowerCase();

  if (title.includes('kids') || title.includes('play with clay')) return 'kids-clay';
  if (courseType.includes('handbuilding')) {
    return title.includes('8') ? 'hb-8credit' : 'hb-4credit';
  }
  if (title.includes('10') || title.includes('ten')) return 'wt-10class';
  if (title.includes('3x') || title.includes('3 course')) return 'wt-3x6week';
  if (title.includes('intermediate') || title.includes('7')) return 'wt-7week-inter';
  return 'wt-6week';
}
```

Save to `server/routes/pieces.js`.

- [ ] **Step 2: Mount the route in `server/index.js`**

Add after the existing route imports (around line 190):

```javascript
require('./routes/pieces')(app, deps);
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/pieces.js server/index.js
git commit -m "feat: add piece batch API routes (student + admin endpoints)"
```

---

## Task 5: Reminder Cron Job

**Files:**
- Modify: `server/utils/cohortAutoProcessor.js`

- [ ] **Step 1: Add the `checkPieceReminders` function**

Add before the `startAutomaticProcessing` function in `cohortAutoProcessor.js`:

```javascript
/**
 * Check for piece batches that need reminder emails.
 * Runs daily. Sends reminders every 14 days for batches in 'ready' status
 * that haven't been collected/shipped within the 60-day hold period.
 */
async function checkPieceReminders() {
  try {
    const supabaseDb = require('./supabaseDb');
    const { sendAndLogEmail } = require('./emailService');
    const piecesReminderTemplate = require('../email-templates/pieces/pieces-reminder');
    const appUrl = process.env.FRONTEND_URL || 'https://club.ves.sg';

    const batches = await supabaseDb.getReadyBatchesNeedingReminder();
    console.log(`[Auto-Processor] Found ${batches.length} piece batches needing reminders`);

    let sent = 0;
    for (const batch of batches) {
      const student = batch.customers;
      if (!student || !student.email) continue;

      const readyAt = new Date(batch.ready_at);
      const now = new Date();
      const daysSinceReady = Math.floor((now - readyAt) / (1000 * 60 * 60 * 24));

      // Don't send if past hold period (staff should handle recycling)
      if (daysSinceReady > 60) continue;

      const holdExpires = new Date(batch.hold_expires_at);
      const holdExpiresDate = holdExpires.toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' });

      const courseName = batch.course_enrollments?.course_title || batch.course_enrollments?.course_variant_title || 'your course';
      const photoUrl = batch.photo_urls && batch.photo_urls.length > 0 ? batch.photo_urls[0] : null;

      const { subject, html } = piecesReminderTemplate.generate({
        studentName: student.first_name || 'there',
        courseName,
        pieceCount: batch.piece_count,
        photoUrl,
        appUrl,
        daysSinceReady,
        holdExpiresDate,
      });

      const result = await sendAndLogEmail({
        emailType: 'pieces-reminder',
        courseIdentifier: batch.course_enrollments?.course_identifier || `batch-${batch.id}`,
        subject,
        html,
        recipientEmails: [student.email],
        sentBy: 'system',
      });

      if (result.success) {
        await supabaseDb.updatePieceBatch(batch.id, { last_reminder_at: new Date().toISOString() });
        sent++;
      }
    }

    console.log(`[Auto-Processor] ✅ Sent ${sent} piece reminder emails`);
    return { success: true, sent };
  } catch (error) {
    console.error('[Auto-Processor] Error in checkPieceReminders:', error);
    return { success: false, error: error.message };
  }
}
```

- [ ] **Step 2: Add to the daily schedule and exports**

In `startAutomaticProcessing`, add `checkPieceReminders()` to both the startup run and the 2 AM daily check:

Add to the `setTimeout` block:
```javascript
checkPieceReminders().catch(console.error);
```

Add to the `if (hour === 2 && minute === 0)` block:
```javascript
checkPieceReminders().catch(console.error);
```

Add to `module.exports`:
```javascript
checkPieceReminders,
```

- [ ] **Step 3: Commit**

```bash
git add server/utils/cohortAutoProcessor.js
git commit -m "feat: add daily piece reminder cron job (every 14 days, 60-day hold)"
```

---

## Task 6: Student Frontend — `MyPieces.jsx`

**Files:**
- Create: `frontend/src/pages/MyPieces.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create the MyPieces page**

Create `frontend/src/pages/MyPieces.jsx` — a student-facing page that:
- Lists all the student's piece batches with status badges
- Shows a "Log My Pieces" form for new submissions
- Allows choosing collect/deliver when status is "ready"
- Shows batch photos

The page should follow the existing patterns from `GalleryNew.jsx` (inline styles, same color palette). Use `api` from `../utils/api` for API calls.

Key sections:
1. **Batch list** — each batch card shows: course name, piece count, initials, status badge (color-coded), batch photo thumbnail, and action buttons
2. **Log form** (shown as modal or inline) — photo upload, piece count stepper, initials (pre-filled from profile), notes
3. **Delivery selection** — collect/deliver buttons only when status is `ready`

```jsx
import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const STATUS_CONFIG = {
  logged: { label: 'Logged', color: '#888', bg: '#f5f5f5' },
  bisque_fired: { label: 'Bisque Fired', color: '#888', bg: '#f5f5f5' },
  glaze_fired: { label: 'Glaze Firing', color: '#E65100', bg: '#FFF3E0' },
  ready: { label: 'Ready!', color: '#2D8C4E', bg: '#E8F5E9' },
  collecting: { label: 'Collecting', color: '#2D8C4E', bg: '#E8F5E9' },
  delivering: { label: 'Delivery', color: '#C4622D', bg: '#FFF3E0' },
  collected: { label: 'Collected', color: '#1565C0', bg: '#E3F2FD' },
  shipped: { label: 'Shipped', color: '#1565C0', bg: '#E3F2FD' },
  recycled: { label: 'Recycled', color: '#888', bg: '#f5f5f5' },
};

export default function MyPieces() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogForm, setShowLogForm] = useState(false);
  const [enrollments, setEnrollments] = useState([]);

  // Log form state
  const [logForm, setLogForm] = useState({
    courseEnrollmentId: '',
    pieceCount: 7,
    initials: '',
    notes: '',
    photos: [],
  });
  const [uploading, setUploading] = useState(false);

  const fetchBatches = useCallback(async () => {
    try {
      const { data } = await api.get('/pieces/my-batches');
      setBatches(data.batches || []);
    } catch (err) {
      console.error('Failed to fetch batches:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBatches();
    // Fetch enrollments for the log form dropdown
    api.get('/pottery/pieces').then(({ data }) => {
      // We need course enrollments — use admin endpoint or a dedicated one
    }).catch(() => {});
    // Fetch customer profile for initials
    api.get('/auth/me').then(({ data }) => {
      if (data.customer?.initials) {
        setLogForm(f => ({ ...f, initials: data.customer.initials }));
      }
    }).catch(() => {});
  }, [fetchBatches]);

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('images', f));
      const { data } = await api.post('/upload/images', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setLogForm(f => ({
        ...f,
        photos: [...f.photos, ...data.images.map(img => img.url)],
      }));
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitLog = async () => {
    if (!logForm.initials || !logForm.pieceCount) return;

    try {
      setUploading(true);
      await api.post('/pieces/log', {
        courseEnrollmentId: logForm.courseEnrollmentId || null,
        pieceCount: logForm.pieceCount,
        initials: logForm.initials,
        notes: logForm.notes,
        photoUrls: JSON.stringify(logForm.photos),
      });
      setShowLogForm(false);
      setLogForm({ courseEnrollmentId: '', pieceCount: 7, initials: logForm.initials, notes: '', photos: [] });
      fetchBatches();
    } catch (err) {
      console.error('Failed to log pieces:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleDeliveryChoice = async (batchId, method) => {
    try {
      await api.put(`/pieces/batches/${batchId}/delivery`, { method });
      fetchBatches();
    } catch (err) {
      console.error('Failed to set delivery:', err);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
        Loading your pieces...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: '#282828' }}>My Pieces</h1>
        <button
          onClick={() => setShowLogForm(!showLogForm)}
          style={{ padding: '10px 20px', background: '#C4622D', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
        >
          {showLogForm ? 'Cancel' : '📸 Log My Pieces'}
        </button>
      </div>

      {/* Log Form */}
      {showLogForm && (
        <div style={{ background: 'white', borderRadius: 12, padding: 24, marginBottom: 24, border: '1px solid #e0e0e0' }}>
          <h3 style={{ margin: '0 0 16px', color: '#282828' }}>Log Your Pieces</h3>

          {/* Photo upload */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>
              Photo of all your pieces
            </label>
            {logForm.photos.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                {logForm.photos.map((url, i) => (
                  <img key={i} src={url} alt={`Piece ${i + 1}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />
                ))}
              </div>
            )}
            <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} disabled={uploading} />
            {uploading && <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>Uploading...</span>}
          </div>

          {/* Piece count */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>
              How many pieces?
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => setLogForm(f => ({ ...f, pieceCount: Math.max(1, f.pieceCount - 1) }))}
                style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #ddd', background: 'white', fontSize: 18, cursor: 'pointer' }}
              >−</button>
              <span style={{ fontSize: 24, fontWeight: 700, color: '#C4622D', minWidth: 30, textAlign: 'center' }}>
                {logForm.pieceCount}
              </span>
              <button
                onClick={() => setLogForm(f => ({ ...f, pieceCount: f.pieceCount + 1 }))}
                style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #ddd', background: 'white', fontSize: 18, cursor: 'pointer' }}
              >+</button>
            </div>
          </div>

          {/* Initials */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>
              Your initials (inscribed on pieces)
            </label>
            <input
              type="text"
              value={logForm.initials}
              onChange={e => setLogForm(f => ({ ...f, initials: e.target.value }))}
              maxLength={5}
              style={{ width: 100, padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 18, textAlign: 'center', letterSpacing: 4, fontWeight: 600 }}
            />
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>
              Notes <span style={{ color: '#aaa' }}>(optional)</span>
            </label>
            <input
              type="text"
              value={logForm.notes}
              onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. 3 bowls, 2 mugs, 2 plates"
              style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>

          <button
            onClick={handleSubmitLog}
            disabled={!logForm.initials || !logForm.pieceCount || uploading}
            style={{
              width: '100%', padding: 14, background: (!logForm.initials || uploading) ? '#ccc' : '#C4622D',
              color: 'white', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Submit Pieces
          </button>
        </div>
      )}

      {/* Batch List */}
      {batches.length === 0 && !showLogForm && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#888' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏺</div>
          <p>No pieces logged yet. Tap "Log My Pieces" after glazing!</p>
        </div>
      )}

      {batches.map(batch => {
        const statusConfig = STATUS_CONFIG[batch.status] || STATUS_CONFIG.logged;
        const isReady = batch.status === 'ready';
        const photoUrl = batch.photo_urls && batch.photo_urls.length > 0 ? batch.photo_urls[0] : null;
        const courseName = batch.course_enrollments?.course_title || batch.course_enrollments?.course_variant_title || 'Course';

        return (
          <div
            key={batch.id}
            style={{
              background: statusConfig.bg, border: `1px solid ${isReady ? '#A5D6A7' : '#e0e0e0'}`,
              borderRadius: 12, padding: 16, marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: '#282828' }}>{courseName}</div>
              <span style={{
                background: statusConfig.color, color: 'white', fontSize: 11,
                padding: '2px 10px', borderRadius: 99, fontWeight: 600,
              }}>
                {statusConfig.label}
              </span>
            </div>

            <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
              {batch.piece_count} piece{batch.piece_count !== 1 ? 's' : ''} · Initials: {batch.initials}
              {batch.pieces_allowed && batch.piece_count > batch.pieces_allowed && (
                <span style={{ color: '#E65100', marginLeft: 8 }}>
                  ({batch.piece_count - batch.pieces_allowed} extra @ $20 each)
                </span>
              )}
            </div>

            {photoUrl && (
              <img
                src={photoUrl}
                alt="Batch photo"
                style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, marginBottom: 10 }}
              />
            )}

            {batch.notes && (
              <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>{batch.notes}</div>
            )}

            {isReady && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handleDeliveryChoice(batch.id, 'collect')}
                  style={{ flex: 1, padding: 10, background: '#2D8C4E', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                >
                  I'll Collect
                </button>
                <button
                  onClick={() => handleDeliveryChoice(batch.id, 'deliver')}
                  style={{ flex: 1, padding: 10, background: 'white', color: '#C4622D', border: '1px solid #C4622D', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                >
                  Deliver ($10)
                </button>
              </div>
            )}

            {(batch.status === 'collecting') && (
              <div style={{ fontSize: 13, color: '#2D8C4E', fontWeight: 600, marginTop: 4 }}>
                ✅ You chose to collect — come visit the studio!
              </div>
            )}
            {(batch.status === 'delivering') && (
              <div style={{ fontSize: 13, color: '#C4622D', fontWeight: 600, marginTop: 4 }}>
                📦 Delivery requested ($10) — we'll ship it to you!
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

Save to `frontend/src/pages/MyPieces.jsx`.

- [ ] **Step 2: Add route in `App.jsx`**

In `frontend/src/App.jsx`, add the import at the top with other page imports:

```javascript
import MyPieces from './pages/MyPieces';
```

Add the route inside the `<Route element={<PrivateRoute><StudentLayout /></PrivateRoute>}>` block, after the gallery route:

```jsx
<Route path="/my-pieces" element={<MyPieces />} />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/MyPieces.jsx frontend/src/App.jsx
git commit -m "feat: add student My Pieces page with batch logging and delivery selection"
```

---

## Task 7: Admin Frontend — `AdminPiecePipeline.jsx`

**Files:**
- Create: `frontend/src/pages/AdminPiecePipeline.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create the Admin Piece Pipeline page**

Create `frontend/src/pages/AdminPiecePipeline.jsx` — an admin page following existing admin patterns (inline styles, dark header). Key sections:

1. **Stats bar** — batch counts per status with piece totals
2. **Batch list** grouped by status section — each batch shows student name, course, piece count, initials, photo thumbnail, days since status change, action buttons
3. **Search panel** — text search by initials with results
4. **Bulk actions** — select multiple batches + apply status

```jsx
import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const STATUS_ORDER = ['ready', 'glaze_fired', 'bisque_fired', 'logged'];
const STATUS_LABELS = {
  logged: 'Logged / Drying',
  bisque_fired: 'Bisque Fired',
  glaze_fired: 'Glaze Fired',
  ready: 'Ready for Collection',
};
const STATUS_COLORS = {
  logged: '#888',
  bisque_fired: '#E65100',
  glaze_fired: '#E65100',
  ready: '#2D8C4E',
};
const NEXT_STATUS = {
  logged: 'bisque_fired',
  bisque_fired: 'glaze_fired',
  glaze_fired: 'ready',
};

export default function AdminPiecePipeline() {
  const [pipeline, setPipeline] = useState({ batches: {}, stats: {} });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [selectedBatches, setSelectedBatches] = useState(new Set());

  const fetchPipeline = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/pieces/pipeline');
      setPipeline(data);
    } catch (err) {
      console.error('Failed to fetch pipeline:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const { data } = await api.get(`/admin/pieces/search?initials=${encodeURIComponent(searchQuery.trim())}`);
      setSearchResults(data.batches);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const handleStatusUpdate = async (batchId, newStatus) => {
    try {
      await api.put(`/admin/pieces/batches/${batchId}/status`, { status: newStatus });
      fetchPipeline();
      if (searchResults) handleSearch();
    } catch (err) {
      console.error('Status update failed:', err);
    }
  };

  const handleComplete = async (batchId, type) => {
    try {
      await api.put(`/admin/pieces/batches/${batchId}/complete`, { completionType: type });
      fetchPipeline();
    } catch (err) {
      console.error('Complete failed:', err);
    }
  };

  const handleBulkStatus = async (status) => {
    if (selectedBatches.size === 0) return;
    try {
      await api.post('/admin/pieces/bulk-status', { batchIds: Array.from(selectedBatches), status });
      setSelectedBatches(new Set());
      fetchPipeline();
    } catch (err) {
      console.error('Bulk update failed:', err);
    }
  };

  const toggleSelect = (batchId) => {
    setSelectedBatches(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  const daysSince = (dateStr) => {
    if (!dateStr) return null;
    return Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading pipeline...</div>;
  }

  const stats = pipeline.stats || {};

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ margin: '0 0 20px', fontSize: 24, color: '#282828' }}>Piece Pipeline</h1>

      {/* Stats Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {['logged', 'bisque_fired', 'glaze_fired', 'ready'].map(key => (
          <div key={key} style={{ textAlign: 'center', padding: 16, background: 'white', borderRadius: 10, border: '1px solid #e0e0e0' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: STATUS_COLORS[key] }}>{stats[key]?.count || 0}</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{STATUS_LABELS[key]}</div>
            <div style={{ fontSize: 11, color: '#aaa' }}>{stats[key]?.pieces || 0} pieces</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ background: 'white', borderRadius: 10, padding: 16, marginBottom: 24, border: '1px solid #e0e0e0' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search by initials (e.g. JL)"
            style={{ flex: 1, padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 16, letterSpacing: 2, fontWeight: 600 }}
          />
          <button onClick={handleSearch} style={{ padding: '10px 20px', background: '#282828', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
            Search
          </button>
        </div>

        {searchResults && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</div>
            {searchResults.map(batch => (
              <BatchCard key={batch.id} batch={batch} daysSince={daysSince} onStatusUpdate={handleStatusUpdate} onComplete={handleComplete} />
            ))}
          </div>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedBatches.size > 0 && (
        <div style={{ background: '#282828', color: 'white', borderRadius: 10, padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 10 }}>
          <span style={{ fontSize: 13 }}>{selectedBatches.size} selected</span>
          <button onClick={() => handleBulkStatus('bisque_fired')} style={{ padding: '6px 12px', background: '#E65100', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>→ Bisque Fired</button>
          <button onClick={() => handleBulkStatus('glaze_fired')} style={{ padding: '6px 12px', background: '#E65100', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>→ Glaze Fired</button>
          <button onClick={() => handleBulkStatus('ready')} style={{ padding: '6px 12px', background: '#2D8C4E', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>→ Ready</button>
          <button onClick={() => setSelectedBatches(new Set())} style={{ marginLeft: 'auto', padding: '6px 12px', background: 'transparent', color: '#aaa', border: '1px solid #555', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>Clear</button>
        </div>
      )}

      {/* Pipeline Sections */}
      {STATUS_ORDER.map(statusKey => {
        const batchesForStatus = pipeline.batches?.[statusKey] || [];
        if (batchesForStatus.length === 0) return null;

        return (
          <div key={statusKey} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: STATUS_COLORS[statusKey], textTransform: 'uppercase', marginBottom: 8 }}>
              {STATUS_LABELS[statusKey]} ({batchesForStatus.length} batch{batchesForStatus.length !== 1 ? 'es' : ''})
            </div>
            {batchesForStatus.map(batch => (
              <BatchCard
                key={batch.id}
                batch={batch}
                daysSince={daysSince}
                onStatusUpdate={handleStatusUpdate}
                onComplete={handleComplete}
                selected={selectedBatches.has(batch.id)}
                onToggleSelect={() => toggleSelect(batch.id)}
                showCheckbox
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function BatchCard({ batch, daysSince, onStatusUpdate, onComplete, selected, onToggleSelect, showCheckbox }) {
  const student = batch.customers || {};
  const enrollment = batch.course_enrollments || {};
  const courseName = enrollment.course_title || enrollment.course_variant_title || 'Course';
  const photoUrl = batch.photo_urls && batch.photo_urls.length > 0 ? batch.photo_urls[0] : null;
  const nextStatus = NEXT_STATUS[batch.status];
  const isReady = ['ready', 'collecting', 'delivering'].includes(batch.status);
  const daysReady = isReady ? daysSince(batch.ready_at) : null;
  const noResponse = isReady && !batch.delivery_method && daysReady >= 7;

  return (
    <div style={{
      background: 'white', border: `1px solid ${selected ? '#C4622D' : '#e0e0e0'}`,
      borderRadius: 8, padding: 12, marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center',
    }}>
      {showCheckbox && (
        <input type="checkbox" checked={selected} onChange={onToggleSelect} style={{ cursor: 'pointer' }} />
      )}

      {photoUrl && (
        <img src={photoUrl} alt="Batch" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{student.first_name} {student.last_name}</div>
        <div style={{ fontSize: 12, color: '#888' }}>
          {courseName} · {batch.piece_count} pcs · <strong>{batch.initials}</strong>
          {daysReady !== null && ` · Ready ${daysReady}d ago`}
          {batch.delivery_method === 'collect' && <span style={{ color: '#2D8C4E', fontWeight: 600 }}> · Collecting</span>}
          {batch.delivery_method === 'deliver' && <span style={{ color: '#C4622D', fontWeight: 600 }}> · Delivery</span>}
        </div>
        {noResponse && (
          <div style={{ fontSize: 11, color: '#E65100', fontWeight: 600, marginTop: 2 }}>⚠️ No response</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {nextStatus && (
          <button
            onClick={() => onStatusUpdate(batch.id, nextStatus)}
            style={{
              padding: '6px 12px',
              background: nextStatus === 'ready' ? '#2D8C4E' : '#E65100',
              color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 600,
            }}
          >
            {nextStatus === 'ready' ? 'Mark Ready' : `→ ${STATUS_LABELS[nextStatus]}`}
          </button>
        )}
        {isReady && (
          <>
            <button
              onClick={() => onComplete(batch.id, 'collected')}
              style={{ padding: '6px 12px', background: '#1565C0', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
            >
              Collected
            </button>
            <button
              onClick={() => onComplete(batch.id, 'shipped')}
              style={{ padding: '6px 12px', background: '#1565C0', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
            >
              Shipped
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

Save to `frontend/src/pages/AdminPiecePipeline.jsx`.

- [ ] **Step 2: Add admin route in `App.jsx`**

Import at the top:
```javascript
import AdminPiecePipeline from './pages/AdminPiecePipeline';
```

Add inside the admin route block (after the gallery route):
```jsx
<Route path="pieces" element={<AdminPiecePipeline />} />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AdminPiecePipeline.jsx frontend/src/App.jsx
git commit -m "feat: add admin piece pipeline dashboard with search and bulk actions"
```

---

## Task 8: Navigation Links

**Files:**
- Modify: `frontend/src/components/Navigation.jsx` (or wherever nav links live)

- [ ] **Step 1: Find and add navigation links**

Find the student navigation component and add a "My Pieces" link pointing to `/my-pieces`.

Find the admin navigation/sidebar and add a "Pieces" link pointing to `/admin/pieces`.

Follow the existing patterns for nav items (icons, labels, active states).

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: add My Pieces and admin Pieces nav links"
```

---

## Task 9: Integration Testing

- [ ] **Step 1: Test student flow end-to-end**

1. Start frontend and backend dev servers
2. Log in as a student
3. Navigate to My Pieces page
4. Click "Log My Pieces" — fill in initials, piece count, upload a photo
5. Submit — verify batch appears in list with "Logged" status
6. Verify the batch appears in the database via Supabase

- [ ] **Step 2: Test admin flow end-to-end**

1. Log in as admin (info@ves.sg)
2. Navigate to Admin Pieces Pipeline
3. Verify the logged batch appears in "Logged / Drying" section
4. Click "→ Bisque Fired" — verify status updates
5. Click "→ Glaze Fired" — verify status updates
6. Click "Mark Ready" — verify status updates AND check email was sent to student
7. Search by initials — verify results appear
8. Mark as "Collected" — verify batch moves to completed

- [ ] **Step 3: Test student notification flow**

1. Log in as student again
2. Verify the batch now shows "Ready!" status with green badge
3. Click "I'll Collect" — verify status changes to "Collecting"
4. Check email inbox for the "Your pottery is ready!" email

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration testing fixes for piece tracking"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Database migration | `server/migrations/piece_batches.sql` |
| 2 | DB CRUD functions | `server/utils/supabaseDb.js` |
| 3 | Email templates | `server/email-templates/pieces/*.js` |
| 4 | Backend API routes | `server/routes/pieces.js`, `server/index.js` |
| 5 | Reminder cron job | `server/utils/cohortAutoProcessor.js` |
| 6 | Student MyPieces page | `frontend/src/pages/MyPieces.jsx`, `App.jsx` |
| 7 | Admin Pipeline page | `frontend/src/pages/AdminPiecePipeline.jsx`, `App.jsx` |
| 8 | Navigation links | Navigation components |
| 9 | Integration testing | End-to-end verification |
