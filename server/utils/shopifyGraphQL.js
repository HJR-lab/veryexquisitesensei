/**
 * Shopify Admin GraphQL over a raw HTTPS request.
 *
 * Moved out of routes/shopify.js so the continuation offers can read the course
 * catalogue and create checkout links through the same resilient client.
 */

// Resilient Shopify GraphQL call used by the sync endpoints.
//
// The Shopify SDK's node-fetch client began failing on Railway with
// "Premature close" (ERR_STREAM_PREMATURE_CLOSE at Gunzip): the gzip response
// stream is truncated mid-body on every call, breaking sync. This bypasses the
// SDK's fetch entirely and talks to Shopify over a raw HTTPS request we fully
// control: no gzip (so there is no gunzip stream to truncate), no keep-alive
// reuse (Connection: close → a fresh socket every time), and automatic retry
// with backoff. Returns { body: <parsed JSON> } to match the SDK's shape.
const SHOPIFY_API_VERSION = '2024-04';
// Pass { attempts: 1 } for a mutation that must not run twice: a retry after a
// response was lost would create a second draft order and hold a second seat.
function shopifyGraphQL(query, variables = {}, { attempts = 3 } = {}) {
  const https = require('https');
  const payload = JSON.stringify({ query, variables });
  const attempt = () => new Promise((resolve, reject) => {
    const t0 = Date.now();
    const req = https.request({
      host: process.env.SHOPIFY_SHOP_DOMAIN,
      path: `/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'identity', // no gzip — avoids the truncated-gunzip failure
        'Connection': 'close',         // fresh socket each call — avoids poisoned keep-alive
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Shopify HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
        }
        try {
          const parsed = JSON.parse(raw);
          if (parsed.errors) return reject(new Error(`Shopify GraphQL errors: ${JSON.stringify(parsed.errors).slice(0, 300)}`));
          resolve({ body: parsed });
        } catch (e) {
          reject(new Error(`Shopify JSON parse failed (${raw.length} bytes, ${Date.now() - t0}ms): ${e.message}`));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('Shopify request timed out after 30s')); });
    req.write(payload);
    req.end();
  });

  return (async () => {
    let lastErr;
    for (let i = 1; i <= attempts; i++) {
      try {
        return await attempt(i);
      } catch (err) {
        lastErr = err;
        console.warn(`⚠️  Shopify GraphQL attempt ${i}/${attempts} failed: ${err.message}`);
        if (i < attempts) await new Promise((r) => setTimeout(r, 500 * i));
      }
    }
    throw lastErr;
  })();
}

module.exports = { shopifyGraphQL, SHOPIFY_API_VERSION };
