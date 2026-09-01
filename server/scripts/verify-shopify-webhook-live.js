require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const https = require('https');
const { supabase } = require('../utils/supabaseDb');

// Liveness probe: the fixed handler parses the Buffer and calls syncCustomer,
// which bumps last_synced_at. The broken handler reads undefined off a Buffer
// and returns 200 without touching anything. Empty line_items so nothing else
// runs. Harmless either way.
//
// CAVEAT — this only proves the HANDLER works, never that Shopify can reach it.
// It signs with a secret we hold, so it passes HMAC by construction. Real
// deliveries are signed by the app that owns the webhook subscription
// (Pottery Manager, via SHOPIFY_ACCESS_TOKEN) — a different app from the one
// SHOPIFY_API_SECRET belongs to. Sign with SHOPIFY_WEBHOOK_SECRET when it is
// set so this probe exercises the same secret production traffic uses.
const HOST = 'ves-pottery-api-production.up.railway.app';

function post(path, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET).update(Buffer.from(body)).digest('base64');
    const req = https.request({
      hostname: HOST, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Hmac-Sha256': hmac,
        'X-Shopify-Shop-Domain': process.env.SHOPIFY_SHOP_DOMAIN,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    req.on('error', reject);
    req.end(body);
  });
}

(async () => {
  const { data: before } = await supabase.from('customers').select('last_synced_at, updated_at').eq('id', 3143).single();
  console.log('before  last_synced_at:', before.last_synced_at);

  const t0 = Date.now();
  const res = await post('/api/shopify/webhook/orders', {
    id: 999999,
    name: '#LIVE-PROBE',
    created_at: new Date().toISOString(),
    customer: { id: 9533747691678, email: 'asyiqinrashaid@gmail.com', first_name: 'Asyiqin', last_name: 'Rashaid' },
    line_items: [],
  });
  console.log(`response HTTP ${res.status} ${res.body} (${Date.now() - t0}ms)`);

  await new Promise(r => setTimeout(r, 6000));
  const { data: after } = await supabase.from('customers').select('last_synced_at, updated_at').eq('id', 3143).single();
  console.log('after   last_synced_at:', after.last_synced_at);
  console.log('updated_at unchanged:', before.updated_at === after.updated_at);
  console.log(before.last_synced_at !== after.last_synced_at
    ? '\n==> HANDLER IS LIVE (parsed the payload and synced).\n    Not proof Shopify can reach it — see the CAVEAT at the top of this file.'
    : '\n==> HANDLER NOT WORKING (no-op, or the signing secret is not one the server accepts)');
})();
