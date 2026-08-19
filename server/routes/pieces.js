const supabaseDb = require('../utils/supabaseDb');
const { sendAndLogEmail } = require('../utils/emailService');
const { sendPiecesReady } = require('../utils/piecesNotifier');
const courseConfig = require('../utils/courseConfig');
const { publicBaseUrl } = require('../utils/publicUrl');

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler, upload }) {

  // ==================== Student Endpoints ====================

  // Get student's piece batches
  app.get('/api/pieces/my-batches', authenticateToken, asyncHandler(async (req, res) => {
    const customerId = req.user.dbCustomerId;
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
    const customerId = req.user.dbCustomerId;
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
    const customerId = req.user.dbCustomerId;

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

  // Student: Delete a batch they logged (only before any firing run)
  app.delete('/api/pieces/batches/:id', authenticateToken, asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.id);
    const customerId = req.user.dbCustomerId;

    const batch = await supabaseDb.getPieceBatchById(batchId);
    if (!batch || batch.customer_id !== customerId) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    if (batch.status !== 'logged') {
      return res.status(400).json({ error: 'Cannot delete — pieces are already in the firing pipeline. Ask the studio if you need this removed.' });
    }

    await supabaseDb.deletePieceBatch(batchId);
    res.json({ success: true });
  }));

  // Set delivery method (with optional collection date)
  app.put('/api/pieces/batches/:id/delivery', authenticateToken, asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.id);
    const customerId = req.user.dbCustomerId;
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

  // Student: Confirm collection
  app.put('/api/pieces/batches/:id/confirm-collected', authenticateToken, asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.id);
    const customerId = req.user.dbCustomerId;

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

  // ==================== Admin Endpoints ====================

  // Pipeline dashboard — all active batches
  app.get('/api/admin/pieces/pipeline', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const batches = await supabaseDb.getAllActivePieceBatches();

    // Unmatched = batches with no customer_id (admin logged but initials didn't match)
    const unmatched = batches.filter(b => !b.customer_id);
    const matched = batches.filter(b => b.customer_id);

    const grouped = {
      logged: matched.filter(b => b.status === 'logged'),
      bisque_fired: matched.filter(b => b.status === 'bisque_fired'),
      glaze_fired: matched.filter(b => b.status === 'glaze_fired'),
      unmatched: unmatched,
      ready: matched.filter(b => b.status === 'ready'),
      collecting: matched.filter(b => b.status === 'collecting'),
      in_cabinet: matched.filter(b => b.status === 'in_cabinet'),
    };

    const makeStats = (arr) => ({ count: arr.length, pieces: arr.reduce((s, b) => s + b.piece_count, 0) });

    const stats = {
      logged: makeStats(grouped.logged),
      bisque_fired: makeStats(grouped.bisque_fired),
      glaze_fired: makeStats(grouped.glaze_fired),
      unmatched: makeStats(grouped.unmatched),
      ready: makeStats(grouped.ready),
      collecting: makeStats(grouped.collecting),
      in_cabinet: makeStats(grouped.in_cabinet),
    };

    res.json({ success: true, batches: grouped, stats });
  }));

  // Admin: list a student's course enrollments (flat) for batch logging.
  // Only returns non-cancelled enrollments, newest first. Each entry includes
  // a `hasBatch` flag so the UI can indicate which courses already have one.
  app.get('/api/admin/pieces/student/:id/enrollments', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const studentId = parseInt(req.params.id);
    const { data: enrollments, error } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id, course_identifier, course_title, course_variant_title, course_start_date, status, number_of_weeks')
      .eq('student_id', studentId)
      .neq('status', 'cancelled')
      .order('course_start_date', { ascending: false });
    if (error) throw error;

    // Flag which enrollments already have a batch
    const enrollmentIds = (enrollments || []).map(e => e.id);
    let existing = [];
    if (enrollmentIds.length > 0) {
      const { data: batches } = await supabaseDb.supabase
        .from('piece_batches')
        .select('course_enrollment_id')
        .in('course_enrollment_id', enrollmentIds);
      existing = (batches || []).map(b => b.course_enrollment_id);
    }
    const withFlag = (enrollments || []).map(e => ({ ...e, hasBatch: existing.includes(e.id) }));
    res.json({ enrollments: withFlag });
  }));

  // Admin: log a batch on behalf of a student
  // Useful for onboarding — staff can upload photos themselves instead of
  // waiting for students to use the MyPieces flow.
  app.post('/api/admin/pieces/log', authenticateToken, requireAdmin, upload.array('photos', 5), asyncHandler(async (req, res) => {
    const { customerId, courseEnrollmentId, pieceCount, initials, notes } = req.body;

    if (!customerId) return res.status(400).json({ error: 'customerId required' });
    if (!initials || !pieceCount) {
      return res.status(400).json({ error: 'Initials and piece count are required' });
    }

    const custIdInt = parseInt(customerId);

    // Upload photos if provided
    let photoUrls = [];
    if (req.files && req.files.length > 0) {
      const { uploadImageToSupabase } = require('../utils/imageUpload');
      for (const file of req.files) {
        const { url } = await uploadImageToSupabase(file.buffer, file.originalname, file.mimetype, `customers/${custIdInt}/pieces`);
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
      customerId: custIdInt,
      pieceCount: parseInt(pieceCount),
      initials: initials.toUpperCase().trim(),
      notes,
      photoUrls,
    });

    // Seed customer initials if not set
    const customer = await supabaseDb.getCustomerById(custIdInt);
    if (customer && !customer.initials) {
      await supabaseDb.supabase
        .from('customers')
        .update({ initials: initials.toUpperCase().trim() })
        .eq('id', custIdInt);
    }

    res.json({ success: true, batch });
  }));

  // Search by initials
  // Get all distinct initials from student-logged batches (for admin dropdown)
  app.get('/api/admin/pieces/initials', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { data, error } = await supabaseDb.supabase
      .from('piece_batches')
      .select('initials, customer_id, piece_count, notes, status, customers!piece_batches_customer_id_fkey(id, first_name, last_name, email)')
      .not('initials', 'is', null)
      .in('status', ['logged', 'bisque_fired', 'glaze_fired'])
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: 'Failed to fetch initials' });

    // Group by initials, keep the most recent student match
    const map = {};
    for (const b of (data || [])) {
      const key = (b.initials || '').toUpperCase();
      if (!key) continue;
      if (!map[key]) {
        map[key] = { initials: key, student: b.customers, pieceCount: b.piece_count, notes: b.notes, status: b.status, customerId: b.customer_id };
      }
    }

    res.json({ initials: Object.values(map) });
  }));

  // Common character confusions on handwritten pottery initials
  const FUZZY_MAP = { '0': 'O', 'O': '0', '1': 'I', 'I': '1', 'L': '1', '5': 'S', 'S': '5', '8': 'B', 'B': '8', 'G': '6', '6': 'G' };

  function getFuzzyVariants(str) {
    const upper = str.trim().toUpperCase();
    const variants = new Set([upper]);
    for (let i = 0; i < upper.length; i++) {
      const ch = upper[i];
      if (FUZZY_MAP[ch]) {
        variants.add(upper.substring(0, i) + FUZZY_MAP[ch] + upper.substring(i + 1));
      }
    }
    return Array.from(variants);
  }

  app.get('/api/admin/pieces/search', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const { initials } = req.query;
    if (!initials) return res.status(400).json({ error: 'initials query param required' });

    // Search exact + fuzzy variants (0/O, 1/I, etc.)
    const variants = getFuzzyVariants(initials);
    let allBatches = [];
    for (const variant of variants) {
      const found = await supabaseDb.searchPieceBatchesByInitials(variant);
      allBatches = allBatches.concat(found);
    }

    // Deduplicate batches by id
    const batchMap = new Map();
    for (const b of allBatches) batchMap.set(b.id, b);
    const batches = Array.from(batchMap.values());

    // Find customers who have used these initials before
    const matches = [];
    const seen = new Set();
    for (const b of batches) {
      if (b.customers && !seen.has(b.customers.id)) {
        seen.add(b.customers.id);
        matches.push(b.customers);
      }
    }

    // If no batch match, try matching initials to customer first_name + last_name initials
    if (matches.length === 0) {
      const { data: customers } = await supabaseDb.supabase
        .from('customers')
        .select('id, first_name, last_name, email')
        .not('first_name', 'is', null);

      if (customers) {
        for (const variant of variants) {
          for (const c of customers) {
            if (seen.has(c.id)) continue;
            const fi = (c.first_name || '').charAt(0).toUpperCase();
            const li = (c.last_name || '').charAt(0).toUpperCase();
            if (variant === `${fi}${li}`) {
              seen.add(c.id);
              matches.push(c);
            }
          }
        }
      }
    }

    res.json({ success: true, batches, matches, variants });
  }));

  // Assign customer to an unmatched batch + optionally adjust piece count
  app.put('/api/admin/pieces/batches/:id/assign', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.id);
    const { customerId, pieceCount } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }

    // Verify batch exists
    const batch = await supabaseDb.getPieceBatchById(batchId);
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const updates = { customer_id: parseInt(customerId) };
    if (pieceCount !== undefined && pieceCount > 0) {
      updates.piece_count = parseInt(pieceCount);
    }

    const updated = await supabaseDb.updatePieceBatch(batchId, updates);
    res.json({ success: true, batch: updated });
  }));

  // Flag piece count discrepancy (student logged X but admin found Y)
  app.put('/api/admin/pieces/batches/:id/discrepancy', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.id);
    const { actualCount, reason } = req.body;

    if (!actualCount || actualCount < 0) {
      return res.status(400).json({ error: 'actualCount is required' });
    }
    if (!reason) {
      return res.status(400).json({ error: 'reason is required — what happened to the missing piece(s)?' });
    }

    const batch = await supabaseDb.getPieceBatchById(batchId);
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const notes = batch.notes || '';
    const discrepancyNote = `[Discrepancy: student logged ${batch.piece_count}, found ${actualCount} — ${reason}]`;
    const updatedNotes = notes ? `${notes}\n${discrepancyNote}` : discrepancyNote;

    const updated = await supabaseDb.updatePieceBatch(batchId, {
      piece_count: parseInt(actualCount),
      notes: updatedNotes,
    });

    res.json({ success: true, batch: updated });
  }));

  // Update batch status
  app.put('/api/admin/pieces/batches/:id/status', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.id);
    const { status } = req.body;

    const validStatuses = ['logged', 'bisque_fired', 'glaze_fired', 'ready', 'in_cabinet', 'collecting', 'delivering', 'collected', 'shipped', 'recycled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const batch = await supabaseDb.updatePieceBatchStatus(batchId, status);

    // Marking a batch ready always tells the student, immediately.
    if (status === 'ready') {
      await sendPiecesReady(batch);
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

      if (status === 'ready') {
        await sendPiecesReady(batch);
      }
    }

    res.json({ success: true, batches: results });
  }));

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

    // Update run status to firing with timestamp
    const { data: updatedRun } = await supabaseDb.supabase
      .from('firing_runs')
      .update({ status: 'firing', fired_at: new Date().toISOString() })
      .eq('id', run.id)
      .select()
      .single();

    res.json({ success: true, run: updatedRun });
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

      if (nextStatus === 'ready') {
        await sendPiecesReady(batch);
      }
    }

    // Mark the run as completed
    const completedRun = await supabaseDb.completeFiringRun(runId);

    res.json({ success: true, run: completedRun });
  }));

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
      const appUrl = publicBaseUrl();

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

  // Admin: Send collection email manually
  app.post('/api/admin/pieces/batches/:id/send-collection-email', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const batchId = parseInt(req.params.id);
    const { emailType } = req.body; // 'ready' | 'cabinet' | 'reminder'

    const { data: batch, error } = await supabaseDb.supabase
      .from('piece_batches')
      .select('*, customers!piece_batches_customer_id_fkey(first_name, last_name, email)')
      .eq('id', batchId)
      .single();

    if (error || !batch) return res.status(404).json({ error: 'Batch not found' });

    const student = batch.customers;
    if (!student?.email) return res.status(400).json({ error: 'Student has no email' });

    const { sendEmail } = require('../utils/emailService');
    const { wrapEmailTemplate } = require('../email-templates/base');
    const pieceStr = `${batch.piece_count} piece${batch.piece_count !== 1 ? 's' : ''} (Initials: ${batch.initials || '—'})`;

    let subject, body;

    if (emailType === 'ready') {
      subject = 'VES — Your fired pieces are ready for collection!';
      body = `
        <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">Your pieces are ready for collection!</h1>
        <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">Hi ${student.first_name}, great news — your fired pottery pieces are ready to be picked up from the studio!</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9EDE6; border-radius: 8px; margin: 0 0 20px;">
          <tr><td style="padding: 16px 20px;">
            <p style="margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #C4622D; text-transform: uppercase; letter-spacing: 0.05em;">Ready for Collection</p>
            <p style="margin: 0 0 2px; font-size: 15px; font-weight: 600; color: #282828;">${pieceStr}</p>
            ${batch.notes ? `<p style="margin: 0 0 2px; font-size: 14px; color: #282828;">${batch.notes}</p>` : ''}
            <p style="margin: 0; font-size: 13px; color: #888888;">Logged: ${new Date(batch.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F5F3F0; border-radius: 8px; margin: 0 0 20px;">
          <tr><td style="padding: 16px 20px;">
            <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #282828;">How to collect</p>
            <p style="margin: 0 0 4px; font-size: 14px; line-height: 1.6; color: #282828;">1. Sign in and choose your <strong>collection date</strong> (+2 days notice).</p>
            <p style="margin: 0 0 4px; font-size: 14px; line-height: 1.6; color: #282828;">2. Collect your pieces from the <strong>glass cabinet</strong> of the studio porch.</p>
            <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #282828;">3. Identify and confirm the collection in Ves Clay Club app.</p>
          </td></tr>
        </table>
        <p style="margin: 0 0 8px; font-size: 14px; color: #282828;">Please collect within 60 days or opt for door-to-door delivery at $10.</p>
        <p style="margin: 0 0 20px; font-size: 12px; color: #888888;">Uncollected pieces will be recycled.</p>
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
          <a href="https://club.ves.sg/gallery?tab=pieces" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #fff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">Schedule Collection</a>
        </td></tr></table>`;
    } else if (emailType === 'cabinet') {
      subject = 'VES — Your pieces are in the cabinet!';
      body = `
        <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">Your pieces are in the cabinet</h1>
        <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">Hi ${student.first_name}, your <strong>${pieceStr}</strong> ${batch.piece_count !== 1 ? 'are' : 'is'} now in the glass cabinet outside the studio — come pick ${batch.piece_count !== 1 ? 'them' : 'it'} up anytime!</p>
        <p style="margin: 0 0 4px; font-size: 14px; color: #282828;"><strong>Address:</strong> 75 Jalan Kelabu Asap, Chip Bee Gardens 278268 (<a href="https://maps.app.goo.gl/g84xejcaZbAsD2ze7" style="color: #C4622D;">Map</a>)</p>
        <p style="margin: 0 0 20px; font-size: 13px; color: #888888;">Once collected, confirm in the app so we know you've got them.</p>
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
          <a href="https://club.ves.sg/gallery?tab=pieces" style="display: inline-block; padding: 14px 32px; background-color: #1565C0; color: #fff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">I've Collected My Pieces</a>
        </td></tr></table>`;
    } else if (emailType === 'reminder') {
      subject = 'VES — Reminder: Your pottery pieces are waiting!';
      body = `
        <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #282828; text-align: center;">Your pieces are still waiting!</h1>
        <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #282828;">Hi ${student.first_name}, just a friendly reminder — your <strong>${pieceStr}</strong> ${batch.piece_count !== 1 ? 'are' : 'is'} ready and waiting for you at the studio.</p>
        <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6; color: #9E6200;">Please collect within 60 days or opt for door-to-door delivery at $10.</p>
        <p style="margin: 0 0 20px; font-size: 12px; color: #888888;">Uncollected pieces will be recycled.</p>
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
          <a href="https://club.ves.sg/gallery?tab=pieces" style="display: inline-block; padding: 14px 32px; background-color: #C4622D; color: #fff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">Schedule Collection</a>
        </td></tr></table>`;
    } else {
      return res.status(400).json({ error: 'Invalid emailType. Use: ready, cabinet, or reminder' });
    }

    const result = await sendEmail({ to: student.email, subject, html: wrapEmailTemplate(body) });
    res.json({ success: result.success, studentName: `${student.first_name} ${student.last_name}` });
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
  // "10 Classes" package = 6-week WT cohort + 4 flex credits → use the 6-week template
  if (title.includes('10') || title.includes('ten')) return 'wt-6week';
  if (title.includes('3x') || title.includes('3 course')) return 'wt-3x6week';
  if (title.includes('intermediate') || title.includes('7')) return 'wt-7week-inter';
  return 'wt-6week';
}
