require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');
const { syncCustomer } = require('./utils/shopifySync');
const { upload, uploadImageToSupabase, deleteImageFromSupabase, ensureBucketExists } = require('./utils/imageUpload');
const { generateICS, generateMultipleICS } = require('./utils/calendarGenerator');
const supabaseDb = require('./utils/supabaseDb');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5175',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5175'
  ],
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

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

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

    // Sync customer to PostgreSQL via Supabase
    const dbCustomer = await syncCustomer(customer, customerId);

    // Create JWT token
    const token = jwt.sign(
      {
        customerId: customerId,
        dbCustomerId: dbCustomer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

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

app.post('/api/auth/register', async (req, res) => {
  return res.status(403).json({
    error: 'Registration is disabled. Please contact VES staff to be added as a customer.'
  });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// ============================================
// IMAGE UPLOAD ENDPOINTS
// ============================================

app.post('/api/upload/image', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { dbCustomerId } = req.user;

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

app.post('/api/upload/images', authenticateToken, upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No image files provided' });
    }

    const { dbCustomerId } = req.user;
    const uploadedImages = [];

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

app.post('/api/pottery/create-piece', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const pieceData = req.body;

    const newPiece = await supabaseDb.createPotteryPiece({
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
    });

    res.json({ success: true, piece: newPiece });
  } catch (error) {
    console.error('Error creating pottery piece:', error);
    res.status(500).json({ error: 'Failed to create pottery piece' });
  }
});

app.get('/api/pottery/pieces', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    const pieces = await supabaseDb.getPotteryPiecesByCustomerId(dbCustomerId);

    const formattedPieces = pieces.map(piece => ({
      id: piece.id.toString(),
      title: piece.title,
      description: piece.notes,
      clay_type: piece.clay_type,
      glaze: piece.glazes[0] || '',
      glazes: piece.glazes,
      original_weight: piece.original_weight?.toString(),
      final_weight: piece.final_weight?.toString(),
      height: piece.height?.toString(),
      length: piece.length?.toString(),
      width: piece.width?.toString(),
      dimensions: piece.height && piece.width && piece.length
        ? `${piece.height}" H x ${piece.width}" W x ${piece.length}" L`
        : '',
      date_completed: new Date(piece.date_completed).toISOString().split('T')[0],
      images: piece.images,
      tags: piece.tags,
      is_public: piece.is_public,
      featured: piece.featured
    }));

    res.json({ pieces: formattedPieces });
  } catch (error) {
    console.error('Error fetching pottery pieces:', error);
    res.status(500).json({ error: 'Failed to fetch pottery pieces' });
  }
});

app.get('/api/pottery/public', async (req, res) => {
  try {
    const pieces = await supabaseDb.getPublicPotteryPieces();

    const formattedPieces = pieces.map(piece => ({
      id: piece.id.toString(),
      title: piece.title,
      description: piece.notes,
      clay_type: piece.clay_type,
      glazes: piece.glazes,
      height: piece.height?.toString(),
      length: piece.length?.toString(),
      width: piece.width?.toString(),
      date_completed: new Date(piece.date_completed).toISOString().split('T')[0],
      images: piece.images,
      tags: piece.tags,
      featured: piece.featured,
      artist: piece.customer?.first_name
        ? `${piece.customer.first_name} ${piece.customer.last_name || ''}`.trim()
        : 'VES Student'
    }));

    res.json({ pieces: formattedPieces });
  } catch (error) {
    console.error('Error fetching public pottery pieces:', error);
    res.status(500).json({ error: 'Failed to fetch public pottery pieces' });
  }
});

app.put('/api/pottery/pieces/:id', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { id } = req.params;
    const pieceData = req.body;

    // Verify ownership
    const existingPiece = await supabaseDb.getPotteryPiecesByCustomerId(dbCustomerId);
    const ownsPiece = existingPiece.some(piece => piece.id === parseInt(id));

    if (!ownsPiece) {
      return res.status(403).json({ error: 'You do not have permission to update this piece' });
    }

    const updatedPiece = await supabaseDb.updatePotteryPiece(parseInt(id), {
      title: pieceData.title,
      dateCompleted: pieceData.date_completed ? new Date(pieceData.date_completed) : undefined,
      notes: pieceData.description,
      clayType: pieceData.clay_type,
      glazes: pieceData.glazes,
      height: pieceData.height ? parseFloat(pieceData.height) : null,
      width: pieceData.width ? parseFloat(pieceData.width) : null,
      length: pieceData.length ? parseFloat(pieceData.length) : null,
      images: pieceData.images,
      tags: pieceData.tags,
      isPublic: pieceData.is_public
    });

    res.json({ success: true, piece: updatedPiece });
  } catch (error) {
    console.error('Error updating pottery piece:', error);
    res.status(500).json({ error: 'Failed to update pottery piece' });
  }
});

app.delete('/api/pottery/pieces/:id', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { id } = req.params;

    // Verify ownership
    const existingPieces = await supabaseDb.getPotteryPiecesByCustomerId(dbCustomerId);
    const piece = existingPieces.find(piece => piece.id === parseInt(id));

    if (!piece) {
      return res.status(403).json({ error: 'You do not have permission to delete this piece' });
    }

    await supabaseDb.deletePotteryPiece(parseInt(id));

    res.json({ success: true, message: 'Pottery piece deleted successfully' });
  } catch (error) {
    console.error('Error deleting pottery piece:', error);
    res.status(500).json({ error: 'Failed to delete pottery piece' });
  }
});

// ============================================
// REFERENCE DATA ENDPOINTS
// ============================================

app.get('/api/reference/clay-types', authenticateToken, async (req, res) => {
  try {
    const clayTypes = await supabaseDb.getClayTypes();
    res.json({ clayTypes });
  } catch (error) {
    console.error('Error fetching clay types:', error);
    res.status(500).json({ error: 'Failed to fetch clay types' });
  }
});

app.get('/api/reference/glazes', authenticateToken, async (req, res) => {
  try {
    const glazes = await supabaseDb.getGlazes();
    res.json({ glazes });
  } catch (error) {
    console.error('Error fetching glazes:', error);
    res.status(500).json({ error: 'Failed to fetch glazes' });
  }
});

// ============================================
// CLASS SCHEDULING ENDPOINTS
// ============================================

app.get('/api/classes/available', async (req, res) => {
  try {
    const classes = await supabaseDb.getAvailableClasses();
    console.log(`✅ Successfully fetched and processed ${classes.length} classes with waitlist and makeup counts`);
    res.json({ classes });
  } catch (error) {
    console.error('❌ Error fetching available classes:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

app.get('/api/classes/my-bookings', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    const bookings = await supabaseDb.getStudentBookings(dbCustomerId);

    const formattedBookings = bookings.map(booking => ({
      id: booking.id,
      status: booking.status,
      advanceNoticeGiven: booking.advance_notice_given,
      attended: booking.attended,
      attendanceNotes: booking.attendance_notes,
      class: {
        id: booking.class_instance.id,
        classDate: booking.class_instance.class_date,
        startTime: booking.class_instance.start_time,
        endTime: booking.class_instance.end_time,
        classType: booking.class_instance.class_type,
        instructor: booking.class_instance.instructor,
        room: booking.class_instance.room
      }
    }));

    res.json({ bookings: formattedBookings });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

app.post('/api/classes/book', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { classInstanceId } = req.body;

    if (!classInstanceId) {
      return res.status(400).json({ error: 'Class instance ID required' });
    }

    const classInstance = await supabaseDb.getClassInstanceById(parseInt(classInstanceId));

    if (!classInstance) {
      return res.status(404).json({ error: 'Class not found' });
    }

    if (classInstance.current_enrollment >= classInstance.max_capacity) {
      return res.status(400).json({ error: 'Class is full. Please join the waitlist.' });
    }

    const existingBooking = await supabaseDb.findBooking(dbCustomerId, parseInt(classInstanceId), 'booked');

    if (existingBooking) {
      return res.status(400).json({ error: 'You are already booked for this class' });
    }

    const booking = await supabaseDb.createBooking({
      studentId: dbCustomerId,
      classInstanceId: parseInt(classInstanceId),
      status: 'booked'
    });

    await supabaseDb.updateClassEnrollment(parseInt(classInstanceId), 1);

    res.json({
      success: true,
      booking: {
        id: booking.id,
        classInstanceId: booking.class_instance_id,
        status: booking.status
      },
      message: 'Class booked successfully!'
    });
  } catch (error) {
    console.error('Error booking class:', error);
    res.status(500).json({ error: 'Failed to book class' });
  }
});

// NEW: Enroll in course (4-week, 6-week, or 8-week)
app.post('/api/classes/enroll-course', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { firstClassId, courseWeeks } = req.body; // courseWeeks: 4, 6, or 8

    if (!firstClassId) {
      return res.status(400).json({ error: 'First class ID required' });
    }

    if (!courseWeeks || ![4, 6, 8].includes(courseWeeks)) {
      return res.status(400).json({ error: 'Course weeks must be 4, 6, or 8' });
    }

    // Get the first class to determine the schedule
    const firstClass = await supabaseDb.getClassInstanceById(parseInt(firstClassId));

    if (!firstClass) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Extract schedule info (time, day, instructor)
    const scheduleKey = `${firstClass.start_time}_${firstClass.instructor}`;

    // Get all classes with same schedule (same time + instructor)
    const allClasses = await supabaseDb.getAvailableClasses();
    const courseClasses = allClasses
      .filter(c =>
        c.startTime === firstClass.start_time &&
        c.instructor === firstClass.instructor &&
        new Date(c.classDate) >= new Date(firstClass.class_date)
      )
      .sort((a, b) => new Date(a.classDate) - new Date(b.classDate))
      .slice(0, courseWeeks); // Take only the number of weeks requested

    if (courseClasses.length !== courseWeeks) {
      return res.status(400).json({
        error: `Full ${courseWeeks}-week course not available for this schedule. Only ${courseClasses.length} classes available.`
      });
    }

    // Check if student already enrolled in any of these classes
    for (const cls of courseClasses) {
      const existing = await supabaseDb.findBooking(dbCustomerId, cls.id, 'booked');
      if (existing) {
        return res.status(400).json({ error: 'You are already enrolled in this course' });
      }
    }

    // Check capacity for all weeks
    for (const cls of courseClasses) {
      if (cls.currentEnrollment >= 8) { // Regular capacity is 8
        const weekNum = courseClasses.indexOf(cls) + 1;
        return res.status(400).json({
          error: `Week ${weekNum} is full. Cannot enroll in course.`
        });
      }
    }

    // Create course enrollment ID to group all weeks
    const courseEnrollmentId = `${dbCustomerId}_${scheduleKey}_${Date.now()}`;

    // Book all weeks
    const bookings = [];
    for (const cls of courseClasses) {
      const booking = await supabaseDb.createBooking({
        studentId: dbCustomerId,
        classInstanceId: cls.id,
        status: 'booked',
        courseEnrollmentId: courseEnrollmentId
      });

      await supabaseDb.updateClassEnrollment(cls.id, 1);
      bookings.push(booking);
    }

    res.json({
      success: true,
      courseEnrollmentId,
      bookings: bookings.map(b => ({
        id: b.id,
        classInstanceId: b.class_instance_id
      })),
      message: `Successfully enrolled in ${courseWeeks}-week course with ${firstClass.instructor}!`
    });

  } catch (error) {
    console.error('Error enrolling in course:', error);
    res.status(500).json({ error: 'Failed to enroll in course' });
  }
});

app.post('/api/classes/cancel', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { bookingId, advanceNotice } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: 'Booking ID required' });
    }

    const booking = await supabaseDb.getBookingById(parseInt(bookingId));

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.student_id !== dbCustomerId) {
      return res.status(403).json({ error: 'This booking does not belong to you' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Booking already cancelled' });
    }

    await supabaseDb.updateBooking(parseInt(bookingId), {
      status: 'cancelled',
      advanceNoticeGiven: advanceNotice || false
    });

    await supabaseDb.updateClassEnrollment(booking.class_instance_id, -1);

    res.json({
      success: true,
      message: 'Booking cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

// NEW: Reschedule to a make-up class
app.post('/api/classes/reschedule', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { oldClassId, newClassId } = req.body;

    if (!oldClassId || !newClassId) {
      return res.status(400).json({ error: 'Both old and new class IDs required' });
    }

    // Get the current booking
    const currentBooking = await supabaseDb.findBooking(dbCustomerId, parseInt(oldClassId), 'booked');

    if (!currentBooking) {
      return res.status(404).json({ error: 'You are not enrolled in the original class' });
    }

    // Get the old and new class instances
    const oldClass = await supabaseDb.getClassInstanceById(parseInt(oldClassId));
    const newClass = await supabaseDb.getClassInstanceById(parseInt(newClassId));

    if (!oldClass || !newClass) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Check if the class is in the past
    if (new Date(oldClass.class_date) < new Date()) {
      return res.status(400).json({ error: 'Cannot reschedule past classes' });
    }

    // Check if new class has availability (total capacity is 10)
    if (newClass.current_enrollment >= newClass.max_capacity) {
      return res.status(400).json({ error: 'This class is completely full' });
    }

    // Check if student already enrolled in new class
    const existingBooking = await supabaseDb.findBooking(dbCustomerId, parseInt(newClassId), 'booked');
    if (existingBooking) {
      return res.status(400).json({ error: 'You are already enrolled in this class' });
    }

    // Cancel old booking
    await supabaseDb.updateBooking(currentBooking.id, {
      status: 'cancelled',
      advanceNoticeGiven: true
    });
    await supabaseDb.updateClassEnrollment(parseInt(oldClassId), -1);

    // Create new make-up booking
    const newBooking = await supabaseDb.createBooking({
      studentId: dbCustomerId,
      classInstanceId: parseInt(newClassId),
      status: 'booked',
      bookingType: 'makeup',
      courseEnrollmentId: currentBooking.course_enrollment_id // Keep same course enrollment ID
    });

    await supabaseDb.updateClassEnrollment(parseInt(newClassId), 1);

    res.json({
      success: true,
      booking: {
        id: newBooking.id,
        classInstanceId: newBooking.class_instance_id
      },
      message: 'Class rescheduled successfully!'
    });

  } catch (error) {
    console.error('Error rescheduling class:', error);
    res.status(500).json({ error: 'Failed to reschedule class' });
  }
});

// ============================================
// ATTENDANCE & NO-SHOW ENDPOINTS
// ============================================

app.get('/api/classes/:classInstanceId/bookings', authenticateToken, async (req, res) => {
  try {
    const { classInstanceId } = req.params;
    const bookings = await supabaseDb.getClassBookings(parseInt(classInstanceId));
    res.json({ bookings });
  } catch (error) {
    console.error('Error fetching class bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

app.post('/api/classes/bookings/:bookingId/mark-attendance', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { attended, notes } = req.body;
    const { dbCustomerId } = req.user;

    if (typeof attended !== 'boolean') {
      return res.status(400).json({ error: 'Attended status required (true/false)' });
    }

    const booking = await supabaseDb.getBookingById(parseInt(bookingId));

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    let newStatus = booking.status;
    let incrementForfeit = false;

    if (!attended) {
      if (booking.advance_notice_given) {
        newStatus = 'completed';
      } else {
        newStatus = 'forfeited';
        incrementForfeit = true;
      }
    } else {
      newStatus = 'completed';
    }

    const updatedBooking = await supabaseDb.updateBooking(parseInt(bookingId), {
      attended: attended,
      status: newStatus,
      markedByAdminId: dbCustomerId,
      attendanceMarkedAt: new Date().toISOString(),
      attendanceNotes: notes || null
    });

    if (incrementForfeit) {
      await supabaseDb.incrementClassesForfeited(booking.student.id);
    }

    res.json({
      success: true,
      booking: {
        id: updatedBooking.id,
        attended: updatedBooking.attended,
        status: updatedBooking.status,
        attendanceMarkedAt: updatedBooking.attendance_marked_at
      },
      message: attended ? 'Marked as attended' : (booking.advance_notice_given ? 'Marked as no-show with notice' : 'Marked as no-show without notice - class forfeited')
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ error: 'Failed to mark attendance' });
  }
});

app.get('/api/students/:studentId/attendance', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;

    const customer = await supabaseDb.getCustomerById(parseInt(studentId));

    if (!customer) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const bookings = await supabaseDb.getStudentAttendance(parseInt(studentId));

    const formattedBookings = bookings.map(booking => ({
      id: booking.id,
      status: booking.status,
      attended: booking.attended,
      advanceNoticeGiven: booking.advance_notice_given,
      attendanceMarkedAt: booking.attendance_marked_at,
      attendanceNotes: booking.attendance_notes,
      class: {
        classDate: booking.class_instance.class_date,
        startTime: booking.class_instance.start_time,
        endTime: booking.class_instance.end_time,
        classType: booking.class_instance.class_type,
        instructor: booking.class_instance.instructor
      }
    }));

    const attendanceStats = {
      totalClasses: bookings.length,
      attended: bookings.filter(b => b.attended === true).length,
      noShowWithNotice: bookings.filter(b => b.attended === false && b.advance_notice_given === true).length,
      forfeited: bookings.filter(b => b.status === 'forfeited').length
    };

    res.json({
      student: {
        id: customer.id,
        name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
        email: customer.email,
        classesForfeited: customer.classes_forfeited || 0
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
// WAITLIST ENDPOINTS
// ============================================

app.post('/api/classes/waitlist/join', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { classInstanceId } = req.body;

    if (!classInstanceId) {
      return res.status(400).json({ error: 'Class instance ID required' });
    }

    const classInstance = await supabaseDb.getClassInstanceById(parseInt(classInstanceId));

    if (!classInstance) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const existingBooking = await supabaseDb.findBooking(dbCustomerId, parseInt(classInstanceId), 'booked');

    if (existingBooking) {
      return res.status(400).json({ error: 'You are already booked for this class' });
    }

    const existingWaitlist = await supabaseDb.findWaitlistEntry(dbCustomerId, parseInt(classInstanceId));

    if (existingWaitlist) {
      return res.status(400).json({
        error: 'You are already on the waitlist for this class',
        position: existingWaitlist.position
      });
    }

    const maxPosition = await supabaseDb.getMaxWaitlistPosition(parseInt(classInstanceId));
    const newPosition = maxPosition + 1;

    const waitlistEntry = await supabaseDb.createWaitlistEntry({
      studentId: dbCustomerId,
      classInstanceId: parseInt(classInstanceId),
      position: newPosition
    });

    res.json({
      success: true,
      waitlist: {
        id: waitlistEntry.id,
        position: waitlistEntry.position,
        joinedAt: waitlistEntry.joined_at,
        message: `You are #${newPosition} on the waitlist`
      }
    });
  } catch (error) {
    console.error('Error joining waitlist:', error);
    res.status(500).json({ error: 'Failed to join waitlist' });
  }
});

app.delete('/api/classes/waitlist/leave', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { classInstanceId } = req.body;

    if (!classInstanceId) {
      return res.status(400).json({ error: 'Class instance ID required' });
    }

    const waitlistEntry = await supabaseDb.findWaitlistEntry(dbCustomerId, parseInt(classInstanceId));

    if (!waitlistEntry) {
      return res.status(404).json({ error: 'You are not on the waitlist for this class' });
    }

    const removedPosition = waitlistEntry.position;

    await supabaseDb.deleteWaitlistEntry(waitlistEntry.id);
    await supabaseDb.updateWaitlistPositions(parseInt(classInstanceId), removedPosition);

    res.json({ success: true, message: 'Removed from waitlist' });
  } catch (error) {
    console.error('Error leaving waitlist:', error);
    res.status(500).json({ error: 'Failed to leave waitlist' });
  }
});

app.get('/api/classes/waitlist/my-entries', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    const waitlistEntries = await supabaseDb.getStudentWaitlistEntries(dbCustomerId);

    const formattedEntries = waitlistEntries.map(entry => ({
      id: entry.id,
      position: entry.position,
      joinedAt: entry.joined_at,
      spotOfferedAt: entry.spot_offered_at,
      expiresAt: entry.expires_at,
      class: {
        id: entry.class_instance.id,
        classDate: entry.class_instance.class_date,
        startTime: entry.class_instance.start_time,
        endTime: entry.class_instance.end_time,
        classType: entry.class_instance.class_type,
        instructor: entry.class_instance.instructor
      }
    }));

    res.json({ waitlistEntries: formattedEntries });
  } catch (error) {
    console.error('Error fetching waitlist entries:', error);
    res.status(500).json({ error: 'Failed to fetch waitlist entries' });
  }
});

app.get('/api/classes/:classInstanceId/waitlist', authenticateToken, async (req, res) => {
  try {
    const { classInstanceId } = req.params;
    const waitlist = await supabaseDb.getClassWaitlist(parseInt(classInstanceId));
    res.json({ waitlist });
  } catch (error) {
    console.error('Error fetching waitlist:', error);
    res.status(500).json({ error: 'Failed to fetch waitlist' });
  }
});

app.post('/api/classes/:classInstanceId/waitlist/offer-next', authenticateToken, async (req, res) => {
  try {
    const { classInstanceId } = req.params;

    const nextInLine = await supabaseDb.getNextInWaitlist(parseInt(classInstanceId));

    if (!nextInLine) {
      return res.status(404).json({ error: 'No one on waitlist' });
    }

    if (nextInLine.class_instance.current_enrollment >= nextInLine.class_instance.max_capacity) {
      return res.status(400).json({ error: 'Class is full' });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const updatedWaitlist = await supabaseDb.updateWaitlistEntry(nextInLine.id, {
      spotOfferedAt: now.toISOString(),
      notificationSentAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    });

    console.log(`Spot offered to ${nextInLine.student.email} for class on ${nextInLine.class_instance.class_date}`);
    console.log(`Offer expires at: ${expiresAt}`);

    res.json({
      success: true,
      waitlistEntry: {
        id: updatedWaitlist.id,
        position: updatedWaitlist.position,
        studentName: `${nextInLine.student.first_name} ${nextInLine.student.last_name}`,
        studentEmail: nextInLine.student.email,
        spotOfferedAt: updatedWaitlist.spot_offered_at,
        expiresAt: updatedWaitlist.expires_at
      },
      message: 'Spot offered successfully'
    });
  } catch (error) {
    console.error('Error offering spot:', error);
    res.status(500).json({ error: 'Failed to offer spot' });
  }
});

app.post('/api/classes/waitlist/claim', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { waitlistId } = req.body;

    if (!waitlistId) {
      return res.status(400).json({ error: 'Waitlist ID required' });
    }

    const waitlistEntry = await supabaseDb.getWaitlistEntryById(parseInt(waitlistId));

    if (!waitlistEntry) {
      return res.status(404).json({ error: 'Waitlist entry not found' });
    }

    if (waitlistEntry.student_id !== dbCustomerId) {
      return res.status(403).json({ error: 'This waitlist entry does not belong to you' });
    }

    if (waitlistEntry.claimed) {
      return res.status(400).json({ error: 'This spot has already been claimed' });
    }

    if (!waitlistEntry.spot_offered_at) {
      return res.status(400).json({ error: 'No spot has been offered yet' });
    }

    if (waitlistEntry.expires_at && new Date() > new Date(waitlistEntry.expires_at)) {
      return res.status(400).json({ error: 'This offer has expired' });
    }

    if (waitlistEntry.class_instance.current_enrollment >= waitlistEntry.class_instance.max_capacity) {
      return res.status(400).json({ error: 'Class is now full' });
    }

    const booking = await supabaseDb.createBooking({
      studentId: dbCustomerId,
      classInstanceId: waitlistEntry.class_instance_id,
      status: 'booked'
    });

    await supabaseDb.updateWaitlistEntry(waitlistEntry.id, {
      claimed: true,
      claimedAt: new Date().toISOString()
    });

    await supabaseDb.updateClassEnrollment(waitlistEntry.class_instance_id, 1);

    res.json({
      success: true,
      booking: {
        id: booking.id,
        classInstanceId: booking.class_instance_id,
        status: booking.status
      },
      message: 'Successfully claimed your spot!'
    });
  } catch (error) {
    console.error('Error claiming waitlist spot:', error);
    res.status(500).json({ error: 'Failed to claim waitlist spot' });
  }
});

app.post('/api/classes/waitlist/process-expired', async (req, res) => {
  try {
    const expiredOffers = await supabaseDb.getExpiredWaitlistOffers();

    const processedEntries = [];

    for (const entry of expiredOffers) {
      await supabaseDb.updateWaitlistEntry(entry.id, {
        spotOfferedAt: null,
        notificationSentAt: null,
        expiresAt: null
      });

      console.log(`Expired offer for ${entry.student.email} - class on ${entry.class_instance.class_date}`);
      processedEntries.push({
        studentEmail: entry.student.email,
        classDate: entry.class_instance.class_date,
        position: entry.position
      });
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
// ADMIN ENDPOINTS
// ============================================

app.get('/api/admin/customers', authenticateToken, async (req, res) => {
  try {
    const customers = await supabaseDb.getAllCustomers();

    const formattedCustomers = customers.map(customer => ({
      id: customer.shopify_customer_id,
      dbId: customer.id,
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name
    }));

    res.json({ customers: formattedCustomers });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

app.get('/api/admin/customers/:customerId/pieces', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;

    const customer = await supabaseDb.findCustomerByShopifyId(customerId);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const pieces = await supabaseDb.getPotteryPiecesByCustomerId(customer.id);

    const formattedPieces = pieces.map(piece => ({
      id: piece.id.toString(),
      title: piece.title,
      description: piece.notes,
      clay_type: piece.clay_type,
      glaze: piece.glazes[0] || '',
      glazes: piece.glazes,
      firing_temp: '',
      dimensions: piece.height && piece.width && piece.length
        ? `${piece.height}" H x ${piece.width}" W x ${piece.length}" L`
        : '',
      date_completed: new Date(piece.date_completed).toISOString().split('T')[0],
      images: piece.images,
      tags: piece.tags,
      student_notes: piece.notes,
      instructor_notes: '',
      is_public: piece.is_public
    }));

    res.json({ pieces: formattedPieces });
  } catch (error) {
    console.error('Error fetching customer pieces:', error);
    res.status(500).json({ error: 'Failed to fetch pieces' });
  }
});

// Update customer (student) info
app.put('/api/admin/customers/:customerId', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    const updateData = req.body;

    const updatedCustomer = await supabaseDb.updateCustomer(parseInt(customerId), {
      firstName: updateData.first_name,
      lastName: updateData.last_name,
      email: updateData.email,
      customerType: updateData.customer_type,
      classesAllocated: updateData.classes_allocated,
      classesUsed: updateData.classes_used
    });

    res.json({
      success: true,
      customer: {
        id: updatedCustomer.id,
        firstName: updatedCustomer.first_name,
        lastName: updatedCustomer.last_name,
        email: updatedCustomer.email,
        customerType: updatedCustomer.customer_type
      }
    });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// Get all pottery pieces for admin gallery view
app.get('/api/admin/pottery/all', authenticateToken, async (req, res) => {
  try {
    const allPieces = await supabaseDb.getAllPotteryPieces();

    const formattedPieces = allPieces.map(piece => ({
      id: piece.id.toString(),
      title: piece.title,
      description: piece.notes,
      clay_type: piece.clay_type,
      glazes: piece.glazes,
      height: piece.height?.toString(),
      width: piece.width?.toString(),
      length: piece.length?.toString(),
      date_completed: new Date(piece.date_completed).toISOString().split('T')[0],
      images: piece.images,
      tags: piece.tags,
      is_public: piece.is_public,
      featured: piece.featured,
      studentId: piece.customer_id,
      studentName: piece.customer
        ? `${piece.customer.first_name} ${piece.customer.last_name}`.trim()
        : 'Unknown Student',
      studentEmail: piece.customer?.email || ''
    }));

    res.json({ pieces: formattedPieces });
  } catch (error) {
    console.error('Error fetching all pottery pieces:', error);
    res.status(500).json({ error: 'Failed to fetch pottery pieces' });
  }
});

// Toggle piece public status
app.put('/api/admin/pottery/:id/toggle-public', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const piece = await supabaseDb.getPotteryPieceById(parseInt(id));

    if (!piece) {
      return res.status(404).json({ error: 'Pottery piece not found' });
    }

    const updatedPiece = await supabaseDb.updatePotteryPiece(parseInt(id), {
      isPublic: !piece.is_public
    });

    res.json({
      success: true,
      isPublic: updatedPiece.is_public,
      message: `Piece ${updatedPiece.is_public ? 'published' : 'unpublished'}`
    });
  } catch (error) {
    console.error('Error toggling public status:', error);
    res.status(500).json({ error: 'Failed to toggle public status' });
  }
});

// Toggle piece featured status
app.put('/api/admin/pottery/:id/toggle-featured', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const piece = await supabaseDb.getPotteryPieceById(parseInt(id));

    if (!piece) {
      return res.status(404).json({ error: 'Pottery piece not found' });
    }

    const updatedPiece = await supabaseDb.updatePotteryPiece(parseInt(id), {
      featured: !piece.featured
    });

    res.json({
      success: true,
      featured: updatedPiece.featured,
      message: `Piece ${updatedPiece.featured ? 'featured' : 'unfeatured'}`
    });
  } catch (error) {
    console.error('Error toggling featured status:', error);
    res.status(500).json({ error: 'Failed to toggle featured status' });
  }
});

// Create clay type
app.post('/api/admin/clay-types', authenticateToken, async (req, res) => {
  try {
    const { name, description, active } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Clay type name is required' });
    }

    const clayType = await supabaseDb.createClayType({
      name,
      description: description || null,
      active: active !== undefined ? active : true
    });

    res.json({ success: true, clayType });
  } catch (error) {
    console.error('Error creating clay type:', error);
    res.status(500).json({ error: 'Failed to create clay type' });
  }
});

// Update clay type
app.put('/api/admin/clay-types/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, active } = req.body;

    const clayType = await supabaseDb.updateClayType(parseInt(id), {
      name,
      description,
      active
    });

    res.json({ success: true, clayType });
  } catch (error) {
    console.error('Error updating clay type:', error);
    res.status(500).json({ error: 'Failed to update clay type' });
  }
});

// Delete clay type
app.delete('/api/admin/clay-types/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await supabaseDb.deleteClayType(parseInt(id));
    res.json({ success: true, message: 'Clay type deleted' });
  } catch (error) {
    console.error('Error deleting clay type:', error);
    res.status(500).json({ error: 'Failed to delete clay type' });
  }
});

// Create glaze
app.post('/api/admin/glazes', authenticateToken, async (req, res) => {
  try {
    const { name, description, color, cone, active } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Glaze name is required' });
    }

    const glaze = await supabaseDb.createGlaze({
      name,
      description: description || null,
      color: color || null,
      cone: cone || null,
      active: active !== undefined ? active : true
    });

    res.json({ success: true, glaze });
  } catch (error) {
    console.error('Error creating glaze:', error);
    res.status(500).json({ error: 'Failed to create glaze' });
  }
});

// Update glaze
app.put('/api/admin/glazes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, cone, active } = req.body;

    const glaze = await supabaseDb.updateGlaze(parseInt(id), {
      name,
      description,
      color,
      cone,
      active
    });

    res.json({ success: true, glaze });
  } catch (error) {
    console.error('Error updating glaze:', error);
    res.status(500).json({ error: 'Failed to update glaze' });
  }
});

// Delete glaze
app.delete('/api/admin/glazes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await supabaseDb.deleteGlaze(parseInt(id));
    res.json({ success: true, message: 'Glaze deleted' });
  } catch (error) {
    console.error('Error deleting glaze:', error);
    res.status(500).json({ error: 'Failed to delete glaze' });
  }
});

// Get all memberships
app.get('/api/admin/memberships', authenticateToken, async (req, res) => {
  try {
    const memberships = await supabaseDb.getAllMemberships();

    const formattedMemberships = memberships.map(m => ({
      id: m.id,
      type: m.membership_type,
      status: m.status,
      startDate: m.start_date,
      endDate: m.end_date,
      perks: m.perks,
      studentId: m.customer_id,
      studentName: m.customer
        ? `${m.customer.first_name} ${m.customer.last_name}`.trim()
        : 'Unknown',
      studentEmail: m.customer?.email || ''
    }));

    res.json({ memberships: formattedMemberships });
  } catch (error) {
    console.error('Error fetching memberships:', error);
    res.status(500).json({ error: 'Failed to fetch memberships' });
  }
});

// Create membership
app.post('/api/admin/memberships', authenticateToken, async (req, res) => {
  try {
    const { customerId, membershipType, startDate, endDate, perks } = req.body;

    if (!customerId || !membershipType || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const membership = await supabaseDb.createMembership({
      customerId: parseInt(customerId),
      membershipType,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      perks: perks || {},
      status: 'active'
    });

    res.json({ success: true, membership });
  } catch (error) {
    console.error('Error creating membership:', error);
    res.status(500).json({ error: 'Failed to create membership' });
  }
});

// Update membership
app.put('/api/admin/memberships/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { membershipType, startDate, endDate, status, perks } = req.body;

    const membership = await supabaseDb.updateMembership(parseInt(id), {
      membershipType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status,
      perks
    });

    res.json({ success: true, membership });
  } catch (error) {
    console.error('Error updating membership:', error);
    res.status(500).json({ error: 'Failed to update membership' });
  }
});

// Delete membership
app.delete('/api/admin/memberships/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await supabaseDb.deleteMembership(parseInt(id));
    res.json({ success: true, message: 'Membership deleted' });
  } catch (error) {
    console.error('Error deleting membership:', error);
    res.status(500).json({ error: 'Failed to delete membership' });
  }
});

// ============================================
// CALENDAR INTEGRATION
// ============================================

app.get('/api/classes/bookings/:bookingId/calendar', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { dbCustomerId } = req.user;

    const booking = await supabaseDb.getBookingById(parseInt(bookingId));

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.student_id !== dbCustomerId) {
      return res.status(403).json({ error: 'This booking does not belong to you' });
    }

    const classInstance = await supabaseDb.getClassInstanceById(booking.class_instance_id);

    // Convert to format expected by generateICS
    const formattedBooking = {
      id: booking.id,
      studentId: booking.student_id,
      classInstanceId: booking.class_instance_id,
      status: booking.status
    };

    const formattedClass = {
      id: classInstance.id,
      classDate: classInstance.class_date,
      startTime: classInstance.start_time,
      endTime: classInstance.end_time,
      classType: classInstance.class_type,
      instructor: classInstance.instructor,
      room: classInstance.room
    };

    const icsContent = generateICS(formattedBooking, formattedClass, req.user);

    const filename = `ves-pottery-class-${booking.id}.ics`;
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(icsContent);
  } catch (error) {
    console.error('Error generating calendar file:', error);
    res.status(500).json({ error: 'Failed to generate calendar file' });
  }
});

app.get('/api/classes/my-bookings/calendar', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    const bookings = await supabaseDb.getStudentBookings(dbCustomerId);

    const today = new Date();
    const futureBookings = bookings.filter(b =>
      b.status === 'booked' && new Date(b.class_instance.class_date) >= today
    );

    if (futureBookings.length === 0) {
      return res.status(404).json({ error: 'No upcoming bookings found' });
    }

    const bookingsWithClasses = futureBookings.map(booking => ({
      booking: {
        id: booking.id,
        studentId: booking.student_id,
        classInstanceId: booking.class_instance_id,
        status: booking.status
      },
      classInstance: {
        id: booking.class_instance.id,
        classDate: booking.class_instance.class_date,
        startTime: booking.class_instance.start_time,
        endTime: booking.class_instance.end_time,
        classType: booking.class_instance.class_type,
        instructor: booking.class_instance.instructor,
        room: booking.class_instance.room
      }
    }));

    const icsContent = generateMultipleICS(bookingsWithClasses, req.user);

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
// MEMBERSHIP ENDPOINTS
// ============================================

app.get('/api/membership/my-membership', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    const membership = await supabaseDb.getActiveMembership(dbCustomerId);

    if (!membership) {
      return res.json({
        hasMembership: false,
        message: 'No active membership found'
      });
    }

    // Calculate days remaining
    const endDate = new Date(membership.end_date);
    const today = new Date();
    const daysRemaining = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

    res.json({
      hasMembership: true,
      membership: {
        id: membership.id,
        type: membership.membership_type,
        status: membership.status,
        startDate: membership.start_date,
        endDate: membership.end_date,
        daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
        perks: membership.perks || {
          studioAccess: true,
          communityEvents: true,
          discounts: '10% off workshops'
        }
      }
    });
  } catch (error) {
    console.error('Error fetching membership:', error);
    res.status(500).json({ error: 'Failed to fetch membership' });
  }
});

app.get('/api/membership/history', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    const memberships = await supabaseDb.getCustomerMemberships(dbCustomerId);

    const formattedMemberships = memberships.map(m => ({
      id: m.id,
      type: m.membership_type,
      status: m.status,
      startDate: m.start_date,
      endDate: m.end_date,
      perks: m.perks
    }));

    res.json({ memberships: formattedMemberships });
  } catch (error) {
    console.error('Error fetching membership history:', error);
    res.status(500).json({ error: 'Failed to fetch membership history' });
  }
});

// ============================================
// SHOPIFY INTEGRATION ENDPOINTS
// ============================================

// Sync all customers from Shopify
app.post('/api/admin/sync-shopify-customers', authenticateToken, async (req, res) => {
  try {
    console.log('🔄 Starting Shopify customer sync...');
    const client = getShopifyClient();

    let syncedCount = 0;
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage) {
      const query = `
        query getCustomers${cursor ? `($cursor: String!)` : ''} {
          customers(first: 250${cursor ? `, after: $cursor` : ''}) {
            edges {
              node {
                id
                email
                firstName
                lastName
                createdAt
                tags
              }
              cursor
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      `;

      const variables = cursor ? { cursor } : {};
      const response = await client.query({ data: query, variables });
      const customersData = response.body.data.customers;

      for (const edge of customersData.edges) {
        const customer = edge.node;
        const customerId = customer.id.split('/').pop();

        try {
          await syncCustomer(customer, customerId);
          syncedCount++;
        } catch (error) {
          console.error(`Failed to sync customer ${customer.email}:`, error);
        }
      }

      hasNextPage = customersData.pageInfo.hasNextPage;
      if (hasNextPage && customersData.edges.length > 0) {
        cursor = customersData.edges[customersData.edges.length - 1].cursor;
      }
    }

    console.log(`✅ Synced ${syncedCount} customers from Shopify`);
    res.json({
      success: true,
      message: `Synced ${syncedCount} customers from Shopify`,
      count: syncedCount
    });

  } catch (error) {
    console.error('Error syncing Shopify customers:', error);
    res.status(500).json({ error: 'Failed to sync customers from Shopify' });
  }
});

// Shopify webhook for order creation
app.post('/api/shopify/webhook/orders', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Verify webhook is from Shopify (important for security)
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const shopDomain = req.headers['x-shopify-shop-domain'];

    console.log('📦 Received order webhook from Shopify');
    console.log('Shop:', shopDomain);

    // Parse the order data
    const orderData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Extract customer information
    const customer = orderData.customer;

    if (!customer || !customer.email) {
      console.log('⚠️ Order has no customer email, skipping');
      return res.status(200).json({ received: true });
    }

    console.log(`👤 Processing customer: ${customer.email}`);

    // Sync customer to database
    const customerData = {
      id: `gid://shopify/Customer/${customer.id}`,
      email: customer.email,
      firstName: customer.first_name || '',
      lastName: customer.last_name || ''
    };

    await syncCustomer(customerData, customer.id.toString());

    console.log(`✅ Customer ${customer.email} synced successfully`);

    // Respond to Shopify immediately (required within 5 seconds)
    res.status(200).json({ received: true });

  } catch (error) {
    console.error('Error processing Shopify order webhook:', error);
    // Still respond with 200 to prevent Shopify from retrying
    res.status(200).json({ received: true, error: error.message });
  }
});

// Shopify webhook for customer creation
app.post('/api/shopify/webhook/customers', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const shopDomain = req.headers['x-shopify-shop-domain'];

    console.log('👤 Received customer webhook from Shopify');
    console.log('Shop:', shopDomain);

    const customerData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    if (!customerData || !customerData.email) {
      console.log('⚠️ Customer has no email, skipping');
      return res.status(200).json({ received: true });
    }

    console.log(`👤 Processing new customer: ${customerData.email}`);

    const formattedCustomer = {
      id: `gid://shopify/Customer/${customerData.id}`,
      email: customerData.email,
      firstName: customerData.first_name || '',
      lastName: customerData.last_name || ''
    };

    await syncCustomer(formattedCustomer, customerData.id.toString());

    console.log(`✅ Customer ${customerData.email} synced successfully`);

    res.status(200).json({ received: true });

  } catch (error) {
    console.error('Error processing Shopify customer webhook:', error);
    res.status(200).json({ received: true, error: error.message });
  }
});

// ============================================
// AI CHAT ENDPOINTS
// ============================================

app.post('/api/ai/chat', authenticateToken, async (req, res) => {
  try {
    const { message, currentPage, conversationHistory } = req.body;
    const { dbCustomerId, firstName, lastName, email } = req.user;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Check if OpenRouter API key is configured
    if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'your_openrouter_api_key_here') {
      return res.status(503).json({
        error: 'AI assistant is not configured. Please contact the administrator.'
      });
    }

    // Initialize OpenRouter client (using OpenAI SDK with custom base URL)
    const OpenAI = require('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1'
    });

    // Determine if user is on admin page
    const isAdmin = currentPage && currentPage.startsWith('/admin');

    // Build system prompt based on user role
    const systemPrompt = isAdmin
      ? `You are a helpful AI assistant for the VES Pottery Studio admin dashboard. You help administrators manage students, classes, bookings, memberships, and the pottery gallery.

Current user: ${firstName} ${lastName} (${email})
Current page: ${currentPage}

You can help with:
- Student management (viewing students, managing allocations, updating info)
- Class scheduling and management
- Booking and attendance tracking
- Membership management
- Pottery gallery management (making pieces public/featured)
- Reference data (clay types, glazes)
- Analytics and reporting

Be concise, friendly, and helpful. Provide step-by-step guidance when needed. If you don't know something, be honest about it.`
      : `You are a helpful AI assistant for VES Pottery Studio members. You help students book classes, manage their pottery gallery, view their membership, and navigate the site.

Current user: ${firstName} ${lastName} (${email})
Current page: ${currentPage}

You can help with:
- Booking pottery classes
- Viewing and managing their pottery gallery
- Uploading new pottery pieces
- Checking membership status
- Viewing upcoming bookings
- General questions about the studio

Be warm, encouraging, and helpful. Provide clear instructions. If you don't know something, be honest about it.`;

    // Build messages array for OpenAI
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Add conversation history (last 10 messages)
    if (conversationHistory && Array.isArray(conversationHistory)) {
      conversationHistory.slice(-10).forEach(msg => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: message
    });

    // Call OpenRouter API (using DeepSeek model - fast and cost-effective)
    const completion = await openai.chat.completions.create({
      model: 'deepseek/deepseek-chat',
      messages: messages,
      temperature: 0.7,
      max_tokens: 500
    });

    const reply = completion.choices[0].message.content;

    res.json({
      success: true,
      reply: reply
    });

  } catch (error) {
    console.error('AI chat error:', error);

    // Handle OpenRouter API errors
    if (error.status === 401) {
      return res.status(503).json({
        error: 'AI service authentication failed. Please contact administrator.'
      });
    }

    if (error.status === 429) {
      return res.status(503).json({
        error: 'AI service quota exceeded. Please contact the administrator to add OpenRouter credits.'
      });
    }

    if (error.code === 'insufficient_quota') {
      return res.status(503).json({
        error: 'AI service quota exceeded. The OpenRouter account needs additional credits.'
      });
    }

    res.status(500).json({
      error: 'Failed to get AI response. Please try again.'
    });
  }
});

// ============================================
// INVENTORY MANAGEMENT ENDPOINTS
// ============================================

// Get all suppliers
app.get('/api/admin/inventory/suppliers', authenticateToken, async (req, res) => {
  try {
    const { rows: suppliers } = await supabaseDb.query(`
      SELECT * FROM suppliers
      WHERE active = true
      ORDER BY name ASC
    `);
    res.json({ suppliers });
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});

// Create supplier
app.post('/api/admin/inventory/suppliers', authenticateToken, async (req, res) => {
  try {
    const { name, contactPerson, email, phone, address, notes } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const { rows } = await supabaseDb.query(`
      INSERT INTO suppliers (name, contact_person, email, phone, address, notes, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      RETURNING *
    `, [name, contactPerson, email, phone, address, notes]);

    res.json({ success: true, supplier: rows[0] });
  } catch (error) {
    console.error('Error creating supplier:', error);
    res.status(500).json({ error: 'Failed to create supplier' });
  }
});

// Get all inventory items with categories and suppliers
app.get('/api/admin/inventory/items', authenticateToken, async (req, res) => {
  try {
    const { rows: items } = await supabaseDb.query(`
      SELECT
        i.*,
        c.name as category_name,
        s.name as supplier_name,
        s.email as supplier_email
      FROM inventory_items i
      LEFT JOIN inventory_categories c ON i.category_id = c.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.active = true
      ORDER BY c.name, i.name
    `);

    res.json({ items });
  } catch (error) {
    console.error('Error fetching inventory items:', error);
    res.status(500).json({ error: 'Failed to fetch inventory items' });
  }
});

// Get low stock items
app.get('/api/admin/inventory/low-stock', authenticateToken, async (req, res) => {
  try {
    const { rows: items } = await supabaseDb.query(`
      SELECT
        i.*,
        c.name as category_name,
        s.name as supplier_name,
        s.email as supplier_email
      FROM inventory_items i
      LEFT JOIN inventory_categories c ON i.category_id = c.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.active = true
        AND i.current_stock <= i.min_stock_level
      ORDER BY (i.current_stock / NULLIF(i.min_stock_level, 0)) ASC
    `);

    res.json({ items });
  } catch (error) {
    console.error('Error fetching low stock items:', error);
    res.status(500).json({ error: 'Failed to fetch low stock items' });
  }
});

// Create inventory item
app.post('/api/admin/inventory/items', authenticateToken, async (req, res) => {
  try {
    const {
      categoryId, supplierId, name, description, sku, unit,
      currentStock, minStockLevel, reorderQuantity, unitCost, location, notes
    } = req.body;

    if (!categoryId || !name) {
      return res.status(400).json({ error: 'Category and name are required' });
    }

    const { rows } = await supabaseDb.query(`
      INSERT INTO inventory_items (
        category_id, supplier_id, name, description, sku, unit,
        current_stock, min_stock_level, reorder_quantity, unit_cost,
        location, notes, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
      RETURNING *
    `, [
      categoryId, supplierId, name, description, sku, unit || 'unit',
      currentStock || 0, minStockLevel || 0, reorderQuantity || 0,
      unitCost, location, notes
    ]);

    res.json({ success: true, item: rows[0] });
  } catch (error) {
    console.error('Error creating inventory item:', error);
    res.status(500).json({ error: 'Failed to create inventory item' });
  }
});

// Update inventory item stock
app.post('/api/admin/inventory/items/:id/adjust-stock', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, transactionType, notes, referenceNumber } = req.body;
    const { email } = req.user;

    if (!quantity || !transactionType) {
      return res.status(400).json({ error: 'Quantity and transaction type are required' });
    }

    // Get current stock
    const { rows: [item] } = await supabaseDb.query(`
      SELECT current_stock FROM inventory_items WHERE id = $1
    `, [id]);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const previousStock = parseFloat(item.current_stock);
    let newStock;

    // Calculate new stock based on transaction type
    if (transactionType === 'add' || transactionType === 'purchase' || transactionType === 'return') {
      newStock = previousStock + parseFloat(quantity);
    } else if (transactionType === 'remove' || transactionType === 'use' || transactionType === 'adjustment') {
      newStock = previousStock - parseFloat(quantity);
    } else {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }

    // Update stock
    await supabaseDb.query(`
      UPDATE inventory_items
      SET current_stock = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [newStock, id]);

    // Record transaction
    await supabaseDb.query(`
      INSERT INTO inventory_transactions (
        item_id, transaction_type, quantity, previous_stock, new_stock,
        reference_number, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [id, transactionType, quantity, previousStock, newStock, referenceNumber, notes, email]);

    res.json({
      success: true,
      previousStock,
      newStock,
      message: `Stock ${transactionType === 'add' || transactionType === 'purchase' ? 'increased' : 'decreased'} successfully`
    });
  } catch (error) {
    console.error('Error adjusting stock:', error);
    res.status(500).json({ error: 'Failed to adjust stock' });
  }
});

// Get inventory categories
app.get('/api/admin/inventory/categories', authenticateToken, async (req, res) => {
  try {
    const { rows: categories } = await supabaseDb.query(`
      SELECT * FROM inventory_categories ORDER BY name ASC
    `);
    res.json({ categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Send low stock alert email to supplier
app.post('/api/admin/inventory/send-reorder-email', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.body;

    if (!itemId) {
      return res.status(400).json({ error: 'Item ID required' });
    }

    // Get item details with supplier info
    const { rows: [item] } = await supabaseDb.query(`
      SELECT
        i.*,
        c.name as category_name,
        s.name as supplier_name,
        s.email as supplier_email,
        s.contact_person
      FROM inventory_items i
      LEFT JOIN inventory_categories c ON i.category_id = c.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.id = $1
    `, [itemId]);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (!item.supplier_email) {
      return res.status(400).json({ error: 'No supplier email configured for this item' });
    }

    // Here you would integrate with an email service like SendGrid, AWS SES, etc.
    // For now, we'll just log it and mark the alert as sent
    console.log(`
      === REORDER EMAIL ===
      To: ${item.supplier_email}
      Subject: Reorder Request - ${item.name}

      Dear ${item.contact_person || item.supplier_name},

      We would like to place a reorder for the following item:

      Item: ${item.name}
      Current Stock: ${item.current_stock} ${item.unit}
      Minimum Stock Level: ${item.min_stock_level} ${item.unit}
      Reorder Quantity: ${item.reorder_quantity} ${item.unit}

      Please confirm availability and provide an estimated delivery date.

      Best regards,
      VES Pottery Studio
    `);

    // Update the item to mark alert as sent
    await supabaseDb.query(`
      UPDATE inventory_items
      SET low_stock_alert_sent = true, last_alert_sent_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [itemId]);

    res.json({
      success: true,
      message: `Reorder email sent to ${item.supplier_email}`,
      supplierEmail: item.supplier_email
    });
  } catch (error) {
    console.error('Error sending reorder email:', error);
    res.status(500).json({ error: 'Failed to send reorder email' });
  }
});

// Get inventory transaction history for an item
app.get('/api/admin/inventory/items/:id/transactions', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: transactions } = await supabaseDb.query(`
      SELECT * FROM inventory_transactions
      WHERE item_id = $1
      ORDER BY created_at DESC
      LIMIT 100
    `, [id]);

    res.json({ transactions });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Get inventory dashboard stats
app.get('/api/admin/inventory/stats', authenticateToken, async (req, res) => {
  try {
    const { rows: [stats] } = await supabaseDb.query(`
      SELECT
        (SELECT COUNT(*) FROM inventory_items WHERE active = true) as total_items,
        (SELECT COUNT(*) FROM inventory_items WHERE active = true AND current_stock <= min_stock_level) as low_stock_items,
        (SELECT COUNT(*) FROM suppliers WHERE active = true) as total_suppliers,
        (SELECT COUNT(*) FROM inventory_categories) as total_categories
    `);

    res.json({ stats });
  } catch (error) {
    console.error('Error fetching inventory stats:', error);
    res.status(500).json({ error: 'Failed to fetch inventory stats' });
  }
});

// ============================================
// UTILITY ENDPOINTS
// ============================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'VES Pottery Gallery API'
  });
});

app.use(express.static('public'));

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
  console.log(`🗄️  Supabase database connected (Prisma-free!)`);

  await ensureBucketExists();
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
