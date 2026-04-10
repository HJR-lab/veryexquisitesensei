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

  // ==================== Admin Endpoints ====================

  // Pipeline dashboard — all active batches
  app.get('/api/admin/pieces/pipeline', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
    const batches = await supabaseDb.getAllActivePieceBatches();

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

    const validStatuses = ['logged', 'bisque_fired', 'glaze_fired', 'ready', 'in_cabinet', 'collecting', 'delivering', 'collected', 'shipped', 'recycled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const batch = await supabaseDb.updatePieceBatchStatus(batchId, status);

    // Send notification + email when marking as ready
    if (status === 'ready' && batch.customers) {
      const student = batch.customers;
      const courseName = batch.course_enrollments?.course_title || batch.course_enrollments?.course_variant_title || 'your course';
      const photoUrl = batch.photo_urls && batch.photo_urls.length > 0 ? batch.photo_urls[0] : null;
      const appUrl = process.env.FRONTEND_URL || 'https://club.ves.sg';

      // Create in-app notification
      await supabaseDb.createNotification({
        customerId: student.id,
        type: 'pieces_ready',
        title: 'Your pottery is ready!',
        message: `Your ${batch.piece_count} piece${batch.piece_count !== 1 ? 's' : ''} from ${courseName} ${batch.piece_count !== 1 ? 'have' : 'has'} been fired and ${batch.piece_count !== 1 ? 'are' : 'is'} ready for collection.`,
        data: { batchId: batch.id, pieceCount: batch.piece_count, courseName, photoUrl },
      });

      // Send email
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

      // Send ready notification + email for each batch if status is 'ready'
      if (status === 'ready' && batch.customers) {
        const student = batch.customers;
        const courseName = batch.course_enrollments?.course_title || batch.course_enrollments?.course_variant_title || 'your course';
        const photoUrl = batch.photo_urls && batch.photo_urls.length > 0 ? batch.photo_urls[0] : null;
        const appUrl = process.env.FRONTEND_URL || 'https://club.ves.sg';

        // Create in-app notification
        await supabaseDb.createNotification({
          customerId: student.id,
          type: 'pieces_ready',
          title: 'Your pottery is ready!',
          message: `Your ${batch.piece_count} piece${batch.piece_count !== 1 ? 's' : ''} from ${courseName} ${batch.piece_count !== 1 ? 'have' : 'has'} been fired and ${batch.piece_count !== 1 ? 'are' : 'is'} ready for collection.`,
          data: { batchId: batch.id, pieceCount: batch.piece_count, courseName, photoUrl },
        });

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
