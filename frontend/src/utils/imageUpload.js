import api from './api';

// The server takes at most 5 files per request and 5MB per file, as JPEG, PNG or WebP.
// A phone camera photo is often bigger than that (an iPhone's 24/48MP shot runs 5-12MB)
// and an iPhone library photo can arrive as HEIC, so every photo is shrunk and re-encoded
// to JPEG in the browser before it is sent.
const MAX_FILES_PER_REQUEST = 5;
const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.85;
const SERVER_LIMIT_BYTES = 5 * 1024 * 1024;
const SERVER_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

/**
 * Shrink a photo to at most MAX_EDGE px on its long side and re-encode it as JPEG.
 * Small files the server already accepts go through untouched. If the browser cannot
 * decode the photo, the original is returned and the server decides.
 */
export async function shrinkImage(file) {
  if (!file) return file;
  const looksLikeImage = file.type?.startsWith('image/') || /\.(heic|heif)$/i.test(file.name || '');
  if (!looksLikeImage) return file;
  if (SERVER_TYPES.includes(file.type) && file.size <= 1.5 * 1024 * 1024) return file;

  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // transparent PNGs would otherwise turn black as JPEG
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY));
    canvas.width = canvas.height = 0; // free the memory now; iOS Safari caps canvas memory
    if (!blob) return file;
    if (blob.size >= file.size && SERVER_TYPES.includes(file.type) && file.size <= SERVER_LIMIT_BYTES) return file;

    const base = (file.name || 'photo').replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (err) {
    console.warn('Could not shrink photo, sending the original:', err);
    return file;
  }
}

/** Shrink and upload any number of photos. Resolves to the uploaded images ({ url, path }). */
export async function uploadImages(files) {
  const prepared = [];
  // One at a time: decoding several 48MP photos at once can exhaust an iPhone's memory.
  for (const f of files) prepared.push(await shrinkImage(f));

  const uploaded = [];
  for (let i = 0; i < prepared.length; i += MAX_FILES_PER_REQUEST) {
    const formData = new FormData();
    prepared.slice(i, i + MAX_FILES_PER_REQUEST).forEach(f => formData.append('images', f));
    const { data } = await api.post('/upload/images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    uploaded.push(...data.images);
  }
  return uploaded;
}

/** Shrink and upload one photo. Resolves to { url, path }. */
export async function uploadImage(file) {
  const formData = new FormData();
  formData.append('image', await shrinkImage(file));
  const { data } = await api.post('/upload/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/** A message for the person, using the server's reason when it gave one. */
export function uploadErrorMessage(err) {
  const reason = err?.response?.data?.error;
  return reason ? `Photo upload failed: ${reason}` : 'Photo upload failed. Please try again.';
}
