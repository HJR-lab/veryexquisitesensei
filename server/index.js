require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const supabaseDb = require('./utils/supabaseDb');
const cookieParser = require('cookie-parser');
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');
const { upload, ensureBucketExists } = require('./utils/imageUpload');
const { startAutomaticProcessing } = require('./utils/cohortAutoProcessor');

const app = express();
const PORT = process.env.PORT || 3000;
if (!process.env.COOKIE_SECRET) { console.error('FATAL: COOKIE_SECRET not set'); process.exit(1); }

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5175',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5175',
    'https://pottery-gallery-app.vercel.app',
    'https://pottery-gallery-app-frontend.vercel.app',
    'https://frontend-phi-seven-81.vercel.app',
    'https://club.ves.sg'
  ],
  credentials: true
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

    // Look up customer by email
    const { data: customer, error: customerError } = await supabaseDb.supabase
      .from('customers')
      .select('id, email, first_name, last_name, shopify_customer_id, role')
      .eq('email', authUser.email)
      .single();

    if (customerError || !customer) {
      return res.status(401).json({ error: 'No account found' });
    }

    const isAdmin = customer.email === 'info@ves.sg';

    // Check for impersonation cookie (admin only)
    const impersonateId = req.signedCookies?.ves_impersonate;
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

// Shared dependencies for route modules
const deps = { authenticateToken, requireAdmin, asyncHandler, upload, getShopifyClient, shopify };

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

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'VES Pottery Gallery API'
  });
});

// Static files & SPA fallback
app.use(express.static('public'));
app.get('*', (req, res, next) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile('index.html', { root: 'public' });
  } else {
    next();
  }
});

// Start server
const server = app.listen(PORT, async () => {
  console.log(`🎨 VES Pottery Gallery API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Auth endpoints: /api/auth/*`);
  console.log(`🏺 Gallery endpoints: /api/pottery/*`);
  console.log(`📤 Upload endpoints: /api/upload/*`);
  console.log(`🗄️  Supabase database connected`);

  await ensureBucketExists();
  startAutomaticProcessing();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
