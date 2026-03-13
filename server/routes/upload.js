const { uploadImageToSupabase, deleteImageFromSupabase } = require('../utils/imageUpload');

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler, upload }) {

// ============================================
// IMAGE UPLOAD ENDPOINTS
// ============================================

app.post('/api/upload/image', authenticateToken, upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }

  const { dbCustomerId } = req.user;

  const { url, path: filePath } = await uploadImageToSupabase(
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype,
    dbCustomerId.toString()
  );

  res.json({
    success: true,
    url: url,
    path: filePath
  });
}));

app.post('/api/upload/images', authenticateToken, upload.array('images', 5), asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No image files provided' });
  }

  const { dbCustomerId } = req.user;
  const uploadedImages = [];

  for (const file of req.files) {
    const { url, path: filePath } = await uploadImageToSupabase(
      file.buffer,
      file.originalname,
      file.mimetype,
      dbCustomerId.toString()
    );

    uploadedImages.push({ url, path: filePath });
  }

  res.json({
    success: true,
    images: uploadedImages
  });
}));

app.delete('/api/upload/image', authenticateToken, asyncHandler(async (req, res) => {
  const { path: filePath } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: 'File path required' });
  }

  await deleteImageFromSupabase(filePath);

  res.json({ success: true });
}));

};
