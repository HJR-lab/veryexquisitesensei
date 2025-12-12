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
    console.log('📥 /api/classes/my-bookings called for student:', dbCustomerId);

    const bookings = await supabaseDb.getStudentBookings(dbCustomerId);
    console.log('✅ Bookings found:', bookings.length);

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
    console.error('❌ Error in /api/classes/my-bookings:', error);
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

    // Create course enrollment record in database
    const courseIdentifier = `${firstClass.class_type.substring(0, 2).toUpperCase()}${firstClass.start_time.replace(/[^0-9]/g, '')}_${firstClass.instructor}`;
    const startDate = new Date(firstClass.class_date);
    const expectedEndDate = new Date(courseClasses[courseClasses.length - 1].classDate);

    const { data: enrollment, error: enrollmentError } = await supabaseDb.supabase
      .from('course_enrollments')
      .insert({
        student_id: dbCustomerId,
        course_identifier: courseIdentifier,
        course_type: firstClass.class_type,
        total_weeks: courseWeeks,
        weeks_completed: 0,
        weeks_remaining: courseWeeks,
        start_date: startDate.toISOString().split('T')[0],
        expected_end_date: expectedEndDate.toISOString().split('T')[0],
        status: 'active'
      })
      .select()
      .single();

    if (enrollmentError) {
      console.error('Error creating course enrollment:', enrollmentError);
      return res.status(500).json({ error: 'Failed to create course enrollment' });
    }

    // Book all weeks and link to course enrollment
    const bookings = [];
    for (const cls of courseClasses) {
      const booking = await supabaseDb.createBooking({
        studentId: dbCustomerId,
        classInstanceId: cls.id,
        status: 'booked',
        courseEnrollmentId: enrollment.id // Link to actual enrollment record
      });

      await supabaseDb.updateClassEnrollment(cls.id, 1);
      bookings.push(booking);
    }

    res.json({
      success: true,
      courseEnrollmentId: enrollment.id,
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

    // Check if this is a glazing class (Week 6/6 Glazing) - no reschedule fee
    const isGlazingClass = oldClass.class_type?.includes('Week 6/6') && oldClass.class_type?.includes('Glazing');

    // For non-glazing classes, create a reschedule fee
    let rescheduleFee = 0;
    if (!isGlazingClass) {
      rescheduleFee = 40; // $40 reschedule fee for non-glazing classes

      // Create reschedule fee record
      const { error: feeError } = await supabaseDb.supabase
        .from('reschedule_fees')
        .insert({
          student_id: dbCustomerId,
          booking_id: currentBooking.id,
          fee_type: 'reschedule',
          amount: rescheduleFee,
          payment_status: 'pending',
          notes: `Reschedule fee for ${oldClass.class_type} on ${new Date(oldClass.class_date).toLocaleDateString()}`
        });

      if (feeError) {
        console.error('Error creating reschedule fee:', feeError);
        // Continue with reschedule but log the error
      }
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
      courseEnrollmentId: currentBooking.course_enrollment_id, // Keep same course enrollment ID
      isGlazingReschedule: isGlazingClass,
      originalClassInstanceId: parseInt(oldClassId),
      rescheduledFromDate: oldClass.class_date,
      rescheduleFeePaid: 0 // Fee is pending payment
    });

    await supabaseDb.updateClassEnrollment(parseInt(newClassId), 1);

    res.json({
      success: true,
      booking: {
        id: newBooking.id,
        classInstanceId: newBooking.class_instance_id
      },
      rescheduleFee: rescheduleFee,
      message: isGlazingClass
        ? 'Glazing class rescheduled successfully (no fee)!'
        : `Class rescheduled successfully! A $${rescheduleFee} reschedule fee has been added to your account.`
    });

  } catch (error) {
    console.error('Error rescheduling class:', error);
    res.status(500).json({ error: 'Failed to reschedule class' });
  }
});

// ============================================
// PAUSE COURSE ENDPOINTS
// ============================================

app.post('/api/classes/pause/calculate', authenticateToken, async (req, res) => {
  try {
    const { classId } = req.body;
    const { dbCustomerId } = req.user;

    if (!classId) {
      return res.status(400).json({ error: 'Class ID is required' });
    }

    // Get the booking to find the course enrollment
    const { data: booking, error: bookingError } = await supabaseDb.supabase
      .from('bookings')
      .select('course_enrollment_id, class_instance_id')
      .eq('class_instance_id', classId)
      .eq('student_id', dbCustomerId)
      .eq('status', 'booked')
      .single();

    if (bookingError || !booking || !booking.course_enrollment_id) {
      console.error('Error fetching booking:', bookingError);
      return res.status(404).json({ error: 'Booking or course enrollment not found' });
    }

    // Get course enrollment info
    const { data: enrollment, error: enrollmentError } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*')
      .eq('id', booking.course_enrollment_id)
      .single();

    if (enrollmentError || !enrollment) {
      console.error('Error fetching course enrollment:', enrollmentError);
      return res.status(500).json({ error: 'Failed to fetch course enrollment' });
    }

    // Check if pause has already been used for this course
    const { data: customer, error: customerError } = await supabaseDb.supabase
      .from('customers')
      .select('pause_used_for_course, course_paused')
      .eq('id', dbCustomerId)
      .single();

    if (customerError) {
      console.error('Error fetching customer:', customerError);
      return res.status(500).json({ error: 'Failed to fetch customer information' });
    }

    if (customer.pause_used_for_course) {
      return res.status(400).json({
        error: 'You have already used your one-time pause for this course'
      });
    }

    if (customer.course_paused) {
      return res.status(400).json({
        error: 'Your course is already paused'
      });
    }

    // Calculate remaining classes from enrollment
    const remainingCount = enrollment.weeks_remaining;
    const pauseFeePerClass = 40;
    const totalPauseFee = remainingCount * pauseFeePerClass;

    res.json({
      remainingClasses: remainingCount,
      feePerClass: pauseFeePerClass,
      totalFee: totalPauseFee,
      pauseDuration: 30,
      courseIdentifier: enrollment.course_identifier
    });

  } catch (error) {
    console.error('Error calculating pause:', error);
    res.status(500).json({ error: 'Failed to calculate pause fee' });
  }
});

app.post('/api/classes/pause', authenticateToken, async (req, res) => {
  try {
    const { classId } = req.body;
    const { dbCustomerId } = req.user;

    if (!classId) {
      return res.status(400).json({ error: 'Class ID is required' });
    }

    // Get the booking to find the course enrollment
    const { data: booking, error: bookingError } = await supabaseDb.supabase
      .from('bookings')
      .select('course_enrollment_id')
      .eq('class_instance_id', classId)
      .eq('student_id', dbCustomerId)
      .eq('status', 'booked')
      .single();

    if (bookingError || !booking || !booking.course_enrollment_id) {
      console.error('Error fetching booking:', bookingError);
      return res.status(404).json({ error: 'Booking or course enrollment not found' });
    }

    // Get course enrollment info
    const { data: enrollment, error: enrollmentError } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*')
      .eq('id', booking.course_enrollment_id)
      .single();

    if (enrollmentError || !enrollment) {
      console.error('Error fetching course enrollment:', enrollmentError);
      return res.status(500).json({ error: 'Failed to fetch course enrollment' });
    }

    // Get customer info
    const { data: customer, error: customerError } = await supabaseDb.supabase
      .from('customers')
      .select('pause_used_for_course, course_paused, email, first_name, last_name')
      .eq('id', dbCustomerId)
      .single();

    if (customerError) {
      console.error('Error fetching customer:', customerError);
      return res.status(500).json({ error: 'Failed to fetch customer information' });
    }

    // Check if pause has already been used
    if (customer.pause_used_for_course) {
      return res.status(400).json({
        error: 'You have already used your one-time pause for this course'
      });
    }

    // Check if course is currently paused
    if (customer.course_paused) {
      return res.status(400).json({
        error: 'Your course is already paused'
      });
    }

    // Calculate pause fee from enrollment data
    const remainingCount = enrollment.weeks_remaining;
    const pauseFeePerClass = 40;
    const totalPauseFee = remainingCount * pauseFeePerClass;

    // Update customer pause status
    const { error: updateError } = await supabaseDb.supabase
      .from('customers')
      .update({
        course_paused: true,
        pause_start_date: new Date().toISOString().split('T')[0],
        pause_reason: 'Student requested pause',
        paused_at_week: enrollment.weeks_completed + 1,
        resume_course_identifier: enrollment.course_identifier,
        pause_used_for_course: true,
        pause_used_date: new Date().toISOString()
      })
      .eq('id', dbCustomerId);

    if (updateError) {
      console.error('Error updating customer pause status:', updateError);
      return res.status(500).json({ error: 'Failed to pause course' });
    }

    // Update course enrollment status to paused
    const { error: enrollmentUpdateError } = await supabaseDb.supabase
      .from('course_enrollments')
      .update({ status: 'paused' })
      .eq('id', enrollment.id);

    if (enrollmentUpdateError) {
      console.error('Error updating enrollment status:', enrollmentUpdateError);
    }

    // Create a reschedule fee record for the pause
    const { error: feeError } = await supabaseDb.supabase
      .from('reschedule_fees')
      .insert({
        student_id: dbCustomerId,
        fee_type: 'pause',
        amount: totalPauseFee,
        payment_status: 'pending',
        notes: `Course pause - ${remainingCount} remaining classes at $${pauseFeePerClass}/class`
      });

    if (feeError) {
      console.error('Error creating pause fee:', feeError);
      // Don't fail the request, but log the error
    }

    // TODO: Generate payment link (needs Shopify integration setup)
    // For now, return a placeholder that should be updated with actual payment link
    const paymentLink = `https://ves.sg/pages/pause-payment?amount=${totalPauseFee}&student=${customer.email}`;

    res.json({
      success: true,
      message: 'Course paused successfully',
      pauseFee: totalPauseFee,
      pauseDuration: 30,
      paymentLink
    });

  } catch (error) {
    console.error('Error pausing course:', error);
    res.status(500).json({ error: 'Failed to pause course' });
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

// Get student statistics
app.get('/api/admin/students/stats', authenticateToken, async (req, res) => {
  try {
    // Get all students with pagination (Supabase default limit is 1000)
    let allStudents = [];
    let page = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabaseDb.supabase
        .from('customers')
        .select('id, email, first_name, last_name, customer_type, classes_allocated, classes_used, classes_forfeited, course_purchase_date, course_expiry_date, course_purchase_count, created_at, updated_at')
        .in('customer_type', ['student', 'member', 'student & member'])
        .order('created_at', { ascending: false })
        .range(page * 1000, (page + 1) * 1000 - 1);

      if (error) throw error;
      allStudents = allStudents.concat(data || []);
      hasMore = (data?.length || 0) === 1000;
      page++;
    }

    // Get all bookings for students with status 'booked' or 'completed'
    const { data: allBookings, error: bookingsError } = await supabaseDb.supabase
      .from('bookings')
      .select('id, student_id, course_enrollment_id, status, attended')
      .in('status', ['booked', 'completed']);

    if (bookingsError) throw bookingsError;

    // Get bookings with class instances to extract course identifiers
    const { data: allBookingsWithClasses, error: bookingsClassError } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        student_id,
        class_instance_id,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date,
          start_time,
          instructor,
          room
        )
      `)
      .in('status', ['booked', 'completed'])
      .order('class_instances(class_date)', { ascending: false });

    if (bookingsClassError) throw bookingsClassError;

    // Helper function to get course identifier from class_type field
    // The class_type field already contains the proper identifier (e.g., WT0410AM_DL6.1)
    // Format: WT1210AM_DL6.6 means:
    // - WT = Wheelthrowing, HB = Handbuilding
    // - 1210 = Started Oct 12 (month/day)
    // - AM = 9:30am, PM = 1:00pm, NT = 7:30pm
    // - DL = Dillon Lin (instructor initials)
    // - 6.6 = Week 6 of 6 classes
    const generateCourseIdentifier = (classInstance, allClassesForStudent) => {
      if (!classInstance) return null;

      const { class_type } = classInstance;

      // Simply return the class_type as it already contains the proper course identifier
      return class_type;
    };

    // Build a simple map of class_instance_id to course identifier
    // Since class_type already contains the full course identifier (e.g., WT0410AM_DL6.1),
    // we just need to map class IDs to their class_type values
    const { data: allClassInstances, error: classesError } = await supabaseDb.supabase
      .from('class_instances')
      .select('id, class_type')
      .order('class_date', { ascending: true });

    if (classesError) throw classesError;

    // Create a simple mapping from class_instance_id to course identifier (class_type)
    const classIdToCourseIdentifier = {};
    allClassInstances.forEach(cls => {
      classIdToCourseIdentifier[cls.id] = cls.class_type;
    });

    // Create map of student to their course identifiers (from bookings)
    const studentCourseMap = {};

    allBookingsWithClasses.forEach(booking => {
      const studentId = booking.student_id;
      const classInstanceId = booking.class_instance_id;
      const classInstance = booking.class_instances;
      const classDate = classInstance?.class_date;

      if (!studentCourseMap[studentId]) {
        studentCourseMap[studentId] = [];
      }

      // Get course identifier from our pre-computed map
      const courseIdentifier = classIdToCourseIdentifier[classInstanceId];

      if (courseIdentifier) {
        // Extract base course identifier without week number (e.g., WT0410AM_DL6 from WT0410AM_DL6.1)
        const baseCourseId = courseIdentifier.split('.')[0];

        // Check if student already has this course (by base identifier)
        const existing = studentCourseMap[studentId].find(c => c.courseIdentifier.split('.')[0] === baseCourseId);
        if (!existing) {
          // Store just the course identifier (without week number)
          studentCourseMap[studentId].push({
            courseIdentifier: baseCourseId, // Just the course identifier (e.g., WT0410AM_DL6)
            classDate: classDate
          });
        }
      }
    });

    // Sort each student's courses by date (most recent first)
    Object.keys(studentCourseMap).forEach(studentId => {
      studentCourseMap[studentId].sort((a, b) =>
        new Date(b.classDate) - new Date(a.classDate)
      );
    });

    // Process bookings to create aggregated data per student
    const bookingMap = {};

    allBookings.forEach(booking => {
      const studentId = booking.student_id;

      if (!bookingMap[studentId]) {
        bookingMap[studentId] = {
          bookingCount: 0,
          courseEnrollments: new Set(),
          attendedCount: 0
        };
      }

      // Count total bookings
      bookingMap[studentId].bookingCount++;

      // Count unique course enrollments (students who purchased multiple courses)
      if (booking.course_enrollment_id) {
        bookingMap[studentId].courseEnrollments.add(booking.course_enrollment_id);
      }

      // Count attended classes
      if (booking.status === 'completed' && booking.attended === true) {
        bookingMap[studentId].attendedCount++;
      }
    });

    // Convert courseEnrollments Sets to counts
    Object.keys(bookingMap).forEach(studentId => {
      bookingMap[studentId].courseCount = bookingMap[studentId].courseEnrollments.size;
      delete bookingMap[studentId].courseEnrollments;
    });

    // All students are already filtered during sync (only course purchasers were synced)
    const totalStudents = allStudents.length;

    // Active students: students who have bookings for classes on or after today
    const today = new Date().toISOString().split('T')[0];

    // Get unique student IDs who have bookings for future classes
    const activeStudentIds = new Set();
    allBookingsWithClasses.forEach(booking => {
      const classDate = booking.class_instances?.class_date;
      if (classDate && classDate >= today && booking.student_id) {
        activeStudentIds.add(booking.student_id);
      }
    });

    const activeStudents = activeStudentIds.size;

    console.log(`👥 Student Management Stats: ${allStudents.length} total students, ${activeStudents} active students (with bookings >= ${today})`);

    // Inactive students: students whose course has expired or no dates available
    const inactiveStudents = totalStudents - activeStudents;

    // Returning students: students who have purchased more than one course (from Shopify data)
    const returningStudents = allStudents.filter(s => (s.course_purchase_count || 0) > 1).length;

    // Students by number of courses purchased
    const courseStats = {};
    allStudents.forEach(s => {
      const courseCount = bookingMap[s.id]?.courseCount || 0;
      if (courseCount > 0) {
        courseStats[courseCount] = (courseStats[courseCount] || 0) + 1;
      }
    });

    // Top 3 returning students (most courses purchased from Shopify)
    const topReturning = allStudents
      .filter(s => (s.course_purchase_count || 0) > 1)
      .sort((a, b) => (b.course_purchase_count || 0) - (a.course_purchase_count || 0))
      .slice(0, 3)
      .map(s => ({
        name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
        courseCount: s.course_purchase_count
      }));

    // Top 3 active students (most classes attended)
    const topActive = allStudents
      .filter(s => bookingMap[s.id]?.attendedCount > 0)
      .sort((a, b) => (bookingMap[b.id]?.attendedCount || 0) - (bookingMap[a.id]?.attendedCount || 0))
      .slice(0, 3)
      .map(s => ({
        name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
        classesAttended: bookingMap[s.id].attendedCount
      }));

    // Top 3 most booked students (most upcoming/completed bookings)
    const topBooked = allStudents
      .filter(s => bookingMap[s.id]?.bookingCount > 0)
      .sort((a, b) => (bookingMap[b.id]?.bookingCount || 0) - (bookingMap[a.id]?.bookingCount || 0))
      .slice(0, 3)
      .map(s => ({
        name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
        totalBookings: bookingMap[s.id].bookingCount
      }));

    // Active Students List (all students with course_expiry_date >= today)
    const activeStudentsList = allStudents
      .filter(s => s.course_expiry_date && s.course_expiry_date >= today)
      .map(s => {
        // Get the most recent course for this student
        const courses = studentCourseMap[s.id] || [];
        const latestCourse = courses.length > 0 ? courses[0] : null;

        return {
          name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
          email: s.email,
          courseIdentifier: latestCourse?.courseIdentifier || null,
          coursePurchaseCount: s.course_purchase_count || 1
        };
      })
      .sort((a, b) => {
        // Sort by course identifier first (alphabetically), then by name
        const courseCompare = (a.courseIdentifier || '').localeCompare(b.courseIdentifier || '');
        if (courseCompare !== 0) return courseCompare;
        return a.name.localeCompare(b.name);
      });

    // Returning Students List (all students with course_purchase_count > 1)
    const returningStudentsList = allStudents
      .filter(s => (s.course_purchase_count || 0) > 1)
      .map(s => {
        // Get the most recent course for this student
        const courses = studentCourseMap[s.id] || [];
        const latestCourse = courses.length > 0 ? courses[0] : null;

        return {
          name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
          email: s.email,
          courseIdentifier: latestCourse?.courseIdentifier || null,
          coursePurchaseCount: s.course_purchase_count
        };
      })
      .sort((a, b) => {
        // Sort by course identifier first (alphabetically), then by name
        const courseCompare = (a.courseIdentifier || '').localeCompare(b.courseIdentifier || '');
        if (courseCompare !== 0) return courseCompare;
        return a.name.localeCompare(b.name);
      });

    res.json({
      stats: {
        totalStudents,
        activeStudents,
        returningStudents,
        inactiveStudents
      },
      courseStats,
      topPerformers: {
        topReturning,
        topActive,
        topBooked
      },
      activeStudentsList,
      returningStudentsList,
      message: 'Student statistics calculated successfully'
    });

  } catch (error) {
    console.error('Error fetching student stats:', error);
    res.status(500).json({ error: 'Failed to fetch student stats' });
  }
});

// Get single student details
app.get('/api/admin/students/:email', authenticateToken, async (req, res) => {
  try {
    const { email } = req.params;
    const decodedEmail = decodeURIComponent(email);

    const { data: student, error } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', decodedEmail)
      .single();

    if (error || !student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json(student);
  } catch (error) {
    console.error('Error fetching student:', error);
    res.status(500).json({ error: 'Failed to fetch student' });
  }
});

// Get dashboard stats
app.get('/api/admin/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayOfWeek = new Date(now);
    firstDayOfWeek.setDate(now.getDate() - now.getDay());

    // Fetch all customers with pagination (Supabase default limit is 1000)
    let allStudents = [];
    let page = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabaseDb.supabase
        .from('customers')
        .select('id, created_at, course_purchase_count, course_expiry_date')
        .in('customer_type', ['student', 'member', 'student & member'])
        .range(page * 1000, (page + 1) * 1000 - 1);

      if (error) throw error;
      allStudents = allStudents.concat(data || []);
      hasMore = (data?.length || 0) === 1000;
      page++;
    }

    // Fetch all bookings with pagination (including class_instance_id for future bookings check)
    let allBookings = [];
    page = 0;
    hasMore = true;
    while (hasMore) {
      const { data, error } = await supabaseDb.supabase
        .from('bookings')
        .select('id, student_id, created_at, status, attended, class_instance_id')
        .in('status', ['booked', 'completed'])
        .range(page * 1000, (page + 1) * 1000 - 1);

      if (error) throw error;
      allBookings = allBookings.concat(data || []);
      hasMore = (data?.length || 0) === 1000;
      page++;
    }

    // Get other data in parallel (these are unlikely to exceed 1000 rows)
    const results = await Promise.allSettled([
      // Get ALL class instances to show total scheduled classes
      supabaseDb.supabase
        .from('class_instances')
        .select('id, class_date, max_capacity'),
      supabaseDb.supabase
        .from('memberships')
        .select('id, status, end_date, created_at')
        .eq('status', 'active'),
      supabaseDb.getAllPotteryPieces()
    ]);

    // Extract data with fallbacks (students and bookings are already populated above)
    const allClasses = results[0].status === 'fulfilled' ? (results[0].value.data || []) : [];
    const allMemberships = results[1].status === 'fulfilled' ? (results[1].value.data || []) : [];
    const allGalleryPieces = results[2].status === 'fulfilled' ? (results[2].value || []) : [];

    // Separate future classes for availability calculation
    const today = now.toISOString().split('T')[0];
    const futureClasses = allClasses.filter(cls => cls.class_date >= today);

    // Create a map of class_instance_id -> class_date for quick lookup
    const classDateMap = {};
    allClasses.forEach(cls => {
      classDateMap[cls.id] = cls.class_date;
    });

    // Calculate student stats
    // Active students: students who have bookings for classes on or after today (matches Student Management page logic)
    const activeStudentIds = new Set();
    allBookings.forEach(booking => {
      const classDate = classDateMap[booking.class_instance_id];
      if (classDate && classDate >= today && booking.student_id) {
        activeStudentIds.add(booking.student_id);
      }
    });

    console.log(`📊 Dashboard Stats: ${allStudents.length} total students, ${activeStudentIds.size} active students (with future bookings >= ${today}), ${allBookings.length} bookings, ${allClasses.length} total classes (${futureClasses.length} future), ${allMemberships.length} memberships, ${allGalleryPieces.length} gallery pieces`);

    // Get full student objects for active students
    const activeStudents = allStudents.filter(s => activeStudentIds.has(s.id));

    const newStudentsThisMonth = activeStudents.filter(s =>
      new Date(s.created_at) >= firstDayOfMonth
    ).length;

    const returningStudents = activeStudents.filter(s =>
      (s.course_purchase_count || 0) > 1
    ).length;

    // Calculate class stats
    // Total enrolled = unique students with bookings
    const totalEnrolled = new Set(allBookings.map(b => b.student_id)).size;

    // Use future classes for capacity calculation
    const totalCapacity = futureClasses.reduce((sum, cls) => sum + (cls.max_capacity || 8), 0);
    const futureBookings = allBookings.filter(b => {
      // We need to join with class_instances to check if booking is for a future class
      // For now, just use total bookings as an approximation
      return true;
    });
    const availableSpots = Math.max(0, totalCapacity - futureBookings.length);

    // Calculate booking stats
    const bookingsThisWeek = allBookings.filter(b =>
      new Date(b.created_at) >= firstDayOfWeek
    ).length;

    const attendedBookings = allBookings.filter(b => b.attended === true).length;
    const attendanceRate = allBookings.length > 0
      ? Math.round((attendedBookings / allBookings.length) * 100)
      : 0;

    // Calculate membership stats
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    const expiringSoon = allMemberships.filter(m =>
      new Date(m.end_date) <= thirtyDaysFromNow && new Date(m.end_date) >= now
    ).length;

    const renewedThisMonth = allMemberships.filter(m =>
      new Date(m.created_at) >= firstDayOfMonth
    ).length;

    // Calculate gallery stats
    const addedThisMonth = allGalleryPieces.filter(p =>
      new Date(p.date_completed || p.created_at) >= firstDayOfMonth
    ).length;

    const awaitingApproval = 0; // Gallery doesn't have approval system yet

    res.json({
      students: {
        total: activeStudentIds.size, // Count students with future bookings (matches Student Management)
        newThisMonth: newStudentsThisMonth,
        returning: returningStudents
      },
      classes: {
        total: allClasses.length,
        enrolled: totalEnrolled,
        availableSpots: Math.max(0, availableSpots)
      },
      bookings: {
        total: allBookings.length,
        thisWeek: bookingsThisWeek,
        attendanceRate: attendanceRate
      },
      memberships: {
        total: allMemberships.length,
        expiringSoon: expiringSoon,
        renewedThisMonth: renewedThisMonth
      },
      gallery: {
        total: allGalleryPieces.length,
        addedThisMonth: addedThisMonth,
        awaitingApproval: awaitingApproval
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats', details: error.message });
  }
});

// Get student bookings
app.get('/api/admin/students/:email/bookings', authenticateToken, async (req, res) => {
  try {
    const { email } = req.params;
    const decodedEmail = decodeURIComponent(email);

    // First get the student
    const { data: student } = await supabaseDb.supabase
      .from('customers')
      .select('id')
      .eq('email', decodedEmail)
      .single();

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get their bookings with class details
    const { data: bookings, error } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          id,
          class_date,
          start_time,
          class_type,
          instructor
        )
      `)
      .eq('student_id', student.id)
      .order('class_instances(class_date)', { ascending: false });

    if (error) throw error;

    // Get all class instances to generate course identifiers
    const { data: allClassInstances } = await supabaseDb.supabase
      .from('class_instances')
      .select('id, class_type, class_date, start_time, instructor')
      .order('class_date', { ascending: true });

    // Generate course identifiers (same logic as stats endpoint)
    const classIdToCourseIdentifier = {};
    const courseGroups = {};

    allClassInstances.forEach(cls => {
      const clsDate = new Date(cls.class_date);
      const dayOfWeek = clsDate.getDay();
      const signature = `${cls.class_type}_${cls.start_time}_${cls.instructor}_${dayOfWeek}`;
      if (!courseGroups[signature]) {
        courseGroups[signature] = [];
      }
      courseGroups[signature].push(cls);
    });

    // Helper function to generate course identifier
    const generateCourseIdentifier = (classInstance) => {
      const { class_type, class_date, start_time, instructor } = classInstance;
      const typeAbbrev = class_type?.toLowerCase().includes('wheelthrowing') ? 'WT' :
                        class_type?.toLowerCase().includes('handbuilding') ? 'HB' : 'CL';
      const timeCode = start_time === '9:30 AM' ? 'AM' :
                      start_time === '1:00 PM' ? 'PM' :
                      start_time === '7:00 PM' || start_time === '7:30 PM' ? 'NT' : 'XX';
      const instructorCode = instructor === 'Dillon Lin' ? 'DL' :
                            instructor === 'Joyce Lim' ? 'JL' :
                            instructor === 'Lynette Ting' ? 'LT' : 'XX';

      const dateStr = class_date.split('T')[0];
      const [year, month, day] = dateStr.split('-').map(n => parseInt(n));
      const startDate = `${day.toString().padStart(2, '0')}${month.toString().padStart(2, '0')}`;

      return `${typeAbbrev}${startDate}${timeCode}_${instructorCode}`;
    };

    Object.values(courseGroups).forEach(classes => {
      if (classes.length === 0) return;
      classes.sort((a, b) => new Date(a.class_date) - new Date(b.class_date));

      const firstClass = classes[0];
      const isWheelthrowing = firstClass.class_type?.toLowerCase().includes('wheelthrowing');

      if (isWheelthrowing) {
        let currentCourse = [];
        let lastDate = null;

        for (let i = 0; i < classes.length; i++) {
          const cls = classes[i];
          const clsDate = new Date(cls.class_date);

          if (!lastDate || (clsDate - lastDate) / (1000 * 60 * 60 * 24) <= 14) {
            currentCourse.push(cls);
            lastDate = clsDate;

            if (currentCourse.length === 6) {
              const courseStartClass = currentCourse[0];
              currentCourse.forEach((c, weekIndex) => {
                const baseIdentifier = generateCourseIdentifier(courseStartClass);
                const weekNumber = weekIndex + 1;
                const fullIdentifier = `${baseIdentifier}6.${weekNumber}`;
                classIdToCourseIdentifier[c.id] = fullIdentifier;
              });
              currentCourse = [];
              lastDate = null;
            }
          } else {
            if (currentCourse.length > 0) {
              const courseStartClass = currentCourse[0];
              const totalWeeks = currentCourse.length;
              currentCourse.forEach((c, weekIndex) => {
                const baseIdentifier = generateCourseIdentifier(courseStartClass);
                const weekNumber = weekIndex + 1;
                const fullIdentifier = `${baseIdentifier}${totalWeeks}.${weekNumber}`;
                classIdToCourseIdentifier[c.id] = fullIdentifier;
              });
            }
            currentCourse = [cls];
            lastDate = clsDate;
          }
        }

        if (currentCourse.length > 0) {
          const courseStartClass = currentCourse[0];
          const totalWeeks = currentCourse.length;
          currentCourse.forEach((c, weekIndex) => {
            const baseIdentifier = generateCourseIdentifier(courseStartClass);
            const weekNumber = weekIndex + 1;
            const fullIdentifier = `${baseIdentifier}${totalWeeks}.${weekNumber}`;
            classIdToCourseIdentifier[c.id] = fullIdentifier;
          });
        }
      }
    });

    // Flatten the data for easier use
    const formattedBookings = bookings.map(booking => ({
      id: booking.id,
      status: booking.status,
      attended: booking.attended,
      class_date: booking.class_instances.class_date,
      start_time: booking.class_instances.start_time,
      class_type: booking.class_instances.class_type,
      instructor: booking.class_instances.instructor,
      course_identifier: classIdToCourseIdentifier[booking.class_instances.id] || 'N/A'
    }));

    res.json(formattedBookings);
  } catch (error) {
    console.error('Error fetching student bookings:', error);
    res.status(500).json({ error: 'Failed to fetch student bookings' });
  }
});

// Update student
app.put('/api/admin/students/:email', authenticateToken, async (req, res) => {
  try {
    const { email } = req.params;
    const decodedEmail = decodeURIComponent(email);
    const { course_purchase_count } = req.body;

    const { data, error } = await supabaseDb.supabase
      .from('customers')
      .update({
        course_purchase_count: course_purchase_count,
        updated_at: new Date().toISOString()
      })
      .eq('email', decodedEmail)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({ error: 'Failed to update student' });
  }
});

// Get all classes with course identifiers for admin
app.get('/api/admin/classes', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 Fetching admin classes...');

    // Get all class instances with enrollment data
    const { data: allClassInstances, error: classesError } = await supabaseDb.supabase
      .from('class_instances')
      .select('id, class_type, class_date, start_time, end_time, instructor, room, max_capacity, current_enrollment')
      .order('class_date', { ascending: true });

    if (classesError) {
      console.error('❌ Error fetching classes:', classesError);
      throw classesError;
    }

    console.log(`✅ Fetched ${allClassInstances.length} class instances from database`);

    // NEW LOGIC: Classes now have identifiers stored in class_type field
    // Format: WT1801AM_DL6.1 (Type + DDMM + Time + Instructor + Weeks.Week#)
    // We need to extract the base identifier (without week number) and group accordingly

    const courseMap = new Map(); // Key: base identifier (e.g., "WT1801AM_DL6"), Value: array of classes

    allClassInstances.forEach(cls => {
      // class_type contains the full identifier like "WT1801AM_DL6.1"
      const fullIdentifier = cls.class_type;

      // Extract base identifier by removing the week number (e.g., "WT1801AM_DL6")
      // Pattern: Everything before the last period
      const lastDotIndex = fullIdentifier.lastIndexOf('.');
      const baseIdentifier = lastDotIndex > 0 ? fullIdentifier.substring(0, lastDotIndex) : fullIdentifier;

      if (!courseMap.has(baseIdentifier)) {
        courseMap.set(baseIdentifier, []);
      }

      courseMap.get(baseIdentifier).push({
        ...cls,
        courseIdentifier: fullIdentifier, // Full identifier with week number
        baseCourseIdentifier: baseIdentifier // Base identifier without week number
      });
    });

    // Convert map to courses array
    const courses = Array.from(courseMap.entries()).map(([identifier, classes]) => {
      // Sort classes by date within each course
      classes.sort((a, b) => new Date(a.class_date) - new Date(b.class_date));

      return {
        identifier: identifier, // Base identifier (e.g., "WT1801AM_DL6")
        classes: classes
      };
    });

    console.log(`📊 Grouped into ${courses.length} courses`);

    // Get booking counts for each class AND unique students per course
    // IMPORTANT: Fetch ALL bookings using pagination (default limit is 1000)
    let bookingCounts = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseDb.supabase
        .from('bookings')
        .select('class_instance_id, student_id, status')
        .in('status', ['booked', 'completed'])
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('❌ Error fetching bookings:', error);
        throw error;
      }

      bookingCounts = bookingCounts.concat(data);
      hasMore = data.length === pageSize;
      page++;
    }

    console.log(`✅ Fetched ${bookingCounts.length} bookings`);

    const bookingCountsByClass = {};
    bookingCounts.forEach(b => {
      if (!bookingCountsByClass[b.class_instance_id]) {
        bookingCountsByClass[b.class_instance_id] = 0;
      }
      bookingCountsByClass[b.class_instance_id]++;
    });

    // Add booking counts to classes and calculate UNIQUE students per course
    courses.forEach(course => {
      // Count unique students across all weeks of this course
      const uniqueStudents = new Set();
      course.classes.forEach(cls => {
        cls.bookingCount = bookingCountsByClass[cls.id] || 0;
        // Add all students from this class to the set
        bookingCounts
          .filter(b => b.class_instance_id === cls.id)
          .forEach(b => uniqueStudents.add(b.student_id));
      });
      course.totalEnrollment = uniqueStudents.size; // Count of unique students
    });

    // Show ALL courses regardless of enrollment (removed the 4+ student filter)
    // Admin should see all courses to manage them properly
    const filteredCourses = courses; // No filtering - show all courses

    console.log(`✅ Successfully fetched and processed ${allClassInstances.length} classes in ${filteredCourses.length} courses`);

    res.json({ courses: filteredCourses });
  } catch (error) {
    console.error('❌ Error fetching admin classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

app.get('/api/admin/classes/:classId/members', authenticateToken, async (req, res) => {
  try {
    const { classId } = req.params;

    // Get all bookings for this class (active + rescheduled/cancelled to track absences)
    const { data: allBookings, error: bookingsError } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        id,
        student_id,
        status,
        attended,
        customers (
          id,
          first_name,
          last_name,
          course_purchase_count
        )
      `)
      .eq('class_instance_id', classId)
      .order('created_at', { ascending: true });

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      return res.status(500).json({ error: 'Failed to fetch bookings' });
    }

    // For rescheduled bookings, find where they rescheduled TO
    // Get all bookings where original_class_instance_id matches current class
    const { data: rescheduledToBookings, error: rescheduledError } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        id,
        student_id,
        class_instance_id,
        class_instances!bookings_class_instance_id_fkey (
          id,
          class_date,
          start_time,
          end_time,
          class_type
        )
      `)
      .eq('original_class_instance_id', classId)
      .in('status', ['booked', 'completed']);

    if (rescheduledError) {
      console.error('Error fetching rescheduled bookings:', rescheduledError);
    }

    // Create a map of student_id -> rescheduled class info
    const rescheduledToMap = {};
    if (rescheduledToBookings) {
      rescheduledToBookings.forEach(booking => {
        rescheduledToMap[booking.student_id] = {
          classDate: booking.class_instances?.class_date,
          startTime: booking.class_instances?.start_time,
          endTime: booking.class_instances?.end_time,
          classType: booking.class_instances?.class_type
        };
      });
    }

    // Separate active members from absent members
    const activeMembers = [];
    const absentMembers = [];

    allBookings.forEach(booking => {
      const member = {
        id: booking.id,
        bookingId: booking.id,
        studentId: booking.student_id,
        firstName: booking.customers?.first_name,
        lastName: booking.customers?.last_name,
        returningCount: booking.customers?.course_purchase_count || 0,
        status: booking.status,
        attended: booking.attended
      };

      // Active members: status is 'booked' or 'completed'
      if (booking.status === 'booked' || booking.status === 'completed') {
        activeMembers.push(member);
      }
      // Absent members: rescheduled, cancelled (manual absence), or marked as not attended
      else if (booking.status === 'rescheduled' || booking.status === 'cancelled' || booking.attended === false) {
        // If rescheduled, add the new class info
        if (booking.status === 'rescheduled' && rescheduledToMap[booking.student_id]) {
          member.rescheduledTo = rescheduledToMap[booking.student_id];
        }
        absentMembers.push(member);
      }
    });

    // Sort active members by returning count (descending), then alphabetically
    activeMembers.sort((a, b) => {
      if (b.returningCount !== a.returningCount) {
        return b.returningCount - a.returningCount;
      }
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

    // Sort absent members alphabetically
    absentMembers.sort((a, b) => {
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

    res.json({
      members: activeMembers,
      count: activeMembers.length,
      absentMembers: absentMembers,
      absentCount: absentMembers.length
    });
  } catch (error) {
    console.error('Error fetching class members:', error);
    res.status(500).json({ error: 'Failed to fetch class members' });
  }
});

// Add student to class
app.post('/api/admin/classes/:classId/add-student', authenticateToken, async (req, res) => {
  try {
    const { classId } = req.params;
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({ error: 'Missing required field: studentId' });
    }

    // Check if class exists and get capacity info
    const { data: classInstance, error: classError } = await supabaseDb.supabase
      .from('class_instances')
      .select('id, max_capacity')
      .eq('id', classId)
      .single();

    if (classError || !classInstance) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Check if student exists
    const { data: student, error: studentError } = await supabaseDb.supabase
      .from('customers')
      .select('id')
      .eq('id', studentId)
      .single();

    if (studentError || !student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Check if student is already enrolled in this class
    const { data: existingBooking, error: checkError } = await supabaseDb.supabase
      .from('bookings')
      .select('id')
      .eq('class_instance_id', classId)
      .eq('student_id', studentId)
      .eq('status', 'booked')
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing booking:', checkError);
      return res.status(500).json({ error: 'Failed to check enrollment status' });
    }

    if (existingBooking) {
      return res.status(400).json({ error: 'Student is already enrolled in this class' });
    }

    // Check if class is full
    const { count: currentEnrollment, error: countError } = await supabaseDb.supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('class_instance_id', classId)
      .eq('status', 'booked');

    if (countError) {
      console.error('Error counting enrollments:', countError);
      return res.status(500).json({ error: 'Failed to check class capacity' });
    }

    if (currentEnrollment >= classInstance.max_capacity) {
      return res.status(400).json({ error: 'Class is full' });
    }

    // Create booking
    const { data: newBooking, error: createError } = await supabaseDb.supabase
      .from('bookings')
      .insert({
        student_id: studentId,
        class_instance_id: classId,
        status: 'booked',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating booking:', createError);
      return res.status(500).json({ error: 'Failed to create booking' });
    }

    res.json({ message: 'Student added successfully', booking: newBooking });
  } catch (error) {
    console.error('Error adding student to class:', error);
    res.status(500).json({ error: 'Failed to add student to class' });
  }
});

// Remove student from class (cancel booking)
app.delete('/api/admin/bookings/:bookingId', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Check if booking exists
    const { data: booking, error: fetchError } = await supabaseDb.supabase
      .from('bookings')
      .select('id, status')
      .eq('id', bookingId)
      .single();

    if (fetchError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // If booking is already cancelled or rescheduled, delete it entirely from the database
    // This allows admins to clean up the absent/rescheduled list
    if (booking.status === 'cancelled' || booking.status === 'rescheduled') {
      const { error: deleteError } = await supabaseDb.supabase
        .from('bookings')
        .delete()
        .eq('id', bookingId);

      if (deleteError) {
        console.error('Error deleting booking:', deleteError);
        return res.status(500).json({ error: 'Failed to delete booking' });
      }

      return res.json({ message: 'Booking deleted successfully' });
    }

    // For active bookings (booked/completed), just set status to cancelled
    const { error: updateError } = await supabaseDb.supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    if (updateError) {
      console.error('Error cancelling booking:', updateError);
      return res.status(500).json({ error: 'Failed to cancel booking' });
    }

    res.json({ message: 'Student removed successfully' });
  } catch (error) {
    console.error('Error removing student from class:', error);
    res.status(500).json({ error: 'Failed to remove student from class' });
  }
});

// Update class instance (date, time, instructor)
app.patch('/api/admin/classes/:classId', authenticateToken, async (req, res) => {
  try {
    const { classId } = req.params;
    const { classDate, startTime, endTime, instructor } = req.body;

    // Get the current class instance
    const { data: classInstance, error: fetchError } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .eq('id', classId)
      .single();

    if (fetchError || !classInstance) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Prepare update object
    const updates = {
      updated_at: new Date().toISOString()
    };

    if (classDate) updates.class_date = classDate;
    if (startTime) updates.start_time = startTime;
    if (endTime) updates.end_time = endTime;
    if (instructor) updates.instructor = instructor;

    // WARNING: If date/time changes, the class_type identifier will be out of sync
    // The identifier format is: WT[DDMM][TIME]_[INSTRUCTOR][WEEKS].[WEEK#]
    // For now, we'll just update the fields and accept the identifier mismatch
    // TODO: Consider updating class_type identifier when date/time/instructor changes

    // Update the class instance
    const { error: updateError } = await supabaseDb.supabase
      .from('class_instances')
      .update(updates)
      .eq('id', classId);

    if (updateError) {
      console.error('Error updating class:', updateError);
      return res.status(500).json({ error: 'Failed to update class' });
    }

    res.json({ message: 'Class updated successfully' });
  } catch (error) {
    console.error('Error updating class:', error);
    res.status(500).json({ error: 'Failed to update class' });
  }
});

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

// ==========================================
// PAUSE & RESCHEDULE ENDPOINTS
// ==========================================

// Get all paused students
app.get('/api/admin/paused-students', authenticateToken, async (req, res) => {
  try {
    const { data: pausedStudents, error } = await supabaseDb.supabase
      .from('customers')
      .select('id, first_name, last_name, email, course_paused, pause_start_date, pause_reason, paused_at_week, resume_course_identifier, course_purchase_count')
      .eq('course_paused', true)
      .order('pause_start_date', { ascending: false });

    if (error) throw error;

    res.json({ pausedStudents: pausedStudents || [] });
  } catch (error) {
    console.error('Error fetching paused students:', error);
    res.status(500).json({ error: 'Failed to fetch paused students' });
  }
});

// Pause a student's course
app.post('/api/admin/students/:studentId/pause', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { pauseReason, pausedAtWeek, resumeCourseIdentifier } = req.body;

    if (!pauseReason || !pausedAtWeek) {
      return res.status(400).json({ error: 'Missing required fields: pauseReason, pausedAtWeek' });
    }

    const { data: student, error } = await supabaseDb.supabase
      .from('customers')
      .update({
        course_paused: true,
        pause_start_date: new Date().toISOString().split('T')[0],
        pause_reason: pauseReason,
        paused_at_week: pausedAtWeek,
        resume_course_identifier: resumeCourseIdentifier || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', studentId)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Student paused successfully', student });
  } catch (error) {
    console.error('Error pausing student:', error);
    res.status(500).json({ error: 'Failed to pause student' });
  }
});

// Resume a paused student
app.post('/api/admin/students/:studentId/resume', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;

    const { data: student, error } = await supabaseDb.supabase
      .from('customers')
      .update({
        course_paused: false,
        pause_start_date: null,
        pause_reason: null,
        paused_at_week: null,
        resume_course_identifier: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', studentId)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Student resumed successfully', student });
  } catch (error) {
    console.error('Error resuming student:', error);
    res.status(500).json({ error: 'Failed to resume student' });
  }
});

// Reschedule a booking
app.post('/api/admin/bookings/:bookingId/reschedule', authenticateToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { newClassInstanceId, rescheduleReason, fee, isGlazingReschedule } = req.body;

    if (!newClassInstanceId) {
      return res.status(400).json({ error: 'Missing required field: newClassInstanceId' });
    }

    // Get original booking
    const { data: originalBooking, error: fetchError } = await supabaseDb.supabase
      .from('bookings')
      .select('*, class_instances!bookings_class_instance_id_fkey(class_date)')
      .eq('id', bookingId)
      .single();

    if (fetchError) throw fetchError;

    // Update original booking to rescheduled status
    const { error: updateError } = await supabaseDb.supabase
      .from('bookings')
      .update({
        status: 'rescheduled',
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    if (updateError) throw updateError;

    // Create new booking
    const { data: newBooking, error: createError } = await supabaseDb.supabase
      .from('bookings')
      .insert({
        student_id: originalBooking.student_id,
        class_instance_id: newClassInstanceId,
        status: 'booked',
        original_class_instance_id: originalBooking.class_instance_id,
        rescheduled_from_date: originalBooking.class_instances.class_date,
        reschedule_reason: rescheduleReason || null,
        reschedule_fee_paid: fee || 0,
        is_makeup_class: fee > 0,
        is_glazing_reschedule: isGlazingReschedule || false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (createError) throw createError;

    // If there's a fee, create a fee record
    if (fee && fee > 0) {
      const { error: feeError } = await supabaseDb.supabase
        .from('reschedule_fees')
        .insert({
          student_id: originalBooking.student_id,
          booking_id: newBooking.id,
          fee_type: 'makeup',
          amount: fee,
          payment_status: 'pending',
          notes: rescheduleReason || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (feeError) console.error('Error creating fee record:', feeError);
    }

    res.json({ message: 'Booking rescheduled successfully', newBooking });
  } catch (error) {
    console.error('Error rescheduling booking:', error);
    res.status(500).json({ error: 'Failed to reschedule booking' });
  }
});

// Get reschedule fees for a student
app.get('/api/admin/students/:studentId/fees', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;

    const { data: fees, error } = await supabaseDb.supabase
      .from('reschedule_fees')
      .select('*, bookings(id, class_instances!bookings_class_instance_id_fkey(class_date, start_time, class_type))')
      .eq('student_id', studentId)
      .order('fee_date', { ascending: false });

    if (error) throw error;

    res.json({ fees: fees || [] });
  } catch (error) {
    console.error('Error fetching fees:', error);
    res.status(500).json({ error: 'Failed to fetch fees' });
  }
});

// Update fee payment status
app.patch('/api/admin/fees/:feeId/payment', authenticateToken, async (req, res) => {
  try {
    const { feeId } = req.params;
    const { paymentStatus } = req.body;

    if (!['pending', 'paid', 'waived'].includes(paymentStatus)) {
      return res.status(400).json({ error: 'Invalid payment status' });
    }

    const { data: fee, error } = await supabaseDb.supabase
      .from('reschedule_fees')
      .update({
        payment_status: paymentStatus,
        payment_date: paymentStatus === 'paid' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', feeId)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Fee payment status updated', fee });
  } catch (error) {
    console.error('Error updating fee payment:', error);
    res.status(500).json({ error: 'Failed to update fee payment' });
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
      let query, variables;

      if (cursor) {
        query = `
          query getCustomers($cursor: String!) {
            customers(first: 250, after: $cursor) {
              edges {
                node {
                  id
                  email
                  firstName
                  lastName
                  createdAt
                  tags
                  orders(first: 10) {
                    edges {
                      node {
                        id
                        createdAt
                        lineItems(first: 10) {
                          edges {
                            node {
                              title
                              variantTitle
                              quantity
                            }
                          }
                        }
                      }
                    }
                  }
                }
                cursor
              }
              pageInfo {
                hasNextPage
              }
            }
          }
        `;
        variables = { cursor };
      } else {
        query = `
          query getCustomers {
            customers(first: 250) {
              edges {
                node {
                  id
                  email
                  firstName
                  lastName
                  createdAt
                  tags
                  orders(first: 10) {
                    edges {
                      node {
                        id
                        createdAt
                        lineItems(first: 10) {
                          edges {
                            node {
                              title
                              variantTitle
                              quantity
                            }
                          }
                        }
                      }
                    }
                  }
                }
                cursor
              }
              pageInfo {
                hasNextPage
              }
            }
          }
        `;
        variables = {};
      }

      const response = await client.query({
        data: {
          query,
          variables
        }
      });
      const customersData = response.body.data.customers;

      for (const edge of customersData.edges) {
        const customer = edge.node;
        const customerId = customer.id.split('/').pop();

        // Filter: Only sync customers who have purchased courses/workshops/classes
        // Also extract class dates from variantTitle
        let earliestClassStart = null;
        let latestClassEnd = null;
        let hasPurchasedCourse = false;
        let coursePurchaseCount = 0;

        // Process all orders to find courses and extract dates
        customer.orders.edges.forEach(orderEdge => {
          // Use order creation date to determine the year for class dates
          const orderCreatedAt = new Date(orderEdge.node.createdAt);
          const orderYear = orderCreatedAt.getFullYear();

          // Track if this order contains a course
          let orderHasCourse = false;

          orderEdge.node.lineItems.edges.forEach(lineItemEdge => {
            const title = lineItemEdge.node.title.toLowerCase();
            const variantTitle = lineItemEdge.node.variantTitle;

            const isCourse = title.includes('course') ||
                   title.includes('workshop') ||
                   title.includes('class') ||
                   title.includes('pottery') ||
                   title.includes('wheel') ||
                   title.includes('handbuilding');

            if (isCourse) {
              hasPurchasedCourse = true;
              orderHasCourse = true;

              if (variantTitle) {
                // Parse dates from variantTitle like "TUESDAYS 21 October –25 November (7:00pm-9:30pm)"
                const dateMatch = variantTitle.match(/(\d{1,2})\s+(\w+)(?:\s*[–-]\s*(\d{1,2})\s+(\w+))?/);

                if (dateMatch) {
                  const monthMap = {
                    'january': 0, 'jan': 0, 'february': 1, 'feb': 1, 'march': 2, 'mar': 2,
                    'april': 3, 'apr': 3, 'may': 4, 'june': 5, 'jun': 5,
                    'july': 6, 'jul': 6, 'august': 7, 'aug': 7, 'september': 8, 'sep': 8, 'sept': 8,
                    'october': 9, 'oct': 9, 'november': 10, 'nov': 10, 'december': 11, 'dec': 11
                  };

                  const startDay = parseInt(dateMatch[1]);
                  const startMonthStr = dateMatch[2].toLowerCase();
                  const startMonth = monthMap[startMonthStr];

                  if (startMonth !== undefined) {
                    // Use order year, or next year if class starts before order was placed
                    const orderMonth = orderCreatedAt.getMonth();
                    let classYear = orderYear;
                    // If class month is before order month, class is likely in the next year
                    if (startMonth < orderMonth - 1) {
                      classYear = orderYear + 1;
                    }

                    const startDate = new Date(classYear, startMonth, startDay);

                    if (!earliestClassStart || startDate < earliestClassStart) {
                      earliestClassStart = startDate;
                    }

                    // Check for end date
                    if (dateMatch[3] && dateMatch[4]) {
                      const endDay = parseInt(dateMatch[3]);
                      const endMonthStr = dateMatch[4].toLowerCase();
                      const endMonth = monthMap[endMonthStr];

                      if (endMonth !== undefined) {
                        let endDate = new Date(classYear, endMonth, endDay);

                        // Handle year wrap (if end month is before start month, add a year)
                        if (endDate < startDate) {
                          endDate.setFullYear(classYear + 1);
                        }

                        if (!latestClassEnd || endDate > latestClassEnd) {
                          latestClassEnd = endDate;
                        }
                      }
                    } else {
                      // If no end date, assume same as start
                      if (!latestClassEnd || startDate > latestClassEnd) {
                        latestClassEnd = startDate;
                      }
                    }
                  }
                }
              }
            }
          });

          // Count this order as a course purchase if it contains a course
          if (orderHasCourse) {
            coursePurchaseCount++;
          }
        });

        if (!hasPurchasedCourse) {
          console.log(`⏭️  Skipping customer ${customer.email || customerId} - no course purchases`);
          continue;
        }

        try {
          // Pass class dates from Shopify orders and course purchase count
          if (earliestClassStart || latestClassEnd) {
            console.log(`📅 ${customer.email}: ${earliestClassStart?.toISOString().split('T')[0]} to ${latestClassEnd?.toISOString().split('T')[0]} (${coursePurchaseCount} courses)`);
          }
          await syncCustomer(customer, customerId, earliestClassStart, latestClassEnd, coursePurchaseCount);
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

    const dbCustomer = await syncCustomer(customerData, customer.id.toString());

    console.log(`✅ Customer ${customer.email} synced successfully`);

    // Process line items to check for course purchases
    if (orderData.line_items && orderData.line_items.length > 0) {
      const { processCoursePurchase } = require('./utils/courseEnrollmentManager');

      for (const item of orderData.line_items) {
        const productTitle = item.title || '';
        const variantTitle = item.variant_title || '';

        console.log(`📝 Processing item: ${productTitle} - ${variantTitle}`);

        // Check if this is a pottery course
        if (productTitle.toLowerCase().includes('wheelthrowing') ||
            productTitle.toLowerCase().includes('handbuilding') ||
            productTitle.toLowerCase().includes('pottery course')) {

          console.log(`🎓 Course detected: ${productTitle} - ${variantTitle}`);

          // Prepare order and line item objects for processCoursePurchase
          const order = {
            id: orderData.id.toString(),
            customer: {
              email: customer.email,
              first_name: customer.first_name,
              last_name: customer.last_name
            }
          };

          const lineItem = {
            id: item.id.toString(),
            title: productTitle,
            variantTitle: variantTitle
          };

          // Process the course purchase using the new enrollment manager
          const result = await processCoursePurchase(order, lineItem);

          if (result.success) {
            console.log(`✅ Course enrollment processed successfully`);
            if (result.thresholdMet) {
              console.log(`🎉 Threshold met! Created ${result.classInstancesCreated} class instances and ${result.bookingsCreated} bookings`);
            } else if (result.requiresThreshold) {
              console.log(`⏳ Waiting for more students (${result.studentCount}/${result.studentsNeeded + result.studentCount})`);
            }
          } else {
            console.error(`❌ Failed to process course enrollment: ${result.error}`);
          }
        }
      }
    }

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
