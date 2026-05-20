#!/usr/bin/env node
/**
 * Register Shopify webhooks for automatic order and customer processing.
 *
 * Usage:
 *   BACKEND_URL=https://your-railway-app.up.railway.app node scripts/register-shopify-webhooks.js
 *
 * Or set BACKEND_URL in your .env file and run from the server/ directory:
 *   node scripts/register-shopify-webhooks.js
 *
 * This script:
 *  1. Lists existing webhooks
 *  2. Registers orders/create and customers/create if not already present
 *  3. Points them at your Railway backend's /api/shopify/webhook/* endpoints
 */

require('dotenv').config();

const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const BACKEND_URL = process.env.BACKEND_URL;

if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
  console.error('Missing SHOPIFY_SHOP_DOMAIN or SHOPIFY_ACCESS_TOKEN in environment');
  process.exit(1);
}

if (!BACKEND_URL) {
  console.error('Missing BACKEND_URL — set it to your Railway deployment URL (e.g. https://your-app.up.railway.app)');
  process.exit(1);
}

const SHOPIFY_API_URL = `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-04`;

const WEBHOOKS_TO_REGISTER = [
  { topic: 'orders/create', path: '/api/shopify/webhook/orders' },
  { topic: 'customers/create', path: '/api/shopify/webhook/customers' },
];

async function shopifyFetch(endpoint, options = {}) {
  const url = `${SHOPIFY_API_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API ${res.status}: ${text}`);
  }
  return res.json();
}

async function listWebhooks() {
  const data = await shopifyFetch('/webhooks.json');
  return data.webhooks || [];
}

async function registerWebhook(topic, address) {
  const data = await shopifyFetch('/webhooks.json', {
    method: 'POST',
    body: JSON.stringify({
      webhook: { topic, address, format: 'json' },
    }),
  });
  return data.webhook;
}

async function main() {
  console.log(`Shop: ${SHOPIFY_SHOP_DOMAIN}`);
  console.log(`Backend: ${BACKEND_URL}`);
  console.log();

  // List existing webhooks
  const existing = await listWebhooks();
  console.log(`Found ${existing.length} existing webhook(s):`);
  for (const wh of existing) {
    console.log(`  - ${wh.topic} → ${wh.address} (id: ${wh.id})`);
  }
  console.log();

  // Register missing webhooks
  for (const { topic, path } of WEBHOOKS_TO_REGISTER) {
    const address = `${BACKEND_URL}${path}`;
    const alreadyRegistered = existing.find(
      wh => wh.topic === topic && wh.address === address
    );

    if (alreadyRegistered) {
      console.log(`✅ ${topic} already registered → ${address}`);
    } else {
      // Check if topic exists but with wrong URL
      const wrongUrl = existing.find(wh => wh.topic === topic);
      if (wrongUrl) {
        console.log(`⚠️  ${topic} exists but points to ${wrongUrl.address}`);
        console.log(`   Consider deleting webhook ${wrongUrl.id} in Shopify admin if it's stale`);
      }

      try {
        const webhook = await registerWebhook(topic, address);
        console.log(`✅ Registered ${topic} → ${address} (id: ${webhook.id})`);
      } catch (err) {
        console.error(`❌ Failed to register ${topic}: ${err.message}`);
      }
    }
  }

  console.log('\nDone. Webhooks will fire on new orders/customers in Shopify.');
  console.log('Verify with: curl -X POST your-backend/api/shopify/webhook/orders (should get 401 — HMAC missing)');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
