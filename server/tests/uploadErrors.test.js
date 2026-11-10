const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';

const express = require('express');
const { upload, withUploadErrors, describeUploadError } = require('../utils/imageUpload');

// A real express app with the real multer config, so the test sees what a phone sees.
async function withServer(fn) {
  const app = express();
  app.post('/many', withUploadErrors(upload.array('images', 5)), (req, res) => res.json({ ok: true, n: req.files.length }));
  app.post('/one', withUploadErrors(upload.single('image')), (req, res) => res.json({ ok: true }));
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

function photo(bytes, type = 'image/jpeg', name = 'IMG_0001.jpg') {
  return { blob: new Blob([Buffer.alloc(bytes)], { type }), name };
}

async function post(url, field, files) {
  const form = new FormData();
  files.forEach(f => form.append(field, f.blob, f.name));
  const res = await fetch(url, { method: 'POST', body: form });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('a phone photo over 5MB gets a 400 with a reason, not a 500 page', async () => {
  await withServer(async (base) => {
    const { status, body } = await post(`${base}/many`, 'images', [photo(7 * 1024 * 1024)]);
    assert.equal(status, 400);
    assert.match(body.error, /too large/);
  });
});

test('a HEIC photo gets a 400 that names the supported formats', async () => {
  await withServer(async (base) => {
    const { status, body } = await post(`${base}/one`, 'image', [photo(1000, 'image/heic', 'IMG_0001.HEIC')]);
    assert.equal(status, 400);
    assert.match(body.error, /JPEG, PNG or WebP/);
  });
});

test('more than 5 photos at once gets a 400 asking for smaller groups', async () => {
  await withServer(async (base) => {
    const six = Array.from({ length: 6 }, (_, i) => photo(1000, 'image/jpeg', `p${i}.jpg`));
    const { status, body } = await post(`${base}/many`, 'images', six);
    assert.equal(status, 400);
    assert.match(body.error, /5 max/);
  });
});

test('a normal photo still goes through', async () => {
  await withServer(async (base) => {
    const { status, body } = await post(`${base}/many`, 'images', [photo(200 * 1024)]);
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, n: 1 });
  });
});

test('errors that are not upload rejections are left for the app to handle', () => {
  assert.equal(describeUploadError(new Error('database down')), null);
  assert.equal(describeUploadError(null), null);
});
