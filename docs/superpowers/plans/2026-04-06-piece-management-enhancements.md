# Piece Management Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the piece lifecycle with kiln firing runs, auto-recycling, admin gallery management, and appointment-based collection with glass cabinet placement.

**Architecture:** Four independent features sharing the existing piece_batches table and pipeline UI. Firing runs add a new table. Collection flow adds a new status (`in_cabinet`) and two columns. Auto-recycle extends the existing daily job. Admin gallery is a new standalone page.

**Tech Stack:** Express.js (CommonJS), Supabase PostgreSQL, React 18 (inline styles, no Tailwind in admin pages), email templates via `wrapEmailTemplate`.

**Spec:** `docs/superpowers/specs/2026-04-06-piece-management-enhancements-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `server/migrations/firing_runs.sql` | Schema for firing_runs + firing_run_batches tables |
| `server/migrations/piece_batches_v2.sql` | Add collection_date, cabinet_placed_at to piece_batches |
| `server/email-templates/pieces/pieces-recycled.js` | Disposal email when auto-recycled at 60 days |
| `server/email-templates/pieces/pieces-in-cabinet.js` | Notification when staff places pieces in glass cabinet |
| `frontend/src/pages/AdminGallery.jsx` | Admin gallery curation/moderation page |

### Modified Files
| File | Changes |
|------|---------|
| `server/utils/supabaseDb.js` | Add firing run CRUD, gallery search by initials, expired batches query, in_cabinet status handling |
| `server/routes/pieces.js` | Add firing run endpoints, cabinet endpoints, admin gallery endpoints, collection date endpoint |
| `server/utils/cohortAutoProcessor.js` | Add `autoRecycleExpiredBatches()` to daily job |
| `frontend/src/pages/AdminPiecePipeline.jsx` | Firing run creation, collection dates display, in_cabinet actions, firing run history |
| `frontend/src/pages/MyPieces.jsx` | Date picker for collection, in_cabinet status, "I've Collected" button |
| `frontend/src/App.jsx` | Already has `/admin/gallery` route — no change needed |

---

## Task 1: Database Migrations

**Files:**
- Create: `server/migrations/firing_runs.sql`
- Create: `server/migrations/piece_batches_v2.sql`

- [ ] **Step 1: Create firing_runs schema**

```sql
-- server/migrations/firing_runs.sql

-- Firing runs table — groups batches into kiln loads
CREATE TABLE IF NOT EXISTS firing_runs (
  id SERIAL PRIMARY KEY,
  firing_type TEXT NOT NULL CHECK (firing_type IN ('bisque', 'glaze')),
  status TEXT NOT NULL DEFAULT 'loading' CHECK (status IN ('loading', 'firing', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fired_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Join table linking batches to firing runs
CREATE TABLE IF NOT EXISTS firing_run_batches (
  id SERIAL PRIMARY KEY,
  firing_run_id INTEGER NOT NULL REFERENCES firing_runs(id) ON DELETE CASCADE,
  piece_batch_id INTEGER NOT NULL REFERENCES piece_batches(id) ON DELETE CASCADE,
  UNIQUE(piece_batch_id)
);

CREATE INDEX idx_firing_runs_status ON firing_runs(status);
CREATE INDEX idx_firing_run_batches_run ON firing_run_batches(firing_run_id);
CREATE INDEX idx_firing_run_batches_batch ON firing_run_batches(piece_batch_id);
```

- [ ] **Step 2: Create piece_batches_v2 migration**

```sql
-- server/migrations/piece_batches_v2.sql

-- Add collection appointment and cabinet placement tracking
ALTER TABLE piece_batches ADD COLUMN IF NOT EXISTS collection_date TIMESTAMPTZ;
ALTER TABLE piece_batches ADD COLUMN IF NOT EXISTS cabinet_placed_at TIMESTAMPTZ;
```

- [ ] **Step 3: Run migrations against Supabase**

Run both SQL files via the Supabase dashboard SQL editor or CLI.

- [ ] **Step 4: Commit**

```bash
git add server/migrations/firing_runs.sql server/migrations/piece_batches_v2.sql
git commit -m "feat: add firing_runs tables and piece_batches collection columns"
```

---

## Task 2: Database Functions for Firing Runs

**Files:**
- Modify: `server/utils/supabaseDb.js` (append after line ~1638, before `};`)

- [ ] **Step 1: Add firing run CRUD functions**

Add these functions before the `module.exports` block in `supabaseDb.js`:

```javascript
// ==================== Firing Runs ====================

async function createFiringRun({ firingType, notes, batchIds }) {
  // Create the firing run
  const { data: run, error: runError } = await supabase
    .from('firing_runs')
    .insert({
      firing_type: firingType,
      notes: notes || null,
      status: 'loading',
    })
    .select()
    .single();

  if (runError) throw runError;

  // Link batches to the run
  const links = batchIds.map(batchId => ({
    firing_run_id: run.id,
    piece_batch_id: batchId,
  }));

  const { error: linkError } = await supabase
    .from('firing_run_batches')
    .insert(links);

  if (linkError) throw linkError;

  return run;
}

async function getFiringRuns({ status, limit = 20 } = {}) {
  let query = supabase
    .from('firing_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function getFiringRunById(runId) {
  const { data: run, error: runError } = await supabase
    .from('firing_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (runError) throw runError;

  const { data: links, error: linkError } = await supabase
    .from('firing_run_batches')
    .select('piece_batch_id')
    .eq('firing_run_id', runId);

  if (linkError) throw linkError;

  // Fetch the actual batches with customer/enrollment info
  const batchIds = (links || []).map(l => l.piece_batch_id);
  if (batchIds.length === 0) return { ...run, batches: [] };

  const { data: batches, error: batchError } = await supabase
    .from('piece_batches')
    .select('*, customers(id, first_name, last_name, email), course_enrollments(course_type, course_title, course_variant_title, course_identifier)')
    .in('id', batchIds);

  if (batchError) throw batchError;

  return { ...run, batches: batches || [] };
}

async function completeFiringRun(runId) {
  const { data, error } = await supabase
    .from('firing_runs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', runId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Add to module.exports**

Add these to the `module.exports` block under `// Piece batch functions`:

```javascript
  // Firing run functions
  createFiringRun,
  getFiringRuns,
  getFiringRunById,
  completeFiringRun,
```

- [ ] **Step 3: Commit**

```bash
git add server/utils/supabaseDb.js
git commit -m "feat: add firing run database functions"
```

---

## Task 3: Database Functions for Auto-Recycle & Gallery Search

**Files:**
- Modify: `server/utils/supabaseDb.js`

- [ ] **Step 1: Add expired batches query and gallery search functions**

Add before `module.exports`:

```javascript
// ==================== Auto-Recycle ====================

async function getExpiredPieceBatches() {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('piece_batches')
    .select('*, customers(id, first_name, last_name, email), course_enrollments(course_type, course_title, course_variant_title, course_identifier)')
    .in('status', ['ready', 'collecting', 'delivering'])
    .lt('hold_expires_at', now)
    .not('hold_expires_at', 'is', null);

  if (error) throw error;
  return data || [];
}

// ==================== Gallery Admin ====================

async function searchPotteryPiecesByInitials(initials) {
  // Join through customers to match initials
  const { data: customers, error: custError } = await supabase
    .from('customers')
    .select('id')
    .ilike('initials', `%${initials}%`);

  if (custError) throw custError;
  if (!customers || customers.length === 0) return [];

  const customerIds = customers.map(c => c.id);

  const { data, error } = await supabase
    .from('pottery_pieces')
    .select(`
      *,
      customer:customers!pottery_pieces_customer_id_fkey (
        id, first_name, last_name, email, initials
      )
    `)
    .in('customer_id', customerIds)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}
```

- [ ] **Step 2: Add to module.exports**

```javascript
  // Auto-recycle
  getExpiredPieceBatches,
  // Gallery admin
  searchPotteryPiecesByInitials,
```

- [ ] **Step 3: Commit**

```bash
git add server/utils/supabaseDb.js
git commit -m "feat: add expired batch query and gallery initials search"
```

---

## Task 4: Firing Run API Endpoints

**Files:**
- Modify: `server/routes/pieces.js` (add after the bulk-status endpoint, before the AI identify endpoint)

- [ ] **Step 1: Add firing run endpoints**

Add these routes inside the module.exports function in `server/routes/pieces.js`, in the Admin Endpoints section:

```javascript
  // ==================== Firing Runs ====================

  // Create a firing run + assign batches + advance statuses
  app.post('/api/admin/pieces/firing-runs', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { firingType, notes, batchIds } = req.body;

    if (!['bisque', 'glaze'].includes(firingType)) {
      return res.status(400).json({ error: 'firingType must be "bisque" or "glaze"' });
    }
    if (!Array.isArray(batchIds) || batchIds.length === 0) {
      return res.status(400).json({ error: 'batchIds array required' });
    }

    // Create the run and link batches
    const run = await supabaseDb.createFiringRun({ firingType, notes, batchIds });

    // Advance all batches to the appropriate status
    const newStatus = firingType === 'bisque' ? 'bisque_fired' : 'glaze_fired';
    for (const batchId of batchIds) {
      await supabaseDb.updatePieceBatchStatus(batchId, newStatus);
    }

    res.json({ success: true, run });
  }));

  // List firing runs (active + recent)
  app.get('/api/admin/pieces/firing-runs', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const status = req.query.status || null;
    const runs = await supabaseDb.getFiringRuns({ status });
    res.json({ success: true, runs });
  }));

  // Get single firing run with batches
  app.get('/api/admin/pieces/firing-runs/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const runId = parseInt(req.params.id);
    const run = await supabaseDb.getFiringRunById(runId);
    res.json({ success: true, run });
  }));

  // Complete a firing run — advance all batches to next status
  app.put('/api/admin/pieces/firing-runs/:id/complete', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const runId = parseInt(req.params.id);

    const run = await supabaseDb.getFiringRunById(runId);
    if (!run) return res.status(404).json({ error: 'Firing run not found' });

    // Determine next status for batches
    const nextStatus = run.firing_type === 'bisque' ? 'glaze_fired' : 'ready';

    // Advance all batches in the run
    for (const batch of run.batches) {
      await supabaseDb.updatePieceBatchStatus(batch.id, nextStatus);

      // Send ready email if advancing to 'ready'
      if (nextStatus === 'ready' && batch.customers) {
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
          courseIdentifier: batch.course_enrollments?.course_identifier || `batch-${batch.id}`,
          subject,
          html,
          recipientEmails: [student.email],
          sentBy: 'system',
        });
      }
    }

    // Mark the run as completed
    const completedRun = await supabaseDb.completeFiringRun(runId);

    res.json({ success: true, run: completedRun });
  }));
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/pieces.js
git commit -m "feat: add firing run API endpoints"
```

---

## Task 5: Collection Flow & Cabinet API Endpoints

**Files:**
- Modify: `server/routes/pieces.js`

- [ ] **Step 1: Update the delivery endpoint to support collection dates**

Replace the existing `PUT /api/pieces/batches/:id/delivery` endpoint (lines ~96-118) with:

```javascript
  // Set delivery method (with optional collection date)
  app.put('/api/pieces/batches/:id/delivery', authenticateToken, asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.id);
    const customerId = req.user.customerId;
    const { method, collectionDate } = req.body; // 'collect' or 'deliver'

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

    // For collection, require a date at least 2 days out
    if (method === 'collect') {
      if (!collectionDate) {
        return res.status(400).json({ error: 'Collection date is required' });
      }
      const chosen = new Date(collectionDate);
      const minDate = new Date();
      minDate.setDate(minDate.getDate() + 2);
      minDate.setHours(0, 0, 0, 0);
      if (chosen < minDate) {
        return res.status(400).json({ error: 'Collection date must be at least 2 days from now' });
      }
      updates.collection_date = chosen.toISOString();
    }

    const updated = await supabaseDb.updatePieceBatch(batchId, updates);
    res.json({ success: true, batch: updated });
  }));
```

- [ ] **Step 2: Add cabinet and collection confirmation endpoints**

Add to the Admin Endpoints section:

```javascript
  // ==================== Cabinet & Collection ====================

  // Admin: Place pieces in cabinet
  app.put('/api/admin/pieces/batches/:id/cabinet', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.id);

    const batch = await supabaseDb.updatePieceBatchStatus(batchId, 'in_cabinet', {
      cabinet_placed_at: new Date().toISOString(),
    });

    // Send cabinet notification email
    if (batch.customers) {
      const student = batch.customers;
      const photoUrl = batch.photo_urls && batch.photo_urls.length > 0 ? batch.photo_urls[0] : null;
      const appUrl = process.env.FRONTEND_URL || 'https://club.ves.sg';

      const cabinetTemplate = require('../email-templates/pieces/pieces-in-cabinet');
      const { subject, html } = cabinetTemplate.generate({
        studentName: student.first_name || 'there',
        pieceCount: batch.piece_count,
        photoUrl,
        appUrl,
      });

      await sendAndLogEmail({
        emailType: 'pieces-in-cabinet',
        courseIdentifier: batch.course_enrollments?.course_identifier || `batch-${batchId}`,
        subject,
        html,
        recipientEmails: [student.email],
        sentBy: 'system',
      });
    }

    res.json({ success: true, batch });
  }));

  // Admin: Mark collected (fallback)
  app.put('/api/admin/pieces/batches/:id/mark-collected', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.id);
    const batch = await supabaseDb.updatePieceBatchStatus(batchId, 'collected');
    res.json({ success: true, batch });
  }));
```

Add to the Student Endpoints section:

```javascript
  // Student: Confirm collection
  app.put('/api/pieces/batches/:id/confirm-collected', authenticateToken, asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.id);
    const customerId = req.user.customerId;

    const batch = await supabaseDb.getPieceBatchById(batchId);
    if (!batch || batch.customer_id !== customerId) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    if (batch.status !== 'in_cabinet') {
      return res.status(400).json({ error: 'Batch is not in the cabinet yet' });
    }

    const updated = await supabaseDb.updatePieceBatchStatus(batchId, 'collected');
    res.json({ success: true, batch: updated });
  }));
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/pieces.js
git commit -m "feat: add collection flow and cabinet management endpoints"
```

---

## Task 6: Admin Gallery API Endpoints

**Files:**
- Modify: `server/routes/pieces.js`

- [ ] **Step 1: Add admin gallery endpoints**

Add to the Admin Endpoints section in `server/routes/pieces.js`:

```javascript
  // ==================== Admin Gallery ====================

  // List all gallery pieces (paginated)
  app.get('/api/admin/gallery/pieces', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const pieces = await supabaseDb.getAllPotteryPieces();
    res.json({ success: true, pieces });
  }));

  // Search gallery pieces by student initials (min 3 chars)
  app.get('/api/admin/gallery/search', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { initials } = req.query;
    if (!initials || initials.length < 3) {
      return res.status(400).json({ error: 'Initials must be at least 3 characters' });
    }
    const pieces = await supabaseDb.searchPotteryPiecesByInitials(initials);
    res.json({ success: true, pieces });
  }));

  // Toggle featured status
  app.put('/api/admin/gallery/pieces/:id/feature', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const pieceId = parseInt(req.params.id);
    const piece = await supabaseDb.getPotteryPieceById(pieceId);
    if (!piece) return res.status(404).json({ error: 'Piece not found' });

    const updated = await supabaseDb.updatePotteryPiece(pieceId, { featured: !piece.featured });
    res.json({ success: true, piece: updated });
  }));

  // Toggle public/private
  app.put('/api/admin/gallery/pieces/:id/visibility', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const pieceId = parseInt(req.params.id);
    const piece = await supabaseDb.getPotteryPieceById(pieceId);
    if (!piece) return res.status(404).json({ error: 'Piece not found' });

    const updated = await supabaseDb.updatePotteryPiece(pieceId, { is_public: !piece.is_public });
    res.json({ success: true, piece: updated });
  }));

  // Delete piece
  app.delete('/api/admin/gallery/pieces/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const pieceId = parseInt(req.params.id);
    await supabaseDb.deletePotteryPiece(pieceId);
    res.json({ success: true });
  }));
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/pieces.js
git commit -m "feat: add admin gallery management endpoints"
```

---

## Task 7: Email Templates

**Files:**
- Create: `server/email-templates/pieces/pieces-recycled.js`
- Create: `server/email-templates/pieces/pieces-in-cabinet.js`

- [ ] **Step 1: Create recycled/disposal email template**

```javascript
// server/email-templates/pieces/pieces-recycled.js
const { wrapEmailTemplate } = require('../base');

function generate({ studentName, pieceCount, courseName, appUrl }) {
  const subject = 'A note about your pottery pieces';

  const body = `
    <h2 style="margin: 0 0 16px; font-size: 22px; color: #282828; font-weight: 600;">
      Hi ${studentName},
    </h2>
    <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #333;">
      We've been keeping your <strong>${pieceCount} piece${pieceCount !== 1 ? 's' : ''}</strong> from
      <strong>${courseName}</strong> safe for 60 days since they were ready.
    </p>
    <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #333;">
      As we need to make space in the studio for new work, we've unfortunately had to let them go.
    </p>
    <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #333;">
      We hope you enjoyed making them — and we'd love to see you back at the wheel soon!
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center">
          <a href="${appUrl}/courses" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
            Browse Upcoming Courses
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #888;">
      Questions? Reply to this email or visit the studio.
    </p>
  `;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
```

- [ ] **Step 2: Create in-cabinet notification email template**

```javascript
// server/email-templates/pieces/pieces-in-cabinet.js
const { wrapEmailTemplate } = require('../base');

function generate({ studentName, pieceCount, photoUrl, appUrl }) {
  const subject = 'Your pieces are in the cabinet — come collect!';

  const body = `
    <h2 style="margin: 0 0 16px; font-size: 22px; color: #282828; font-weight: 600;">
      Hi ${studentName},
    </h2>
    <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #333;">
      Your <strong>${pieceCount} piece${pieceCount !== 1 ? 's' : ''}</strong>
      ${pieceCount !== 1 ? 'are' : 'is'} now in the glass cabinet outside the studio — come pick
      ${pieceCount !== 1 ? 'them' : 'it'} up anytime!
    </p>
    ${photoUrl ? `
    <div style="margin: 0 0 20px; text-align: center;">
      <img src="${photoUrl}" alt="Your pottery pieces" style="max-width: 100%; border-radius: 8px; max-height: 300px;" />
    </div>
    ` : ''}
    <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333;">
      Once you've collected ${pieceCount !== 1 ? 'them' : 'it'}, just tap the button below to let us know.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td align="center">
          <a href="${appUrl}/gallery?tab=pieces" style="display: inline-block; padding: 14px 32px; background-color: #2D8C4E; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
            I've Collected My Pieces
          </a>
        </td>
      </tr>
    </table>
    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #888;">
      Questions? Reply to this email or visit the studio.
    </p>
  `;

  return { subject, html: wrapEmailTemplate(body) };
}

module.exports = { generate };
```

- [ ] **Step 3: Commit**

```bash
git add server/email-templates/pieces/pieces-recycled.js server/email-templates/pieces/pieces-in-cabinet.js
git commit -m "feat: add recycled and in-cabinet email templates"
```

---

## Task 8: Auto-Recycle in Daily Job

**Files:**
- Modify: `server/utils/cohortAutoProcessor.js`

- [ ] **Step 1: Add autoRecycleExpiredBatches function**

Add this function before `startAutomaticProcessing()` (before line ~547):

```javascript
async function autoRecycleExpiredBatches() {
  try {
    const supabaseDb = require('./supabaseDb');
    const { sendAndLogEmail } = require('./emailService');
    const recycledTemplate = require('../email-templates/pieces/pieces-recycled');
    const appUrl = process.env.FRONTEND_URL || 'https://club.ves.sg';

    const expiredBatches = await supabaseDb.getExpiredPieceBatches();
    console.log(`[Auto-Processor] Found ${expiredBatches.length} expired piece batches to recycle`);

    let recycled = 0;
    for (const batch of expiredBatches) {
      // Update status to recycled
      await supabaseDb.updatePieceBatchStatus(batch.id, 'recycled');

      // Send disposal email
      const student = batch.customers;
      if (student && student.email) {
        const courseName = batch.course_enrollments?.course_title || batch.course_enrollments?.course_variant_title || 'your course';

        const { subject, html } = recycledTemplate.generate({
          studentName: student.first_name || 'there',
          pieceCount: batch.piece_count,
          courseName,
          appUrl,
        });

        await sendAndLogEmail({
          emailType: 'pieces-recycled',
          courseIdentifier: batch.course_enrollments?.course_identifier || `batch-${batch.id}`,
          subject,
          html,
          recipientEmails: [student.email],
          sentBy: 'system',
        });
      }

      recycled++;
    }

    console.log(`[Auto-Processor] ✅ Recycled ${recycled} expired piece batches`);
    return { success: true, recycled };
  } catch (error) {
    console.error('[Auto-Processor] Error in autoRecycleExpiredBatches:', error);
    return { success: false, error: error.message };
  }
}
```

- [ ] **Step 2: Add to startup and daily schedule**

In `startAutomaticProcessing()`, add the call to the initial run (after `checkPieceReminders().catch(...)` on line ~553):

```javascript
    autoRecycleExpiredBatches().catch(console.error);
```

And in the daily 2AM check (after `checkPieceReminders().catch(...)` on line ~570):

```javascript
      autoRecycleExpiredBatches().catch(console.error);
```

- [ ] **Step 3: Add to module.exports**

Add `autoRecycleExpiredBatches` to the `module.exports` object.

- [ ] **Step 4: Commit**

```bash
git add server/utils/cohortAutoProcessor.js
git commit -m "feat: add auto-recycle for expired piece batches in daily job"
```

---

## Task 9: Update AdminPiecePipeline — Firing Runs & Collection UI

**Files:**
- Modify: `frontend/src/pages/AdminPiecePipeline.jsx`

- [ ] **Step 1: Add firing run state and fetch**

Add to the component state (after line ~28):

```javascript
  const [firingRuns, setFiringRuns] = useState([]);
  const [showFiringRunForm, setShowFiringRunForm] = useState(false);
  const [firingRunType, setFiringRunType] = useState('bisque');
  const [firingRunNotes, setFiringRunNotes] = useState('');
  const [showRunHistory, setShowRunHistory] = useState(false);
```

Add a fetch function after `fetchPipeline`:

```javascript
  const fetchFiringRuns = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/pieces/firing-runs');
      setFiringRuns(data.runs || []);
    } catch (err) {
      console.error('Failed to fetch firing runs:', err);
    }
  }, []);

  useEffect(() => { fetchFiringRuns(); }, [fetchFiringRuns]);
```

- [ ] **Step 2: Add firing run creation handler**

```javascript
  const handleCreateFiringRun = async () => {
    if (selectedBatches.size === 0) return;
    try {
      await api.post('/admin/pieces/firing-runs', {
        firingType: firingRunType,
        notes: firingRunNotes || null,
        batchIds: Array.from(selectedBatches),
      });
      setSelectedBatches(new Set());
      setShowFiringRunForm(false);
      setFiringRunNotes('');
      fetchPipeline();
      fetchFiringRuns();
    } catch (err) {
      console.error('Failed to create firing run:', err);
    }
  };

  const handleCompleteFiringRun = async (runId) => {
    try {
      await api.put(`/admin/pieces/firing-runs/${runId}/complete`);
      fetchPipeline();
      fetchFiringRuns();
    } catch (err) {
      console.error('Failed to complete firing run:', err);
    }
  };

  const handlePlaceInCabinet = async (batchId) => {
    try {
      await api.put(`/admin/pieces/batches/${batchId}/cabinet`);
      fetchPipeline();
    } catch (err) {
      console.error('Failed to place in cabinet:', err);
    }
  };

  const handleMarkCollected = async (batchId) => {
    try {
      await api.put(`/admin/pieces/batches/${batchId}/mark-collected`);
      fetchPipeline();
    } catch (err) {
      console.error('Failed to mark collected:', err);
    }
  };
```

- [ ] **Step 3: Update STATUS constants to include new statuses**

Replace the STATUS constants at the top of the file:

```javascript
const STATUS_ORDER = ['ready', 'in_cabinet', 'collecting', 'glaze_fired', 'bisque_fired', 'logged'];
const STATUS_LABELS = {
  logged: 'Logged / Drying',
  bisque_fired: 'Bisque Fired',
  glaze_fired: 'Glaze Fired',
  ready: 'Ready for Collection',
  collecting: 'Collection Scheduled',
  in_cabinet: 'In Cabinet',
};
const STATUS_COLORS = {
  logged: '#888',
  bisque_fired: '#E65100',
  glaze_fired: '#E65100',
  ready: '#2D8C4E',
  collecting: '#2D8C4E',
  in_cabinet: '#C4622D',
};
```

- [ ] **Step 4: Update bulk actions bar to include firing run creation**

Replace the bulk actions section (lines ~145-153) with:

```javascript
      {/* Bulk Actions */}
      {selectedBatches.size > 0 && (
        <div style={{ background: '#282828', color: 'white', borderRadius: 10, padding: 12, marginBottom: 16, position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13 }}>{selectedBatches.size} selected</span>
            <button onClick={() => handleBulkStatus('bisque_fired')} style={{ padding: '6px 12px', background: '#E65100', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>→ Bisque Fired</button>
            <button onClick={() => handleBulkStatus('glaze_fired')} style={{ padding: '6px 12px', background: '#E65100', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>→ Glaze Fired</button>
            <button onClick={() => handleBulkStatus('ready')} style={{ padding: '6px 12px', background: '#2D8C4E', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>→ Ready</button>
            <button onClick={() => setShowFiringRunForm(!showFiringRunForm)} style={{ padding: '6px 12px', background: '#C4622D', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>🔥 Create Firing Run</button>
            <button onClick={() => setSelectedBatches(new Set())} style={{ marginLeft: 'auto', padding: '6px 12px', background: 'transparent', color: '#aaa', border: '1px solid #555', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>Clear</button>
          </div>

          {showFiringRunForm && (
            <div style={{ marginTop: 12, padding: 12, background: '#333', borderRadius: 8 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ fontSize: 11, color: '#aaa', display: 'block', marginBottom: 4 }}>Type</label>
                  <select value={firingRunType} onChange={e => setFiringRunType(e.target.value)} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #555', background: '#444', color: 'white', fontSize: 13 }}>
                    <option value="bisque">Bisque</option>
                    <option value="glaze">Glaze</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: '#aaa', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
                  <input value={firingRunNotes} onChange={e => setFiringRunNotes(e.target.value)} placeholder="e.g. Large kiln, cone 6" style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid #555', background: '#444', color: 'white', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <button onClick={handleCreateFiringRun} style={{ padding: '8px 20px', background: '#E65100', color: 'white', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-end' }}>
                  Fire {selectedBatches.size} batch{selectedBatches.size !== 1 ? 'es' : ''}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 5: Update pipeline grouping to include new statuses**

In the `fetchPipeline` success handler, update the pipeline endpoint response handling. The backend needs to be updated too — in `server/routes/pieces.js`, update the `GET /api/admin/pieces/pipeline` endpoint to include `collecting` and `in_cabinet`:

In `server/routes/pieces.js`, replace the pipeline grouping logic (lines ~126-138):

```javascript
    const grouped = {
      logged: batches.filter(b => b.status === 'logged'),
      bisque_fired: batches.filter(b => b.status === 'bisque_fired'),
      glaze_fired: batches.filter(b => b.status === 'glaze_fired'),
      ready: batches.filter(b => b.status === 'ready'),
      collecting: batches.filter(b => b.status === 'collecting'),
      in_cabinet: batches.filter(b => b.status === 'in_cabinet'),
    };

    const makeStats = (arr) => ({ count: arr.length, pieces: arr.reduce((s, b) => s + b.piece_count, 0) });

    const stats = {
      logged: makeStats(grouped.logged),
      bisque_fired: makeStats(grouped.bisque_fired),
      glaze_fired: makeStats(grouped.glaze_fired),
      ready: makeStats(grouped.ready),
      collecting: makeStats(grouped.collecting),
      in_cabinet: makeStats(grouped.in_cabinet),
    };
```

- [ ] **Step 6: Add firing run history section**

Add after the pipeline sections, before the closing `</div>`:

```javascript
      {/* Firing Run History */}
      <div style={{ marginTop: 32 }}>
        <button
          onClick={() => setShowRunHistory(!showRunHistory)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#888', padding: 0 }}
        >
          {showRunHistory ? '▼' : '▶'} Firing Run History ({firingRuns.length})
        </button>

        {showRunHistory && (
          <div style={{ marginTop: 12 }}>
            {firingRuns.length === 0 && (
              <div style={{ color: '#888', fontSize: 13 }}>No firing runs yet.</div>
            )}
            {firingRuns.map(run => (
              <div key={run.id} style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: 8, padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {run.firing_type === 'bisque' ? 'Bisque' : 'Glaze'} Run
                  </span>
                  <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>
                    {new Date(run.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                  </span>
                  {run.notes && <span style={{ fontSize: 12, color: '#aaa', marginLeft: 8 }}>— {run.notes}</span>}
                  <span style={{
                    marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                    background: run.status === 'completed' ? '#E8F5E9' : '#FFF3E0',
                    color: run.status === 'completed' ? '#2D8C4E' : '#E65100',
                  }}>
                    {run.status}
                  </span>
                </div>
                {run.status !== 'completed' && (
                  <button
                    onClick={() => handleCompleteFiringRun(run.id)}
                    style={{ padding: '6px 14px', background: '#2D8C4E', color: 'white', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                  >
                    Complete Run
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
```

- [ ] **Step 7: Update BatchCard to show collection date and cabinet actions**

Update the `BatchCard` component. Replace the action buttons section (lines ~220-249) with:

```javascript
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
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
        {batch.status === 'collecting' && (
          <button
            onClick={() => onPlaceInCabinet(batch.id)}
            style={{ padding: '6px 12px', background: '#C4622D', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
          >
            Place in Cabinet
          </button>
        )}
        {batch.status === 'in_cabinet' && (
          <button
            onClick={() => onMarkCollected(batch.id)}
            style={{ padding: '6px 12px', background: '#1565C0', color: 'white', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
          >
            Mark Collected
          </button>
        )}
        {batch.status === 'ready' && (
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
```

Update the `BatchCard` props to include the new handlers, and update the info line to show collection date:

```javascript
function BatchCard({ batch, daysSince, onStatusUpdate, onComplete, onPlaceInCabinet, onMarkCollected, selected, onToggleSelect, showCheckbox }) {
```

In the batch info line, add collection date display:

```javascript
          {batch.collection_date && <span style={{ color: '#C4622D' }}> · Pickup: {new Date(batch.collection_date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span>}
```

- [ ] **Step 8: Pass new handlers to BatchCard in pipeline sections**

Update all `<BatchCard>` renders to pass the new handlers:

```javascript
              <BatchCard
                key={batch.id}
                batch={batch}
                daysSince={daysSince}
                onStatusUpdate={handleStatusUpdate}
                onComplete={handleComplete}
                onPlaceInCabinet={handlePlaceInCabinet}
                onMarkCollected={handleMarkCollected}
                selected={selectedBatches.has(batch.id)}
                onToggleSelect={() => toggleSelect(batch.id)}
                showCheckbox
              />
```

Also update the search results BatchCard similarly (add `onPlaceInCabinet={handlePlaceInCabinet}` and `onMarkCollected={handleMarkCollected}`).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/AdminPiecePipeline.jsx server/routes/pieces.js
git commit -m "feat: add firing runs, collection dates, and cabinet actions to pipeline UI"
```

---

## Task 10: Update MyPieces — Date Picker & Collection Confirmation

**Files:**
- Modify: `frontend/src/pages/MyPieces.jsx`

- [ ] **Step 1: Add collection date state**

Add to component state (after line ~30):

```javascript
  const [collectionDates, setCollectionDates] = useState({});
```

- [ ] **Step 2: Update delivery choice handler to include collection date**

Replace the `handleDeliveryChoice` function:

```javascript
  const handleDeliveryChoice = async (batchId, method) => {
    try {
      const payload = { method };
      if (method === 'collect') {
        const date = collectionDates[batchId];
        if (!date) return;
        payload.collectionDate = date;
      }
      await api.put(`/pieces/batches/${batchId}/delivery`, payload);
      fetchBatches();
    } catch (err) {
      console.error('Failed to set delivery:', err);
    }
  };

  const handleConfirmCollected = async (batchId) => {
    try {
      await api.put(`/pieces/batches/${batchId}/confirm-collected`);
      fetchBatches();
    } catch (err) {
      console.error('Failed to confirm collection:', err);
    }
  };

  const getMinCollectionDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  };
```

- [ ] **Step 3: Update STATUS_CONFIG to include in_cabinet**

Update the `STATUS_CONFIG` object at the top of the file:

```javascript
const STATUS_CONFIG = {
  logged: { label: 'Logged', color: '#888', bg: '#f5f5f5' },
  bisque_fired: { label: 'Bisque Fired', color: '#888', bg: '#f5f5f5' },
  glaze_fired: { label: 'Glaze Firing', color: '#E65100', bg: '#FFF3E0' },
  ready: { label: 'Ready!', color: '#2D8C4E', bg: '#E8F5E9' },
  collecting: { label: 'Collection Scheduled', color: '#2D8C4E', bg: '#E8F5E9' },
  in_cabinet: { label: 'In Cabinet', color: '#C4622D', bg: '#FFF3E0' },
  delivering: { label: 'Delivery', color: '#C4622D', bg: '#FFF3E0' },
  collected: { label: 'Collected', color: '#1565C0', bg: '#E3F2FD' },
  shipped: { label: 'Shipped', color: '#1565C0', bg: '#E3F2FD' },
  recycled: { label: 'Recycled', color: '#888', bg: '#f5f5f5' },
};
```

- [ ] **Step 4: Replace the ready/collecting/delivering status UI in batch cards**

Replace the action buttons section in the batch map (lines ~265-291) with:

```javascript
            {/* Ready — choose collect (with date) or deliver */}
            {batch.status === 'ready' && (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Pick a collection date (at least 2 days from now)</label>
                  <input
                    type="date"
                    min={getMinCollectionDate()}
                    value={collectionDates[batch.id] || ''}
                    onChange={e => setCollectionDates(prev => ({ ...prev, [batch.id]: e.target.value }))}
                    style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 14, width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleDeliveryChoice(batch.id, 'collect')}
                    disabled={!collectionDates[batch.id]}
                    style={{
                      flex: 1, padding: 10, background: collectionDates[batch.id] ? '#2D8C4E' : '#ccc',
                      color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                    }}
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
              </div>
            )}

            {/* Collecting — waiting for studio */}
            {batch.status === 'collecting' && (
              <div style={{ fontSize: 13, color: '#2D8C4E', fontWeight: 600, marginTop: 4 }}>
                📅 Collection scheduled for {new Date(batch.collection_date).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })}
                <div style={{ fontSize: 12, color: '#888', fontWeight: 400, marginTop: 2 }}>Waiting for studio to prepare your pieces</div>
              </div>
            )}

            {/* In Cabinet — confirm collection */}
            {batch.status === 'in_cabinet' && (
              <div>
                <div style={{ fontSize: 13, color: '#C4622D', fontWeight: 600, marginBottom: 8 }}>
                  Your pieces are in the glass cabinet outside — pick them up anytime!
                </div>
                <button
                  onClick={() => handleConfirmCollected(batch.id)}
                  style={{ width: '100%', padding: 12, background: '#2D8C4E', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                >
                  I've Collected My Pieces
                </button>
              </div>
            )}

            {/* Delivering */}
            {batch.status === 'delivering' && (
              <div style={{ fontSize: 13, color: '#C4622D', fontWeight: 600, marginTop: 4 }}>
                📦 Delivery requested ($10) — we'll ship it to you!
              </div>
            )}

            {/* Collected */}
            {batch.status === 'collected' && (
              <div style={{ fontSize: 13, color: '#1565C0', fontWeight: 600, marginTop: 4 }}>
                ✅ Collected{batch.completed_at ? ` on ${new Date(batch.completed_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}` : ''}
              </div>
            )}
```

- [ ] **Step 5: Remove the old `isReady` check**

Remove the line `const isReady = batch.status === 'ready';` in the batch map since we now handle each status individually.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/MyPieces.jsx
git commit -m "feat: add collection date picker and cabinet confirmation to student pieces view"
```

---

## Task 11: Admin Gallery Page

**Files:**
- Create: `frontend/src/pages/AdminGallery.jsx`

- [ ] **Step 1: Create the admin gallery page**

```javascript
// frontend/src/pages/AdminGallery.jsx
import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

export default function AdminGallery() {
  const [pieces, setPieces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const fetchPieces = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/gallery/pieces');
      setPieces(data.pieces || []);
    } catch (err) {
      console.error('Failed to fetch pieces:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPieces(); }, [fetchPieces]);

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (q.length < 3) return;
    setIsSearching(true);
    try {
      const { data } = await api.get(`/admin/gallery/search?initials=${encodeURIComponent(q)}`);
      setPieces(data.pieces || []);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    fetchPieces();
  };

  const handleToggleFeatured = async (pieceId) => {
    try {
      await api.put(`/admin/gallery/pieces/${pieceId}/feature`);
      setPieces(prev => prev.map(p => p.id === pieceId ? { ...p, featured: !p.featured } : p));
    } catch (err) {
      console.error('Failed to toggle featured:', err);
    }
  };

  const handleToggleVisibility = async (pieceId) => {
    try {
      await api.put(`/admin/gallery/pieces/${pieceId}/visibility`);
      setPieces(prev => prev.map(p => p.id === pieceId ? { ...p, is_public: !p.is_public } : p));
    } catch (err) {
      console.error('Failed to toggle visibility:', err);
    }
  };

  const handleDelete = async (pieceId) => {
    if (!window.confirm('Delete this piece? This cannot be undone.')) return;
    try {
      await api.delete(`/admin/gallery/pieces/${pieceId}`);
      setPieces(prev => prev.filter(p => p.id !== pieceId));
    } catch (err) {
      console.error('Failed to delete piece:', err);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading gallery...</div>;
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ margin: '0 0 20px', fontSize: 24, color: '#282828' }}>Gallery Management</h1>

      {/* Search */}
      <div style={{ background: 'white', borderRadius: 10, padding: 16, marginBottom: 24, border: '1px solid #e0e0e0' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search by initials (min 3 characters)"
            style={{ flex: 1, padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 16, letterSpacing: 2, fontWeight: 600 }}
          />
          <button
            onClick={handleSearch}
            disabled={searchQuery.trim().length < 3 || isSearching}
            style={{ padding: '10px 20px', background: searchQuery.trim().length < 3 ? '#ccc' : '#282828', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
          >
            Search
          </button>
          {searchQuery && (
            <button onClick={handleClearSearch} style={{ padding: '10px 16px', background: 'white', color: '#888', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
        {pieces.length} piece{pieces.length !== 1 ? 's' : ''}
        {pieces.filter(p => p.featured).length > 0 && ` · ${pieces.filter(p => p.featured).length} featured`}
        {pieces.filter(p => p.is_public).length > 0 && ` · ${pieces.filter(p => p.is_public).length} public`}
      </div>

      {/* Pieces Grid */}
      {pieces.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>No pieces found.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {pieces.map(piece => {
            const student = piece.customer || {};
            const thumbnail = piece.images && piece.images.length > 0 ? (piece.images[0].url || piece.images[0]) : null;

            return (
              <div key={piece.id} style={{
                background: 'white', border: `1px solid ${piece.featured ? '#C4622D' : '#e0e0e0'}`,
                borderRadius: 10, overflow: 'hidden',
              }}>
                {/* Image */}
                {thumbnail ? (
                  <img src={thumbnail} alt={piece.title || 'Piece'} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: 160, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 32 }}>🏺</div>
                )}

                {/* Info */}
                <div style={{ padding: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#282828', marginBottom: 2 }}>
                    {piece.title || 'Untitled'}
                    {piece.featured && <span style={{ color: '#C4622D', marginLeft: 4 }}>★</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                    {student.initials || `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown'}
                    {piece.clay_type && ` · ${piece.clay_type}`}
                    {piece.created_at && ` · ${new Date(piece.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => handleToggleFeatured(piece.id)}
                      title={piece.featured ? 'Unfeature' : 'Feature'}
                      style={{ padding: '4px 8px', background: piece.featured ? '#C4622D' : '#f5f5f5', color: piece.featured ? 'white' : '#888', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
                    >
                      {piece.featured ? '★ Featured' : '☆ Feature'}
                    </button>
                    <button
                      onClick={() => handleToggleVisibility(piece.id)}
                      title={piece.is_public ? 'Make private' : 'Make public'}
                      style={{ padding: '4px 8px', background: piece.is_public ? '#E8F5E9' : '#f5f5f5', color: piece.is_public ? '#2D8C4E' : '#888', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
                    >
                      {piece.is_public ? '🌐 Public' : '🔒 Private'}
                    </button>
                    <button
                      onClick={() => handleDelete(piece.id)}
                      title="Delete piece"
                      style={{ padding: '4px 8px', background: '#f5f5f5', color: '#D32F2F', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', marginLeft: 'auto' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify route exists**

Check `frontend/src/App.jsx` — the route `<Route path="gallery" element={<AdminGallery />} />` already exists at line ~211. Confirm the import `AdminGallery` is present. If not, add the import:

```javascript
import AdminGallery from './pages/AdminGallery';
```

Note: The existing `AdminGallery` import may point to a different file. Check if `frontend/src/pages/AdminGallery.jsx` already exists. If it does, this task replaces its contents. If a different file is imported, update the import path.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AdminGallery.jsx
git commit -m "feat: add admin gallery management page with initials search"
```

---

## Task 12: Update updatePieceBatchStatus for in_cabinet

**Files:**
- Modify: `server/utils/supabaseDb.js`

- [ ] **Step 1: Add in_cabinet handling to updatePieceBatchStatus**

In the `updatePieceBatchStatus` function (around line ~1488), add handling for the `in_cabinet` status after the `ready` block and before the `collected`/`shipped` block:

```javascript
  if (status === 'recycled') {
    updateData.completed_at = new Date().toISOString();
  }
```

This ensures recycled batches also get a `completed_at` timestamp. The `in_cabinet` status doesn't need special handling here since `cabinet_placed_at` is passed via `extraFields` from the route handler.

- [ ] **Step 2: Verify the `not` filter in getAllActivePieceBatches includes in_cabinet correctly**

The existing filter `not('status', 'in', '("collected","shipped","recycled")')` already correctly includes `in_cabinet` in the active set (since it's not in the excluded list). No change needed.

- [ ] **Step 3: Commit**

```bash
git add server/utils/supabaseDb.js
git commit -m "feat: add recycled status handling in updatePieceBatchStatus"
```

---

## Task 13: Final Integration & Smoke Test

- [ ] **Step 1: Start both servers**

```bash
cd server && npm run dev &
cd frontend && npm run dev
```

- [ ] **Step 2: Test firing run flow**

1. Open admin pipeline at `/admin/pieces`
2. Select 2-3 batches with checkboxes
3. Click "Create Firing Run" → pick bisque → submit
4. Verify batches moved to Bisque Fired status
5. Check firing run appears in history section
6. Click "Complete Run" → verify batches advance to Glaze Fired

- [ ] **Step 3: Test collection flow**

1. Mark a batch as ready (should send ready email)
2. Switch to student view at `/gallery?tab=pieces`
3. On the ready batch, pick a collection date (2+ days out) and click "I'll Collect"
4. Verify status shows "Collection Scheduled" with the date
5. Switch to admin pipeline — verify the batch shows in Collecting with date
6. Click "Place in Cabinet" → verify email sent and status changes
7. Switch to student view — see "In Cabinet" message and "I've Collected" button
8. Click "I've Collected" → verify status becomes Collected

- [ ] **Step 4: Test admin gallery**

1. Open `/admin/gallery`
2. Search for initials (3+ chars)
3. Toggle featured/public on a piece
4. Delete a test piece

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for piece management enhancements"
```
