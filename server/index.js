require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');
const { syncCustomer } = require('./utils/shopifySync');
const { upload, uploadImageToSupabase, deleteImageFromSupabase, ensureBucketExists } = require('./utils/imageUpload');
const { generateICS, generateMultipleICS } = require('./utils/calendarGenerator');
const supabaseDb = require('./utils/supabaseDb');
const { startAutomaticProcessing, processReadyCohorts } = require('./utils/cohortAutoProcessor');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('FATAL: JWT_SECRET not set'); process.exit(1); }

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
    'https://frontend-phi-seven-81.vercel.app'
  ],
  credentials: true
}));
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Initialize Shopify API
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_customers', 'write_customers'],
  hostName: process.env.SHOPIFY_SHOP_DOMAIN,
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false,
});

// Create Shopify GraphQL client
function getShopifyClient() {
  return new shopify.clients.Graphql({
    session: {
      shop: process.env.SHOPIFY_SHOP_DOMAIN,
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
    },
  });
}

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  // Prefer cookie, keep Authorization header as fallback during transition
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
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

// Shared helper: get studio access passes for a customer
// Used by both auth (dashboard) and instructors (studio access) routes
async function getStudioAccessPasses(customerId) {
  // Check if student has a WT 6wk x3 package enrollment (active or completed)
  const { data: enrollments } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('id, package_total_courses, course_identifier, course_type, status')
    .eq('student_id', customerId)
    .eq('package_total_courses', 3);

  const hasWt3 = enrollments?.some(enr =>
    (enr.course_identifier || '').toUpperCase().startsWith('WT') ||
    (enr.course_type || '').toLowerCase().includes('wheelthrowing')
  );

  if (!hasWt3) return { total: 0, used: 0, remaining: 0 };

  // Count used passes (bookings with is_pass = true or amount_sgd = 0 and notes contain 'pass')
  const { data: passBookings } = await supabaseDb.supabase
    .from('studio_access_bookings')
    .select('id')
    .eq('customer_id', customerId)
    .eq('amount_sgd', 0)
    .neq('status', 'cancelled');

  const used = passBookings?.length || 0;
  return { total: 3, used, remaining: Math.max(0, 3 - used) };
}

// ============================================
// UTILITY ENDPOINTS (health, static, SPA)
// ============================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'VES Pottery Gallery API'
  });
});

app.use(express.static('public'));

app.get('*', (req, res, next) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile('index.html', { root: 'public' });
  } else {
    next();
  }
});

// ============================================
// Route modules
// ============================================
require('./routes/auth')(app, { authenticateToken, requireAdmin, asyncHandler, getStudioAccessPasses });
require('./routes/upload')(app, { authenticateToken, requireAdmin, asyncHandler, upload });
require('./routes/pottery')(app, { authenticateToken, requireAdmin, asyncHandler, upload });
require('./routes/classes')(app, { authenticateToken, requireAdmin, asyncHandler });
require('./routes/admin')(app, { authenticateToken, requireAdmin, asyncHandler, upload, getShopifyClient });
require('./routes/membership')(app, { authenticateToken, requireAdmin, asyncHandler });
require('./routes/shopify')(app, { authenticateToken, requireAdmin, asyncHandler, getShopifyClient, shopify });
require('./routes/inventory')(app, { authenticateToken, requireAdmin, asyncHandler });
require('./routes/instructors')(app, { authenticateToken, requireAdmin, asyncHandler, upload });

// ============================================
// Server startup
// ============================================
const server = app.listen(PORT, async () => {
  console.log(`🎨 VES Pottery Gallery API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Auth endpoints: /api/auth/*`);
  console.log(`🏺 Gallery endpoints: /api/pottery/*`);
  console.log(`📤 Upload endpoints: /api/upload/*`);
  console.log(`🗄️  Supabase database connected (Prisma-free!)`);

  await ensureBucketExists();

  // Start automatic cohort processing (runs daily at 2 AM)
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
