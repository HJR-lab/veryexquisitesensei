/**
 * Pottery pieces, batches, firing runs & reference data (clay/glaze).
 *
 * Domain module extracted from the monolithic supabaseDb.js. Owns the
 * `pottery_pieces`, `piece_batches`, `firing_runs`, `clay_types` and `glazes`
 * tables. supabaseDb.js re-exports these functions so existing
 * `require('./supabaseDb').<fn>` call sites keep working unchanged during the
 * incremental split.
 */

const { supabase } = require('./supabaseClient');

/**
 * Get public pottery pieces
 */
async function getPublicPotteryPieces() {
  const { data, error } = await supabase
    .from('pottery_pieces')
    .select(`
      *,
      customer:customers!pottery_pieces_customer_id_fkey (
        first_name,
        last_name
      )
    `)
    .eq('is_public', true)
    .order('featured', { ascending: false })
    .order('date_completed', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Get pottery pieces for a customer
 */
async function getPotteryPiecesByCustomerId(customerId) {
  const { data, error } = await supabase
    .from('pottery_pieces')
    .select('*')
    .eq('customer_id', customerId)
    .order('date_completed', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Get pottery piece by ID
 */
async function getPotteryPieceById(pieceId) {
  const { data, error } = await supabase
    .from('pottery_pieces')
    .select('*')
    .eq('id', pieceId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data;
}

/**
 * Get all pottery pieces (admin view)
 */
async function getAllPotteryPieces() {
  const { data, error } = await supabase
    .from('pottery_pieces')
    .select(`
      *,
      customer:customers!pottery_pieces_customer_id_fkey (
        id,
        first_name,
        last_name,
        email,
        initials
      )
    `)
    .order('date_completed', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Create pottery piece
 */
async function createPotteryPiece(pieceData) {
  const { data, error } = await supabase
    .from('pottery_pieces')
    .insert([{
      customer_id: pieceData.customerId,
      title: pieceData.title,
      date_completed: pieceData.dateCompleted,
      notes: pieceData.notes,
      clay_type: pieceData.clayType,
      glazes: pieceData.glazes,
      original_weight: pieceData.originalWeight,
      final_weight: pieceData.finalWeight,
      height: pieceData.height,
      width: pieceData.width,
      length: pieceData.length,
      images: pieceData.images,
      tags: pieceData.tags,
      is_public: pieceData.isPublic,
      featured: pieceData.featured
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update pottery piece
 */
async function updatePotteryPiece(pieceId, pieceData) {
  const updateData = {
    updated_at: new Date().toISOString()
  };

  if (pieceData.title !== undefined) updateData.title = pieceData.title;
  if (pieceData.dateCompleted !== undefined) updateData.date_completed = pieceData.dateCompleted;
  if (pieceData.notes !== undefined) updateData.notes = pieceData.notes;
  if (pieceData.clayType !== undefined) updateData.clay_type = pieceData.clayType;
  if (pieceData.glazes !== undefined) updateData.glazes = pieceData.glazes;
  if (pieceData.originalWeight !== undefined) updateData.original_weight = pieceData.originalWeight;
  if (pieceData.finalWeight !== undefined) updateData.final_weight = pieceData.finalWeight;
  if (pieceData.height !== undefined) updateData.height = pieceData.height;
  if (pieceData.width !== undefined) updateData.width = pieceData.width;
  if (pieceData.length !== undefined) updateData.length = pieceData.length;
  if (pieceData.images !== undefined) updateData.images = pieceData.images;
  if (pieceData.tags !== undefined) updateData.tags = pieceData.tags;
  if (pieceData.isPublic !== undefined) updateData.is_public = pieceData.isPublic;
  if (pieceData.featured !== undefined) updateData.featured = pieceData.featured;
  if (pieceData.courseEnrollmentId !== undefined) updateData.course_enrollment_id = pieceData.courseEnrollmentId;

  const { data, error } = await supabase
    .from('pottery_pieces')
    .update(updateData)
    .eq('id', pieceId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete pottery piece
 */
async function deletePotteryPiece(pieceId) {
  const { error } = await supabase
    .from('pottery_pieces')
    .delete()
    .eq('id', pieceId);

  if (error) throw error;
  return { success: true };
}

/**
 * Get clay types
 */
async function getClayTypes() {
  const { data, error } = await supabase
    .from('clay_types')
    .select('*')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get glazes
 */
async function getGlazes(includeInactive = false) {
  let query = supabase
    .from('glazes')
    .select('*')
    .order('name', { ascending: true });

  if (!includeInactive) {
    query = query.eq('active', true);
  }

  const { data, error } = await query;
  if (error) throw error;
  // Map color_hex to color for frontend compatibility
  return (data || []).map(g => ({ ...g, color: g.color_hex }));
}

/**
 * Create clay type
 */
async function createClayType(clayTypeData) {
  const { data, error } = await supabase
    .from('clay_types')
    .insert([{
      name: clayTypeData.name,
      description: clayTypeData.description,
      active: clayTypeData.active !== undefined ? clayTypeData.active : true
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update clay type
 */
async function updateClayType(clayTypeId, updates) {
  const dbUpdates = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.active !== undefined) dbUpdates.active = updates.active;

  const { data, error } = await supabase
    .from('clay_types')
    .update(dbUpdates)
    .eq('id', clayTypeId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete clay type
 */
async function deleteClayType(clayTypeId) {
  const { error } = await supabase
    .from('clay_types')
    .delete()
    .eq('id', clayTypeId);

  if (error) throw error;
  return { success: true };
}

/**
 * Create glaze
 */
async function createGlaze(glazeData) {
  const { data, error } = await supabase
    .from('glazes')
    .insert([{
      name: glazeData.name,
      description: glazeData.description,
      color_hex: glazeData.color || null,
      cone: glazeData.cone,
      active: glazeData.active !== undefined ? glazeData.active : true,
      glaze_type: glazeData.glaze_type || 'glaze',
      stock_status: glazeData.stock_status || 'in_stock',
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update glaze
 */
async function updateGlaze(glazeId, updates) {
  const dbUpdates = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.color !== undefined) dbUpdates.color_hex = updates.color;
  if (updates.cone !== undefined) dbUpdates.cone = updates.cone;
  if (updates.active !== undefined) dbUpdates.active = updates.active;
  if (updates.glaze_type !== undefined) dbUpdates.glaze_type = updates.glaze_type;
  if (updates.stock_status !== undefined) dbUpdates.stock_status = updates.stock_status;

  const { data, error } = await supabase
    .from('glazes')
    .update(dbUpdates)
    .eq('id', glazeId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete glaze
 */
async function deleteGlaze(glazeId) {
  const { error } = await supabase
    .from('glazes')
    .delete()
    .eq('id', glazeId);

  if (error) throw error;
  return { success: true };
}

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

// The whole uncollected-work policy, in three numbers. Pieces are held for three
// months from the ready date, with a reminder at the end of each of the first two
// months and a final week's notice before they are recycled — the studio has no
// room to hold them longer. Day 83 rather than day 90 so the last warning lands
// BEFORE the recycling, not on the same day as it.
const PIECE_HOLD_DAYS = 90;
const PIECE_REMINDER_DAYS = [30, 60, 83];

async function updatePieceBatchStatus(batchId, status, extraFields = {}) {
  const updateData = { status, updated_at: new Date().toISOString(), ...extraFields };

  if (status === 'ready') {
    const readyAt = new Date().toISOString();
    updateData.ready_at = readyAt;
    const holdExpires = new Date();
    holdExpires.setDate(holdExpires.getDate() + PIECE_HOLD_DAYS);
    updateData.hold_expires_at = holdExpires.toISOString();
  }

  if (status === 'collected' || status === 'shipped' || status === 'recycled') {
    updateData.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('piece_batches')
    .update(updateData)
    .eq('id', batchId)
    .select('*, customers(id, first_name, last_name, email), course_enrollments(course_type, course_title, course_variant_title, course_identifier)')
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

async function deletePieceBatch(batchId) {
  const { error } = await supabase
    .from('piece_batches')
    .delete()
    .eq('id', batchId);

  if (error) throw error;
  return true;
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

// Batches due a reminder RIGHT NOW, judged against PIECE_REMINDER_DAYS.
//
// Deliberately milestone-based rather than "last reminder older than N days":
// with monthly reminders, an elapsed-time rule can never fire the final
// week's-notice one, because day 60 + 30 lands past the recycling date.
async function getReadyBatchesNeedingReminder() {
  const { data, error } = await supabase
    .from('piece_batches')
    .select('*, customers(id, first_name, last_name, email), course_enrollments(course_type, course_title, course_variant_title)')
    .in('status', ['ready', 'collecting', 'delivering'])
    .not('ready_at', 'is', null);

  if (error) throw error;

  const DAY = 1000 * 60 * 60 * 24;
  const now = new Date();

  return (data || []).filter(batch => {
    const readyAt = new Date(batch.ready_at);
    const daysSinceReady = Math.floor((now - readyAt) / DAY);
    if (daysSinceReady > PIECE_HOLD_DAYS) return false;

    // The most recent milestone this batch has passed.
    const due = [...PIECE_REMINDER_DAYS].reverse().find(d => daysSinceReady >= d);
    if (due === undefined) return false;

    // Already reminded for that milestone? A send for it would postdate it.
    if (!batch.last_reminder_at) return true;
    return new Date(batch.last_reminder_at) < new Date(readyAt.getTime() + due * DAY);
  });
}

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

module.exports = {
  getPublicPotteryPieces,
  getPotteryPiecesByCustomerId,
  getPotteryPieceById,
  getAllPotteryPieces,
  createPotteryPiece,
  updatePotteryPiece,
  deletePotteryPiece,
  getClayTypes,
  getGlazes,
  createClayType,
  updateClayType,
  deleteClayType,
  createGlaze,
  updateGlaze,
  deleteGlaze,
  createPieceBatch,
  getPieceBatchesByCustomerId,
  getPieceBatchById,
  getAllActivePieceBatches,
  updatePieceBatchStatus,
  updatePieceBatch,
  deletePieceBatch,
  searchPieceBatchesByInitials,
  getReadyBatchesNeedingReminder,
  PIECE_HOLD_DAYS,
  PIECE_REMINDER_DAYS,
  createFiringRun,
  getFiringRuns,
  getFiringRunById,
  completeFiringRun,
  getExpiredPieceBatches,
  searchPotteryPiecesByInitials,
};
