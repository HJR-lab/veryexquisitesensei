require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');
const { syncCustomer, migratePotteryPieces, getOrSyncCustomer, prisma } = require('./utils/shopifySync');
const { upload, uploadImageToSupabase, deleteImageFromSupabase, ensureBucketExists } = require('./utils/imageUpload');
const { generateICS, generateMultipleICS } = require('./utils/calendarGenerator');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
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

// Create Shopify REST client
function getRestClient() {
  return new shopify.clients.Rest({
    session: {
      shop: process.env.SHOPIFY_SHOP_DOMAIN,
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
    },
  });
}

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

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

// ============================================
// AUTH ENDPOINTS
// ============================================

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Search for customer by email in Shopify using GraphQL
    const client = getShopifyClient();

    const searchQuery = `
      query {
        customers(first: 1, query: "email:${email}") {
          edges {
            node {
              id
              email
              firstName
              lastName
              metafield(namespace: "custom", key: "app_password") {
                value
              }
            }
          }
        }
      }
    `;

    const response = await client.query({ data: searchQuery });
    const customers = response.body.data.customers.edges;

    if (customers.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const customer = customers[0].node;
    const customerId = customer.id.split('/').pop();

    // Check password
    const storedPassword = customer.metafield?.value || 'pottery123';
    const passwordMatch = await bcrypt.compare(password, storedPassword);

    if (!passwordMatch && password !== storedPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Sync customer to PostgreSQL
    const dbCustomer = await syncCustomer(customer, customerId);

    // Create JWT token (include database ID)
    const token = jwt.sign(
      {
        customerId: customerId, // Shopify ID
        dbCustomerId: dbCustomer.id, // PostgreSQL ID
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      user: {
        id: customerId,
        dbId: dbCustomer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Register endpoint - DISABLED: Only existing customers can login
app.post('/api/auth/register', async (req, res) => {
  // Registration is disabled - only existing Shopify customers can access the gallery
  return res.status(403).json({
    error: 'Registration is disabled. Please contact VES staff to be added as a customer.'
  });
});

// ORIGINAL REGISTRATION CODE - COMMENTED OUT
/*
app.post('/api/auth/register-DISABLED', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const client = getShopifyClient();

    // Check if customer already exists
    const searchQuery = `
      query {
        customers(first: 1, query: "email:${email}") {
          edges {
            node {
              id
            }
          }
        }
      }
    `;

    const searchResponse = await client.query({ data: searchQuery });

    if (searchResponse.body.data.customers.edges.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create customer in Shopify using GraphQL
    const createMutation = `
      mutation customerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer {
            id
            email
            firstName
            lastName
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const createResponse = await client.query({
      data: {
        query: createMutation,
        variables: {
          input: {
            email,
            firstName: firstName || '',
            lastName: lastName || '',
            tags: ['pottery-app-user']
          }
        }
      }
    });

    if (createResponse.body.data.customerCreate.userErrors.length > 0) {
      const error = createResponse.body.data.customerCreate.userErrors[0];
      return res.status(400).json({ error: error.message });
    }

    const customer = createResponse.body.data.customerCreate.customer;
    const customerId = customer.id.split('/').pop(); // Extract numeric ID

    // Store hashed password in metafield
    const metafieldMutation = `
      mutation customerUpdate($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    await client.query({
      data: {
        query: metafieldMutation,
        variables: {
          input: {
            id: customer.id,
            metafields: [
              {
                namespace: 'custom',
                key: 'app_password',
                value: hashedPassword,
                type: 'single_line_text_field'
              }
            ]
          }
        }
      }
    });

    // Create JWT token
    const token = jwt.sign(
      {
        customerId: customerId,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      user: {
        id: customerId,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName
      },
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});
*/

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// ============================================
// IMAGE UPLOAD ENDPOINTS
// ============================================

// Upload single image
app.post('/api/upload/image', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { dbCustomerId } = req.user;

    // Upload to Supabase Storage
    const { url, path: filePath } = await uploadImageToSupabase(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      dbCustomerId.toString()
    );

    res.json({
      success: true,
      url: url,
      path: filePath
    });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload image' });
  }
});

// Upload multiple images
app.post('/api/upload/images', authenticateToken, upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No image files provided' });
    }

    const { dbCustomerId } = req.user;
    const uploadedImages = [];

    // Upload all images
    for (const file of req.files) {
      const { url, path: filePath } = await uploadImageToSupabase(
        file.buffer,
        file.originalname,
        file.mimetype,
        dbCustomerId.toString()
      );

      uploadedImages.push({ url, path: filePath });
    }

    res.json({
      success: true,
      images: uploadedImages
    });
  } catch (error) {
    console.error('Images upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload images' });
  }
});

// Delete image
app.delete('/api/upload/image', authenticateToken, async (req, res) => {
  try {
    const { path: filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: 'File path required' });
    }

    await deleteImageFromSupabase(filePath);

    res.json({ success: true });
  } catch (error) {
    console.error('Image delete error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete image' });
  }
});

// ============================================
// POTTERY GALLERY ENDPOINTS
// ============================================

// Create pottery piece (student upload)
app.post('/api/pottery/create-piece', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const pieceData = req.body;

    // Create piece in PostgreSQL
    const newPiece = await prisma.potteryPiece.create({
      data: {
        customerId: dbCustomerId,
        title: pieceData.title,
        dateCompleted: new Date(pieceData.date_completed),
        notes: pieceData.description || null,
        clayType: pieceData.clay_type || 'Other',
        glazes: pieceData.glazes || [],
        height: pieceData.height ? parseFloat(pieceData.height) : null,
        width: pieceData.width ? parseFloat(pieceData.width) : null,
        length: pieceData.length ? parseFloat(pieceData.length) : null,
        images: pieceData.images || [],
        tags: pieceData.tags || [],
        isPublic: pieceData.is_public || false,
        featured: false
      }
    });

    res.json({ success: true, piece: newPiece });
  } catch (error) {
    console.error('Error creating pottery piece:', error);
    res.status(500).json({ error: 'Failed to create pottery piece' });
  }
});

// Get pottery pieces for logged-in user
app.get('/api/pottery/pieces', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    // Get pieces from PostgreSQL
    const pieces = await prisma.potteryPiece.findMany({
      where: { customerId: dbCustomerId },
      orderBy: { dateCompleted: 'desc' }
    });

    // Transform to match old format
    const formattedPieces = pieces.map(piece => ({
      id: piece.id.toString(),
      title: piece.title,
      description: piece.notes,
      clay_type: piece.clayType,
      glaze: piece.glazes[0] || '', // Take first glaze
      glazes: piece.glazes,
      original_weight: piece.originalWeight?.toString(),
      final_weight: piece.finalWeight?.toString(),
      height: piece.height?.toString(),
      length: piece.length?.toString(),
      width: piece.width?.toString(),
      dimensions: piece.height && piece.width && piece.length
        ? `${piece.height}" H x ${piece.width}" W x ${piece.length}" L`
        : '',
      date_completed: piece.dateCompleted.toISOString().split('T')[0],
      images: piece.images,
      tags: piece.tags,
      is_public: piece.isPublic,
      featured: piece.featured
    }));

    res.json({ pieces: formattedPieces });
  } catch (error) {
    console.error('Error fetching pottery pieces:', error);
    res.status(500).json({ error: 'Failed to fetch pottery pieces' });
  }
});

// Update pottery pieces (for admin use)
app.post('/api/pottery/pieces', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.user;
    const { pieces } = req.body;
    const client = getShopifyClient();

    // Get existing metafield
    const getResponse = await client.get({
      path: `customers/${customerId}/metafields`,
      query: { namespace: 'custom', key: 'design_projects' }
    });

    const existingMetafields = getResponse.body.metafields || [];
    const existingMetafield = existingMetafields.find(
      m => m.namespace === 'custom' && m.key === 'design_projects'
    );

    if (existingMetafield) {
      // Update existing
      await client.put({
        path: `customers/${customerId}/metafields/${existingMetafield.id}`,
        data: {
          metafield: {
            value: JSON.stringify(pieces),
            type: 'json'
          }
        }
      });
    } else {
      // Create new
      await client.post({
        path: `customers/${customerId}/metafields`,
        data: {
          metafield: {
            namespace: 'custom',
            key: 'design_projects',
            value: JSON.stringify(pieces),
            type: 'json'
          }
        }
      });
    }

    res.json({ success: true, pieces });
  } catch (error) {
    console.error('Error updating pottery pieces:', error);
    res.status(500).json({ error: 'Failed to update pottery pieces' });
  }
});

// Get public pottery pieces (no authentication required)
app.get('/api/pottery/public', async (req, res) => {
  try {
    // Get all public pieces with customer info
    const pieces = await prisma.potteryPiece.findMany({
      where: {
        isPublic: true
      },
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: [
        { featured: 'desc' },
        { dateCompleted: 'desc' }
      ]
    });

    // Transform to format
    const formattedPieces = pieces.map(piece => ({
      id: piece.id.toString(),
      title: piece.title,
      description: piece.notes,
      clay_type: piece.clayType,
      glazes: piece.glazes,
      height: piece.height?.toString(),
      length: piece.length?.toString(),
      width: piece.width?.toString(),
      date_completed: piece.dateCompleted.toISOString().split('T')[0],
      images: piece.images,
      tags: piece.tags,
      featured: piece.featured,
      artist: piece.customer.firstName
        ? `${piece.customer.firstName} ${piece.customer.lastName || ''}`.trim()
        : 'VES Student'
    }));

    res.json({ pieces: formattedPieces });
  } catch (error) {
    console.error('Error fetching public pottery pieces:', error);
    res.status(500).json({ error: 'Failed to fetch public pottery pieces' });
  }
});

// ============================================
// REFERENCE DATA ENDPOINTS
// ============================================

// Get all clay types
app.get('/api/reference/clay-types', authenticateToken, async (req, res) => {
  try {
    const clayTypes = await prisma.clayType.findMany({
      where: { active: true },
      orderBy: { name: 'asc' }
    });

    res.json({ clayTypes });
  } catch (error) {
    console.error('Error fetching clay types:', error);
    res.status(500).json({ error: 'Failed to fetch clay types' });
  }
});

// Get all glazes
app.get('/api/reference/glazes', authenticateToken, async (req, res) => {
  try {
    const glazes = await prisma.glaze.findMany({
      where: { active: true },
      orderBy: { name: 'asc' }
    });

    res.json({ glazes });
  } catch (error) {
    console.error('Error fetching glazes:', error);
    res.status(500).json({ error: 'Failed to fetch glazes' });
  }
});

// ============================================
// ATTENDANCE & NO-SHOW ENDPOINTS (Phase 3)
// ============================================

// Get bookings for a class (admin)
app.get('/api/classes/:classInstanceId/bookings', authenticateToken, async (req, res) => {
  try {
    const { classInstanceId } = req.params;

    const bookings = await prisma.booking.findMany({
      where: {
        classInstanceId: parseInt(classInstanceId)
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      orderBy: {
        student: {
          firstName: 'asc'
        }
      }
    });

    const formattedBookings = bookings.map(booking => ({
      id: booking.id,
      status: booking.status,
      advanceNoticeGiven: booking.advanceNoticeGiven,
      attended: booking.attended,
      attendanceMarkedAt: booking.attendanceMarkedAt,
      attendanceNotes: booking.attendanceNotes,
      student: {
        id: booking.student.id,
        name: `${booking.student.firstName || ''} ${booking.student.lastName || ''}`.trim(),
        email: booking.student.email
      }
    }));

    res.json({ bookings: formattedBookings });
  } catch (error) {
    console.error('Error fetching class bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Mark attendance for a booking (admin)
app.post('/api/classes/bookings/:bookingId/mark-attendance', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { attended, notes } = req.body;
    const { dbCustomerId } = req.user;

    if (typeof attended !== 'boolean') {
      return res.status(400).json({ error: 'Attended status required (true/false)' });
    }

    // Find booking
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(bookingId) },
      include: {
        student: {
          select: {
            id: true,
            classesForfeited: true
          }
        }
      }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Determine new status based on attendance
    let newStatus = booking.status;
    let incrementForfeit = false;

    if (!attended) {
      // No-show logic
      if (booking.advanceNoticeGiven) {
        // No-show with advance notice - mark as completed but didn't attend
        newStatus = 'completed';
      } else {
        // No-show without advance notice - forfeit the class
        newStatus = 'forfeited';
        incrementForfeit = true;
      }
    } else {
      // Attended - mark as completed
      newStatus = 'completed';
    }

    // Update booking
    const updatedBooking = await prisma.booking.update({
      where: { id: parseInt(bookingId) },
      data: {
        attended: attended,
        status: newStatus,
        markedByAdminId: dbCustomerId,
        attendanceMarkedAt: new Date(),
        attendanceNotes: notes || null
      }
    });

    // If forfeited, increment student's forfeit counter
    if (incrementForfeit) {
      await prisma.customer.update({
        where: { id: booking.student.id },
        data: {
          classesForfeited: {
            increment: 1
          }
        }
      });
    }

    res.json({
      success: true,
      booking: {
        id: updatedBooking.id,
        attended: updatedBooking.attended,
        status: updatedBooking.status,
        attendanceMarkedAt: updatedBooking.attendanceMarkedAt
      },
      message: attended ? 'Marked as attended' : (booking.advanceNoticeGiven ? 'Marked as no-show with notice' : 'Marked as no-show without notice - class forfeited')
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ error: 'Failed to mark attendance' });
  }
});

// Get student's attendance history (for students and admin)
app.get('/api/students/:studentId/attendance', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { dbCustomerId } = req.user;

    // Check if viewing own record or admin viewing
    // For now, allow all authenticated users (add admin check later)
    if (parseInt(studentId) !== dbCustomerId) {
      // TODO: Add admin role check here
      // For now, allow it
    }

    const customer = await prisma.customer.findUnique({
      where: { id: parseInt(studentId) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        classesForfeited: true
      }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const bookings = await prisma.booking.findMany({
      where: {
        studentId: parseInt(studentId),
        status: { in: ['completed', 'forfeited'] }
      },
      include: {
        classInstance: true
      },
      orderBy: {
        classInstance: {
          classDate: 'desc'
        }
      }
    });

    const formattedBookings = bookings.map(booking => ({
      id: booking.id,
      status: booking.status,
      attended: booking.attended,
      advanceNoticeGiven: booking.advanceNoticeGiven,
      attendanceMarkedAt: booking.attendanceMarkedAt,
      attendanceNotes: booking.attendanceNotes,
      class: {
        classDate: booking.classInstance.classDate,
        startTime: booking.classInstance.startTime,
        endTime: booking.classInstance.endTime,
        classType: booking.classInstance.classType,
        instructor: booking.classInstance.instructor
      }
    }));

    const attendanceStats = {
      totalClasses: bookings.length,
      attended: bookings.filter(b => b.attended === true).length,
      noShowWithNotice: bookings.filter(b => b.attended === false && b.advanceNoticeGiven === true).length,
      forfeited: bookings.filter(b => b.status === 'forfeited').length
    };

    res.json({
      student: {
        id: customer.id,
        name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
        email: customer.email,
        classesForfeited: customer.classesForfeited || 0
      },
      stats: attendanceStats,
      bookings: formattedBookings
    });
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    res.status(500).json({ error: 'Failed to fetch attendance history' });
  }
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

// Get all customers (for admin)
app.get('/api/admin/customers', authenticateToken, async (req, res) => {
  try {
    // Get from PostgreSQL (will be synced on login)
    const customers = await prisma.customer.findMany({
      orderBy: { firstName: 'asc' }
    });

    const formattedCustomers = customers.map(customer => ({
      id: customer.shopifyCustomerId,
      dbId: customer.id,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName
    }));

    res.json({ customers: formattedCustomers });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Get pottery pieces for a specific customer (admin)
app.get('/api/admin/customers/:customerId/pieces', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;

    // Find customer by Shopify ID
    const customer = await prisma.customer.findUnique({
      where: { shopifyCustomerId: customerId }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get pieces from PostgreSQL
    const pieces = await prisma.potteryPiece.findMany({
      where: { customerId: customer.id },
      orderBy: { dateCompleted: 'desc' }
    });

    // Transform to match old format
    const formattedPieces = pieces.map(piece => ({
      id: piece.id.toString(),
      title: piece.title,
      description: piece.notes,
      clay_type: piece.clayType,
      glaze: piece.glazes[0] || '',
      glazes: piece.glazes,
      firing_temp: '', // Not stored in new schema yet
      dimensions: piece.height && piece.width && piece.length
        ? `${piece.height}" H x ${piece.width}" W x ${piece.length}" L`
        : '',
      date_completed: piece.dateCompleted.toISOString().split('T')[0],
      images: piece.images,
      tags: piece.tags,
      student_notes: piece.notes,
      instructor_notes: '',
      is_public: piece.isPublic
    }));

    res.json({ pieces: formattedPieces });
  } catch (error) {
    console.error('Error fetching customer pieces:', error);
    res.status(500).json({ error: 'Failed to fetch pieces' });
  }
});

// Update pottery pieces for a specific customer (admin)
// This endpoint receives an array and should ADD the new piece to PostgreSQL
app.post('/api/admin/customers/:customerId/pieces', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { pieces } = req.body;

    // Find customer by Shopify ID
    const customer = await prisma.customer.findUnique({
      where: { shopifyCustomerId: customerId }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get existing pieces
    const existingPieces = await prisma.potteryPiece.findMany({
      where: { customerId: customer.id }
    });

    // Find new pieces (pieces not in database yet)
    const newPieces = pieces.filter(piece =>
      !existingPieces.some(existing => existing.id.toString() === piece.id)
    );

    // Create new pieces in PostgreSQL
    for (const piece of newPieces) {
      await prisma.potteryPiece.create({
        data: {
          customerId: customer.id,
          title: piece.title,
          dateCompleted: new Date(piece.date_completed),
          notes: piece.description || piece.student_notes || piece.instructor_notes || null,
          clayType: piece.clay_type || 'Other',
          glazes: piece.glaze ? [piece.glaze] : [],
          images: piece.images || [],
          tags: piece.tags || [],
          isPublic: piece.is_public || false,
          featured: piece.featured || false
        }
      });
    }

    // Get all pieces after creation
    const allPieces = await prisma.potteryPiece.findMany({
      where: { customerId: customer.id },
      orderBy: { dateCompleted: 'desc' }
    });

    res.json({ success: true, pieces: allPieces });
  } catch (error) {
    console.error('Error updating customer pieces:', error);
    res.status(500).json({ error: 'Failed to update pieces' });
  }
});

// ============================================
// CLASS SCHEDULING ENDPOINTS (Phase 3)
// ============================================

// Get available classes
app.get('/api/classes/available', async (req, res) => {
  try {
    const supabaseDb = require('./utils/supabaseDb');
    const classes = await supabaseDb.getAvailableClasses();
    res.json({ classes });
  } catch (error) {
    console.error('Error fetching available classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

// Get student's bookings
app.get('/api/classes/my-bookings', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    const bookings = await prisma.booking.findMany({
      where: {
        studentId: dbCustomerId
      },
      include: {
        classInstance: true
      },
      orderBy: {
        classInstance: {
          classDate: 'desc'
        }
      }
    });

    const formattedBookings = bookings.map(booking => ({
      id: booking.id,
      status: booking.status,
      advanceNoticeGiven: booking.advanceNoticeGiven,
      attended: booking.attended,
      attendanceNotes: booking.attendanceNotes,
      class: {
        id: booking.classInstance.id,
        classDate: booking.classInstance.classDate,
        startTime: booking.classInstance.startTime,
        endTime: booking.classInstance.endTime,
        classType: booking.classInstance.classType,
        instructor: booking.classInstance.instructor,
        room: booking.classInstance.room
      }
    }));

    res.json({ bookings: formattedBookings });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Book a class
app.post('/api/classes/book', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { classInstanceId } = req.body;

    if (!classInstanceId) {
      return res.status(400).json({ error: 'Class instance ID required' });
    }

    // Check if class exists
    const classInstance = await prisma.classInstance.findUnique({
      where: { id: parseInt(classInstanceId) }
    });

    if (!classInstance) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Check if class is full
    if (classInstance.currentEnrollment >= classInstance.maxCapacity) {
      return res.status(400).json({ error: 'Class is full. Please join the waitlist.' });
    }

    // Check if student already booked
    const existingBooking = await prisma.booking.findFirst({
      where: {
        studentId: dbCustomerId,
        classInstanceId: parseInt(classInstanceId),
        status: 'booked'
      }
    });

    if (existingBooking) {
      return res.status(400).json({ error: 'You are already booked for this class' });
    }

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        studentId: dbCustomerId,
        classInstanceId: parseInt(classInstanceId),
        status: 'booked'
      }
    });

    // Increment enrollment
    await prisma.classInstance.update({
      where: { id: parseInt(classInstanceId) },
      data: {
        currentEnrollment: {
          increment: 1
        }
      }
    });

    res.json({
      success: true,
      booking: {
        id: booking.id,
        classInstanceId: booking.classInstanceId,
        status: booking.status
      },
      message: 'Class booked successfully!'
    });
  } catch (error) {
    console.error('Error booking class:', error);
    res.status(500).json({ error: 'Failed to book class' });
  }
});

// Cancel a booking
app.post('/api/classes/cancel', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { bookingId, advanceNotice } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: 'Booking ID required' });
    }

    // Find booking
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(bookingId) },
      include: { classInstance: true }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.studentId !== dbCustomerId) {
      return res.status(403).json({ error: 'This booking does not belong to you' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Booking already cancelled' });
    }

    // Update booking
    await prisma.booking.update({
      where: { id: parseInt(bookingId) },
      data: {
        status: 'cancelled',
        advanceNoticeGiven: advanceNotice || false
      }
    });

    // Decrement enrollment
    await prisma.classInstance.update({
      where: { id: booking.classInstanceId },
      data: {
        currentEnrollment: {
          decrement: 1
        }
      }
    });

    // TODO: Automatically offer spot to next person on waitlist

    res.json({
      success: true,
      message: 'Booking cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

// ============================================
// WAITLIST ENDPOINTS (Phase 3)
// ============================================

// Join waitlist for a class
app.post('/api/classes/waitlist/join', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { classInstanceId } = req.body;

    if (!classInstanceId) {
      return res.status(400).json({ error: 'Class instance ID required' });
    }

    // Check if class exists and get current enrollment
    const classInstance = await prisma.classInstance.findUnique({
      where: { id: parseInt(classInstanceId) }
    });

    if (!classInstance) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Check if student is already booked for this class
    const existingBooking = await prisma.booking.findFirst({
      where: {
        studentId: dbCustomerId,
        classInstanceId: parseInt(classInstanceId),
        status: 'booked'
      }
    });

    if (existingBooking) {
      return res.status(400).json({ error: 'You are already booked for this class' });
    }

    // Check if student is already on waitlist
    const existingWaitlist = await prisma.waitlist.findFirst({
      where: {
        studentId: dbCustomerId,
        classInstanceId: parseInt(classInstanceId),
        claimed: false
      }
    });

    if (existingWaitlist) {
      return res.status(400).json({
        error: 'You are already on the waitlist for this class',
        position: existingWaitlist.position
      });
    }

    // Get current max position for this class
    const maxPosition = await prisma.waitlist.findFirst({
      where: { classInstanceId: parseInt(classInstanceId) },
      orderBy: { position: 'desc' },
      select: { position: true }
    });

    const newPosition = maxPosition ? maxPosition.position + 1 : 1;

    // Add to waitlist
    const waitlistEntry = await prisma.waitlist.create({
      data: {
        studentId: dbCustomerId,
        classInstanceId: parseInt(classInstanceId),
        position: newPosition,
        joinedAt: new Date()
      }
    });

    res.json({
      success: true,
      waitlist: {
        id: waitlistEntry.id,
        position: waitlistEntry.position,
        joinedAt: waitlistEntry.joinedAt,
        message: `You are #${newPosition} on the waitlist`
      }
    });
  } catch (error) {
    console.error('Error joining waitlist:', error);
    res.status(500).json({ error: 'Failed to join waitlist' });
  }
});

// Leave waitlist
app.delete('/api/classes/waitlist/leave', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { classInstanceId } = req.body;

    if (!classInstanceId) {
      return res.status(400).json({ error: 'Class instance ID required' });
    }

    // Find waitlist entry
    const waitlistEntry = await prisma.waitlist.findFirst({
      where: {
        studentId: dbCustomerId,
        classInstanceId: parseInt(classInstanceId),
        claimed: false
      }
    });

    if (!waitlistEntry) {
      return res.status(404).json({ error: 'You are not on the waitlist for this class' });
    }

    const removedPosition = waitlistEntry.position;

    // Delete the entry
    await prisma.waitlist.delete({
      where: { id: waitlistEntry.id }
    });

    // Update positions for everyone after this person
    await prisma.$executeRaw`
      UPDATE "Waitlist"
      SET position = position - 1
      WHERE "classInstanceId" = ${parseInt(classInstanceId)}
        AND position > ${removedPosition}
        AND claimed = false
    `;

    res.json({ success: true, message: 'Removed from waitlist' });
  } catch (error) {
    console.error('Error leaving waitlist:', error);
    res.status(500).json({ error: 'Failed to leave waitlist' });
  }
});

// Get student's waitlist entries
app.get('/api/classes/waitlist/my-entries', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    const waitlistEntries = await prisma.waitlist.findMany({
      where: {
        studentId: dbCustomerId,
        claimed: false
      },
      include: {
        classInstance: true
      },
      orderBy: { joinedAt: 'desc' }
    });

    const formattedEntries = waitlistEntries.map(entry => ({
      id: entry.id,
      position: entry.position,
      joinedAt: entry.joinedAt,
      spotOfferedAt: entry.spotOfferedAt,
      expiresAt: entry.expiresAt,
      class: {
        id: entry.classInstance.id,
        classDate: entry.classInstance.classDate,
        startTime: entry.classInstance.startTime,
        endTime: entry.classInstance.endTime,
        classType: entry.classInstance.classType,
        instructor: entry.classInstance.instructor
      }
    }));

    res.json({ waitlistEntries: formattedEntries });
  } catch (error) {
    console.error('Error fetching waitlist entries:', error);
    res.status(500).json({ error: 'Failed to fetch waitlist entries' });
  }
});

// Get waitlist for a specific class (admin)
app.get('/api/classes/:classInstanceId/waitlist', authenticateToken, async (req, res) => {
  try {
    const { classInstanceId } = req.params;

    const waitlistEntries = await prisma.waitlist.findMany({
      where: {
        classInstanceId: parseInt(classInstanceId),
        claimed: false
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      orderBy: { position: 'asc' }
    });

    const formattedEntries = waitlistEntries.map(entry => ({
      id: entry.id,
      position: entry.position,
      joinedAt: entry.joinedAt,
      spotOfferedAt: entry.spotOfferedAt,
      expiresAt: entry.expiresAt,
      student: {
        id: entry.student.id,
        name: `${entry.student.firstName || ''} ${entry.student.lastName || ''}`.trim(),
        email: entry.student.email
      }
    }));

    res.json({ waitlist: formattedEntries });
  } catch (error) {
    console.error('Error fetching waitlist:', error);
    res.status(500).json({ error: 'Failed to fetch waitlist' });
  }
});

// Offer spot to next person on waitlist (admin)
app.post('/api/classes/:classInstanceId/waitlist/offer-next', authenticateToken, async (req, res) => {
  try {
    const { classInstanceId } = req.params;

    // Get next person on waitlist (position 1, not claimed, no active offer)
    const nextInLine = await prisma.waitlist.findFirst({
      where: {
        classInstanceId: parseInt(classInstanceId),
        claimed: false,
        spotOfferedAt: null
      },
      orderBy: { position: 'asc' },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        },
        classInstance: true
      }
    });

    if (!nextInLine) {
      return res.status(404).json({ error: 'No one on waitlist' });
    }

    // Check if class has space
    if (nextInLine.classInstance.currentEnrollment >= nextInLine.classInstance.maxCapacity) {
      return res.status(400).json({ error: 'Class is full' });
    }

    // Offer spot - expires in 24 hours
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const updatedWaitlist = await prisma.waitlist.update({
      where: { id: nextInLine.id },
      data: {
        spotOfferedAt: now,
        notificationSentAt: now,
        expiresAt: expiresAt
      }
    });

    // TODO: Send notification email to student
    console.log(`Spot offered to ${nextInLine.student.email} for class on ${nextInLine.classInstance.classDate}`);
    console.log(`Offer expires at: ${expiresAt}`);

    res.json({
      success: true,
      waitlistEntry: {
        id: updatedWaitlist.id,
        position: updatedWaitlist.position,
        studentName: `${nextInLine.student.firstName} ${nextInLine.student.lastName}`,
        studentEmail: nextInLine.student.email,
        spotOfferedAt: updatedWaitlist.spotOfferedAt,
        expiresAt: updatedWaitlist.expiresAt
      },
      message: 'Spot offered successfully'
    });
  } catch (error) {
    console.error('Error offering spot:', error);
    res.status(500).json({ error: 'Failed to offer spot' });
  }
});

// Claim waitlist spot (when spot becomes available)
app.post('/api/classes/waitlist/claim', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { waitlistId } = req.body;

    if (!waitlistId) {
      return res.status(400).json({ error: 'Waitlist ID required' });
    }

    // Find waitlist entry
    const waitlistEntry = await prisma.waitlist.findUnique({
      where: { id: parseInt(waitlistId) },
      include: { classInstance: true }
    });

    if (!waitlistEntry) {
      return res.status(404).json({ error: 'Waitlist entry not found' });
    }

    if (waitlistEntry.studentId !== dbCustomerId) {
      return res.status(403).json({ error: 'This waitlist entry does not belong to you' });
    }

    if (waitlistEntry.claimed) {
      return res.status(400).json({ error: 'This spot has already been claimed' });
    }

    if (!waitlistEntry.spotOfferedAt) {
      return res.status(400).json({ error: 'No spot has been offered yet' });
    }

    // Check if offer has expired
    if (waitlistEntry.expiresAt && new Date() > waitlistEntry.expiresAt) {
      return res.status(400).json({ error: 'This offer has expired' });
    }

    // Check if class is still available
    if (waitlistEntry.classInstance.currentEnrollment >= waitlistEntry.classInstance.maxCapacity) {
      return res.status(400).json({ error: 'Class is now full' });
    }

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        studentId: dbCustomerId,
        classInstanceId: waitlistEntry.classInstanceId,
        status: 'booked'
      }
    });

    // Mark waitlist as claimed
    await prisma.waitlist.update({
      where: { id: waitlistEntry.id },
      data: {
        claimed: true,
        claimedAt: new Date()
      }
    });

    // Increment class enrollment
    await prisma.classInstance.update({
      where: { id: waitlistEntry.classInstanceId },
      data: {
        currentEnrollment: {
          increment: 1
        }
      }
    });

    res.json({
      success: true,
      booking: {
        id: booking.id,
        classInstanceId: booking.classInstanceId,
        status: booking.status
      },
      message: 'Successfully claimed your spot!'
    });
  } catch (error) {
    console.error('Error claiming waitlist spot:', error);
    res.status(500).json({ error: 'Failed to claim waitlist spot' });
  }
});

// Process expired waitlist offers (background job endpoint)
app.post('/api/classes/waitlist/process-expired', async (req, res) => {
  try {
    // Find all expired offers that haven't been claimed
    const expiredOffers = await prisma.waitlist.findMany({
      where: {
        claimed: false,
        spotOfferedAt: { not: null },
        expiresAt: { lte: new Date() }
      },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        },
        classInstance: true
      }
    });

    const processedEntries = [];

    for (const entry of expiredOffers) {
      // Reset the offer
      await prisma.waitlist.update({
        where: { id: entry.id },
        data: {
          spotOfferedAt: null,
          notificationSentAt: null,
          expiresAt: null
        }
      });

      console.log(`Expired offer for ${entry.student.email} - class on ${entry.classInstance.classDate}`);
      processedEntries.push({
        studentEmail: entry.student.email,
        classDate: entry.classInstance.classDate,
        position: entry.position
      });

      // TODO: Send notification that offer expired
      // TODO: Automatically offer to next person in line
    }

    res.json({
      success: true,
      processedCount: processedEntries.length,
      entries: processedEntries
    });
  } catch (error) {
    console.error('Error processing expired offers:', error);
    res.status(500).json({ error: 'Failed to process expired offers' });
  }
});

// ============================================
// CALENDAR INTEGRATION (Phase 3.6)
// ============================================

// Download .ics file for a single booking
app.get('/api/classes/bookings/:bookingId/calendar', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { dbCustomerId } = req.user;

    // Find booking with class details
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(bookingId) },
      include: { classInstance: true }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.studentId !== dbCustomerId) {
      return res.status(403).json({ error: 'This booking does not belong to you' });
    }

    // Generate .ics file
    const icsContent = generateICS(booking, booking.classInstance, req.user);

    // Set headers for file download
    const filename = `ves-pottery-class-${booking.id}.ics`;
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(icsContent);
  } catch (error) {
    console.error('Error generating calendar file:', error);
    res.status(500).json({ error: 'Failed to generate calendar file' });
  }
});

// Download .ics file for all student bookings
app.get('/api/classes/my-bookings/calendar', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    // Get all future bookings
    const bookings = await prisma.booking.findMany({
      where: {
        studentId: dbCustomerId,
        status: 'booked',
        classInstance: {
          classDate: { gte: new Date() }
        }
      },
      include: { classInstance: true }
    });

    if (bookings.length === 0) {
      return res.status(404).json({ error: 'No upcoming bookings found' });
    }

    // Format for calendar generator
    const bookingsWithClasses = bookings.map(booking => ({
      booking,
      classInstance: booking.classInstance
    }));

    // Generate .ics file with all bookings
    const icsContent = generateMultipleICS(bookingsWithClasses, req.user);

    // Set headers for file download
    const filename = `ves-pottery-classes-all.ics`;
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(icsContent);
  } catch (error) {
    console.error('Error generating calendar file:', error);
    res.status(500).json({ error: 'Failed to generate calendar file' });
  }
});

// ============================================
// UTILITY ENDPOINTS
// ============================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'VES Pottery Gallery API'
  });
});

// Serve static frontend
app.use(express.static('public'));

// Catch-all route for SPA
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile('index.html', { root: 'public' });
  }
});

const server = app.listen(PORT, async () => {
  console.log(`🎨 VES Pottery Gallery API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Auth endpoints: /api/auth/*`);
  console.log(`🏺 Gallery endpoints: /api/pottery/*`);
  console.log(`📤 Upload endpoints: /api/upload/*`);
  console.log(`🗄️  PostgreSQL database connected`);

  // Ensure Supabase storage bucket exists
  await ensureBucketExists();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    console.log('HTTP server closed');
    await prisma.$disconnect();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT signal received: closing HTTP server');
  server.close(async () => {
    console.log('HTTP server closed');
    await prisma.$disconnect();
    process.exit(0);
  });
});
