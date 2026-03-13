const supabaseDb = require('../utils/supabaseDb');

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler, upload }) {

// ============================================
// POTTERY GALLERY ENDPOINTS
// ============================================

app.post('/api/pottery/create-piece', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const pieceData = req.body;

  const newPiece = await supabaseDb.createPotteryPiece({
    customerId: dbCustomerId,
    title: pieceData.title,
    dateCompleted: new Date(pieceData.date_completed),
    notes: pieceData.description || null,
    clayType: pieceData.clay_type || 'Other',
    glazes: pieceData.glazes || [],
    height: pieceData.height ? parseFloat(pieceData.height) : null,
    width: pieceData.width ? parseFloat(pieceData.width) : null,
    length: pieceData.length ? parseFloat(pieceData.length) : null,
    images: pieceData.images || [],
    tags: pieceData.tags || [],
    isPublic: pieceData.is_public || false,
    featured: false
  });

  res.json({ success: true, piece: newPiece });
}));

app.get('/api/pottery/pieces', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;

  const pieces = await supabaseDb.getPotteryPiecesByCustomerId(dbCustomerId);

  const formattedPieces = pieces.map(piece => ({
    id: piece.id.toString(),
    title: piece.title,
    description: piece.notes,
    clay_type: piece.clay_type,
    glaze: piece.glazes[0] || '',
    glazes: piece.glazes,
    original_weight: piece.original_weight?.toString(),
    final_weight: piece.final_weight?.toString(),
    height: piece.height?.toString(),
    length: piece.length?.toString(),
    width: piece.width?.toString(),
    dimensions: piece.height && piece.width && piece.length
      ? `${piece.height}" H x ${piece.width}" W x ${piece.length}" L`
      : '',
    date_completed: new Date(piece.date_completed).toISOString().split('T')[0],
    images: piece.images,
    tags: piece.tags,
    is_public: piece.is_public,
    featured: piece.featured
  }));

  res.json({ pieces: formattedPieces });
}));

app.get('/api/pottery/public', asyncHandler(async (req, res) => {
  const pieces = await supabaseDb.getPublicPotteryPieces();

  const formattedPieces = pieces.map(piece => ({
    id: piece.id.toString(),
    title: piece.title,
    description: piece.notes,
    clay_type: piece.clay_type,
    glazes: piece.glazes,
    height: piece.height?.toString(),
    length: piece.length?.toString(),
    width: piece.width?.toString(),
    date_completed: new Date(piece.date_completed).toISOString().split('T')[0],
    images: piece.images,
    tags: piece.tags,
    featured: piece.featured,
    artist: piece.customer?.first_name
      ? `${piece.customer.first_name} ${piece.customer.last_name || ''}`.trim()
      : 'VES Student'
  }));

  res.json({ pieces: formattedPieces });
}));

app.put('/api/pottery/pieces/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { id } = req.params;
  const pieceData = req.body;

  // Verify ownership
  const existingPiece = await supabaseDb.getPotteryPiecesByCustomerId(dbCustomerId);
  const ownsPiece = existingPiece.some(piece => piece.id === parseInt(id));

  if (!ownsPiece) {
    return res.status(403).json({ error: 'You do not have permission to update this piece' });
  }

  const updatedPiece = await supabaseDb.updatePotteryPiece(parseInt(id), {
    title: pieceData.title,
    dateCompleted: pieceData.date_completed ? new Date(pieceData.date_completed) : undefined,
    notes: pieceData.description,
    clayType: pieceData.clay_type,
    glazes: pieceData.glazes,
    height: pieceData.height ? parseFloat(pieceData.height) : null,
    width: pieceData.width ? parseFloat(pieceData.width) : null,
    length: pieceData.length ? parseFloat(pieceData.length) : null,
    images: pieceData.images,
    tags: pieceData.tags,
    isPublic: pieceData.is_public,
    courseEnrollmentId: pieceData.course_enrollment_id ? parseInt(pieceData.course_enrollment_id) : null
  });

  res.json({ success: true, piece: updatedPiece });
}));

app.delete('/api/pottery/pieces/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { id } = req.params;

  // Verify ownership
  const existingPieces = await supabaseDb.getPotteryPiecesByCustomerId(dbCustomerId);
  const piece = existingPieces.find(piece => piece.id === parseInt(id));

  if (!piece) {
    return res.status(403).json({ error: 'You do not have permission to delete this piece' });
  }

  await supabaseDb.deletePotteryPiece(parseInt(id));

  res.json({ success: true, message: 'Pottery piece deleted successfully' });
}));

// Get pottery pieces by course enrollment
app.get('/api/pottery/by-course/:courseEnrollmentId', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { courseEnrollmentId } = req.params;

  // Verify the course enrollment belongs to the user
  const { data: enrollment, error: enrollmentError } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('*')
    .eq('id', parseInt(courseEnrollmentId))
    .eq('student_id', dbCustomerId)
    .single();

  if (enrollmentError || !enrollment) {
    return res.status(403).json({ error: 'Course enrollment not found or access denied' });
  }

  // Get pottery pieces linked to this course
  const { data: pieces, error: piecesError } = await supabaseDb.supabase
    .from('pottery_pieces')
    .select('*')
    .eq('course_enrollment_id', parseInt(courseEnrollmentId))
    .eq('customer_id', dbCustomerId)
    .order('date_completed', { ascending: false });

  if (piecesError) {
    throw piecesError;
  }

  const formattedPieces = pieces.map(piece => ({
    id: piece.id.toString(),
    title: piece.title,
    description: piece.notes,
    clay_type: piece.clay_type,
    glazes: piece.glazes,
    original_weight: piece.original_weight?.toString(),
    final_weight: piece.final_weight?.toString(),
    height: piece.height?.toString(),
    length: piece.length?.toString(),
    width: piece.width?.toString(),
    date_completed: new Date(piece.date_completed).toISOString().split('T')[0],
    images: piece.images,
    tags: piece.tags,
    is_public: piece.is_public,
    featured: piece.featured,
    course_enrollment_id: piece.course_enrollment_id
  }));

  res.json({
    pieces: formattedPieces,
    course: {
      id: enrollment.id,
      title: enrollment.course_title,
      type: enrollment.course_type,
      startDate: enrollment.course_start_date,
      endDate: enrollment.course_end_date
    }
  });
}));

// Add image to pottery piece
app.post('/api/pottery/pieces/:id/images', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { id } = req.params;
  const { url, description, date_added } = req.body;

  // Verify ownership
  const existingPieces = await supabaseDb.getPotteryPiecesByCustomerId(dbCustomerId);
  const piece = existingPieces.find(p => p.id === parseInt(id));

  if (!piece) {
    return res.status(403).json({ error: 'Pottery piece not found or access denied' });
  }

  // Check if already at max images (10)
  const currentImages = piece.images || [];
  if (currentImages.length >= 10) {
    return res.status(400).json({ error: 'Maximum 10 images allowed per piece' });
  }

  // Add new image with order
  const newImage = {
    url,
    description: description || '',
    date_added: date_added || new Date().toISOString().split('T')[0],
    order: currentImages.length + 1
  };

  const updatedImages = [...currentImages, newImage];

  // Update piece with new images array
  const { data: updatedPiece, error } = await supabaseDb.supabase
    .from('pottery_pieces')
    .update({ images: updatedImages, updated_at: new Date().toISOString() })
    .eq('id', parseInt(id))
    .select()
    .single();

  if (error) {
    throw error;
  }

  res.json({ success: true, images: updatedPiece.images });
}));

// Delete image from pottery piece
app.delete('/api/pottery/pieces/:id/images/:imageIndex', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { id, imageIndex } = req.params;

  // Verify ownership
  const existingPieces = await supabaseDb.getPotteryPiecesByCustomerId(dbCustomerId);
  const piece = existingPieces.find(p => p.id === parseInt(id));

  if (!piece) {
    return res.status(403).json({ error: 'Pottery piece not found or access denied' });
  }

  const currentImages = piece.images || [];
  const index = parseInt(imageIndex);

  if (index < 0 || index >= currentImages.length) {
    return res.status(400).json({ error: 'Invalid image index' });
  }

  // Remove image and reorder
  const updatedImages = currentImages
    .filter((_, i) => i !== index)
    .map((img, i) => ({ ...img, order: i + 1 }));

  // Update piece
  const { data: updatedPiece, error } = await supabaseDb.supabase
    .from('pottery_pieces')
    .update({ images: updatedImages, updated_at: new Date().toISOString() })
    .eq('id', parseInt(id))
    .select()
    .single();

  if (error) {
    throw error;
  }

  res.json({ success: true, images: updatedPiece.images });
}));

// Update image metadata (description, order)
app.put('/api/pottery/pieces/:id/images/:imageIndex', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { id, imageIndex } = req.params;
  const { description, order } = req.body;

  // Verify ownership
  const existingPieces = await supabaseDb.getPotteryPiecesByCustomerId(dbCustomerId);
  const piece = existingPieces.find(p => p.id === parseInt(id));

  if (!piece) {
    return res.status(403).json({ error: 'Pottery piece not found or access denied' });
  }

  const currentImages = piece.images || [];
  const index = parseInt(imageIndex);

  if (index < 0 || index >= currentImages.length) {
    return res.status(400).json({ error: 'Invalid image index' });
  }

  // Update image metadata
  const updatedImages = [...currentImages];
  if (description !== undefined) {
    updatedImages[index].description = description;
  }
  if (order !== undefined) {
    updatedImages[index].order = order;
  }

  // Update piece
  const { data: updatedPiece, error } = await supabaseDb.supabase
    .from('pottery_pieces')
    .update({ images: updatedImages, updated_at: new Date().toISOString() })
    .eq('id', parseInt(id))
    .select()
    .single();

  if (error) {
    throw error;
  }

  res.json({ success: true, images: updatedPiece.images });
}));

// ============================================
// REFERENCE DATA ENDPOINTS
// ============================================

app.get('/api/reference/clay-types', authenticateToken, asyncHandler(async (req, res) => {
  const clayTypes = await supabaseDb.getClayTypes();
  res.json({ clayTypes });
}));

app.get('/api/reference/glazes', authenticateToken, asyncHandler(async (req, res) => {
  const glazes = await supabaseDb.getGlazes();
  res.json({ glazes });
}));

};
