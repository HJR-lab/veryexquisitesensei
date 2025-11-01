const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter - only allow images
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'), false);
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per file
  }
});

/**
 * Upload image to Supabase Storage
 * @param {Buffer} fileBuffer - Image file buffer
 * @param {string} originalName - Original filename
 * @param {string} mimetype - File mimetype
 * @param {string} userId - User ID for organizing uploads
 * @returns {Promise<{url: string, path: string}>}
 */
async function uploadImageToSupabase(fileBuffer, originalName, mimetype, userId) {
  try {
    // Generate unique filename
    const fileExt = path.extname(originalName);
    const fileName = `${crypto.randomUUID()}${fileExt}`;
    const filePath = `pottery-images/${userId}/${fileName}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('pottery-gallery')
      .upload(filePath, fileBuffer, {
        contentType: mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Supabase upload error:', error);
      throw new Error(`Upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('pottery-gallery')
      .getPublicUrl(filePath);

    return {
      url: publicUrl,
      path: filePath
    };
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
}

/**
 * Delete image from Supabase Storage
 * @param {string} filePath - Path to file in storage
 * @returns {Promise<void>}
 */
async function deleteImageFromSupabase(filePath) {
  try {
    const { error } = await supabase.storage
      .from('pottery-gallery')
      .remove([filePath]);

    if (error) {
      console.error('Supabase delete error:', error);
      throw new Error(`Delete failed: ${error.message}`);
    }
  } catch (error) {
    console.error('Error deleting image:', error);
    throw error;
  }
}

/**
 * Check if storage bucket exists, create if not
 */
async function ensureBucketExists() {
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();

    if (error) {
      console.error('Error listing buckets:', error);
      return;
    }

    const bucketExists = buckets.some(bucket => bucket.name === 'pottery-gallery');

    if (!bucketExists) {
      console.log('Creating pottery-gallery bucket...');
      const { data, error: createError } = await supabase.storage.createBucket('pottery-gallery', {
        public: true,
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
      });

      if (createError) {
        console.error('Error creating bucket:', createError);
      } else {
        console.log('✅ pottery-gallery bucket created');
      }
    }
  } catch (error) {
    console.error('Error ensuring bucket exists:', error);
  }
}

module.exports = {
  upload,
  uploadImageToSupabase,
  deleteImageFromSupabase,
  ensureBucketExists
};
