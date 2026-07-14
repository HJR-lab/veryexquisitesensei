require('dotenv').config();
// ── Force IPv4 for ALL outbound connections ──────────────────────────────────
// Railway's container egress reaches Shopify over IPv6, whose path has a broken
// PMTU: large gzip responses are truncated mid-body (ERR_STREAM_PREMATURE_CLOSE
// at Gunzip), which silently broke order/customer sync even though no app code
// changed. Soft ordering (setDefaultResultOrder('ipv4first')) was NOT enough —
// Node/node-fetch still opened the IPv6 socket — so we hard-override dns.lookup
// to only ever return IPv4 addresses. No dependency here is IPv6-only (Supabase
// is reached via its IPv4 REST endpoint), so this is safe and permanent.
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const _dnsLookup = dns.lookup;
dns.lookup = function (hostname, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  else if (typeof options === 'number') { options = { family: options }; }
  return _dnsLookup.call(dns, hostname, { ...options, family: 4 }, callback);
};
if (dns.promises && dns.promises.lookup) {
  const _dnsLookupPromise = dns.promises.lookup.bind(dns.promises);
  dns.promises.lookup = (hostname, options = {}) =>
    _dnsLookupPromise(hostname, { ...(typeof options === 'number' ? { family: options } : options), family: 4 });
}
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const supabaseDb = require('./utils/supabaseDb');
const cookieParser = require('cookie-parser');
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');
const { upload, ensureBucketExists } = require('./utils/imageUpload');
const { startAutomaticProcessing, autoMarkPastBookingsAsAttended } = require('./utils/cohortAutoProcessor');
const { startCustomerPolling } = require('./utils/shopifySync');
const courseConfig = require('./utils/courseConfig');

const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
if (!process.env.COOKIE_SECRET) { console.error('WARNING: COOKIE_SECRET not set — impersonation will not work'); }

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5175',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5175',
    'https://club.ves.sg'
  ],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Impersonate-Id']
}));
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET));

// Initialize Shopify API
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_customers', 'write_customers'],
  hostName: process.env.SHOPIFY_SHOP_DOMAIN,
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false,
});

function getShopifyClient() {
  return new shopify.clients.Graphql({
    session: {
      shop: process.env.SHOPIFY_SHOP_DOMAIN,
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
    },
  });
}

// Middleware to verify Supabase Auth token
async function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Verify token with Supabase Auth (uses service key)
    const { data: { user: authUser }, error: authError } = await supabaseDb.supabase.auth.getUser(token);
    if (authError || !authUser) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Look up customer by email (case-insensitive — Supabase Auth lowercases emails)
    const { data: customer, error: customerError } = await supabaseDb.supabase
      .from('customers')
      .select('id, email, first_name, last_name, shopify_customer_id, role')
      .ilike('email', authUser.email)
      .single();

    if (customerError || !customer) {
      return res.status(401).json({ error: 'No account found' });
    }

    const isAdmin = customer.email === 'info@ves.sg' && (customer.role === 'admin' || customer.role === 'owner');

    // Check for impersonation via header or cookie (admin only)
    const impersonateId = req.headers['x-impersonate-id'] || req.signedCookies?.ves_impersonate;
    if (impersonateId && isAdmin) {
      const { data: target, error: targetError } = await supabaseDb.supabase
        .from('customers')
        .select('id, email, first_name, last_name, shopify_customer_id, role')
        .eq('id', impersonateId)
        .single();

      if (!targetError && target) {
        req.user = {
          customerId: target.shopify_customer_id,
          dbCustomerId: target.id,
          email: target.email,
          firstName: target.first_name,
          lastName: target.last_name,
          isAdmin: false,
          isImpersonating: true,
          impersonatedBy: customer.email,
          role: target.role || 'student'
        };
        return next();
      }
    }

    req.user = {
      customerId: customer.shopify_customer_id,
      dbCustomerId: customer.id,
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name,
      isAdmin,
      isImpersonating: false,
      impersonatedBy: null,
      role: customer.role || 'student'
    };
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Async route handler wrapper — catches errors and sends 500 response
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((error) => {
    console.error(`Error in ${req.method} ${req.path}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  });
};

// Rate limiting
// Note: login itself happens via Supabase Auth (not this server), so /api/auth/*
// here is just status/profile/impersonation — hit on every page load by /me.
// A strict per-IP limit on /api/auth/* locks users out after normal navigation;
// rely on the general apiLimiter for those routes.
//
// IMPORTANT: a single admin page load fans out into many /api calls, and React
// StrictMode double-fires them in dev. A 200/15min cap is far too low and once
// tripped it 429s EVERYTHING — including /api/auth/me, which silently logs the
// user out and blocks re-login. So: generous cap, and never rate-limit the
// per-page-load auth status endpoint.
const isProd = process.env.NODE_ENV === 'production';
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 2000 : 100000,
  standardHeaders: true,
  legacyHeaders: false,
  // Never throttle the session-status endpoint hit on every navigation/refresh.
  skip: (req) => req.path === '/auth/me' || req.originalUrl.startsWith('/api/auth/me'),
});
const writeLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const syncLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });

app.use('/api/', apiLimiter);
app.use('/api/classes/book', writeLimiter);
app.use('/api/credits/delivery', writeLimiter);
app.use('/api/admin/sync', syncLimiter);

// Shared dependencies for route modules
const deps = { authenticateToken, requireAdmin, asyncHandler, upload, getShopifyClient, shopify };

// HTTP Cache-Control middleware
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();

  const path = req.path;

  // Admin endpoints — no caching
  if (path.startsWith('/api/admin')) {
    res.set('Cache-Control', 'no-store');
  }
  // User-specific data — private, revalidate every request
  else if (
    path === '/api/auth/me' ||
    path === '/api/students/me' ||
    path === '/api/students/me/dashboard' ||
    path === '/api/classes/my-bookings'
  ) {
    res.set('Cache-Control', 'private, no-cache');
  }
  // Static/slow-changing public data — cache 5 minutes
  else if (
    path === '/api/classes/available' ||
    path === '/api/pottery/public' ||
    path === '/api/community' ||
    path === '/api/events/upcoming'
  ) {
    res.set('Cache-Control', 'public, max-age=300');
  }

  next();
});

// Route modules
require('./routes/auth')(app, deps);
require('./routes/upload')(app, deps);
require('./routes/pottery')(app, deps);
require('./routes/classes')(app, deps);
require('./routes/admin')(app, deps);
require('./routes/membership')(app, deps);
require('./routes/shopify')(app, deps);
require('./routes/inventory')(app, deps);
require('./routes/instructors')(app, deps);
require('./routes/credits')(app, deps);
require('./routes/pieces')(app, deps);
require('./routes/notifications')(app, deps);
require('./routes/inbox')(app, deps);
require('./routes/crm')(app, deps);
require('./routes/studentDetails')(app, deps);

// Manual trigger: mark all past bookings as attended
app.post('/api/admin/mark-past-attended', deps.authenticateToken, deps.requireAdmin, deps.asyncHandler(async (req, res) => {
  const result = await autoMarkPastBookingsAsAttended();
  res.json(result);
}));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'VES Pottery Gallery API'
  });
});

// Static files & SPA fallback (only if public/ exists)
const fs = require('fs');
const publicDir = require('path').join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static('public'));
  app.get('*', (req, res, next) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile('index.html', { root: 'public' });
    } else {
      next();
    }
  });
}

// Export for Vercel serverless
module.exports = app;

// Start server only when running directly (not imported by Vercel)
if (require.main === module) {
  const server = app.listen(PORT, async () => {
    console.log(`VES Pottery Gallery API running on port ${PORT}`);
    await courseConfig.loadConfig();
    await ensureBucketExists();
    startAutomaticProcessing();
    startCustomerPolling(15);
  });

  process.on('SIGTERM', async () => {
    server.close(() => process.exit(0));
  });

  process.on('SIGINT', async () => {
    server.close(() => process.exit(0));
  });
}
