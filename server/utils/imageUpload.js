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

const IMAGE_BUCKET = 'pottery-gallery';

/**
 * Make sure the image bucket exists — quietly, and with a key that can actually tell.
 *
 * Enumerating and creating buckets are administrative operations, but this module's
 * client runs on the anon key, and RLS hides storage.buckets from it. listBuckets()
 * comes back empty and getBucket() answers 'Bucket not found' for a bucket that
 * plainly works. The old check read that empty list as 'missing', tried to create a
 * bucket that has existed for years, and had the create refused by the same RLS — so
 * every restart logged a red 'Error creating bucket' stack about nothing at all. It
 * never reproduced locally, where the service key makes the list visible.
 *
 * Reading through the bucket is no substitute: from(bucket).list() answers OK with an
 * empty array for a bucket that does not exist, so it cannot detect absence at all.
 * Probing that way would have silenced the noise by silencing a genuine outage too.
 *
 * So do the administrative check with the administrative key. Without one there is no
 * way to answer the question — and guessing loudly is exactly what caused the noise,
 * so we skip rather than guess.
 */
async function ensureBucketExists() {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) return;

  try {
    const admin = createClient(process.env.SUPABASE_URL, serviceKey);
    const { data: buckets, error } = await admin.storage.listBuckets();

    if (error) {
      console.error('Could not check storage buckets:', error.message);
      return;
    }

    if (buckets.some(bucket => bucket.name === IMAGE_BUCKET)) return;

    console.log(`Creating ${IMAGE_BUCKET} bucket...`);
    const { error: createError } = await admin.storage.createBucket(IMAGE_BUCKET, {
      public: true,
      fileSizeLimit: 5242880, // 5MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
    });

    // Something else won the race between the check and the create. The bucket is
    // there, which is all we wanted.
    if (createError && !/already exists/i.test(createError.message || '')) {
      console.error(`Error creating ${IMAGE_BUCKET} bucket:`, createError.message);
    } else if (!createError) {
      console.log(`✅ ${IMAGE_BUCKET} bucket created`);
    }
  } catch (error) {
    console.error('Error ensuring bucket exists:', error.message);
  }
}

module.exports = {
  upload,
  uploadImageToSupabase,
  deleteImageFromSupabase,
  ensureBucketExists
};
