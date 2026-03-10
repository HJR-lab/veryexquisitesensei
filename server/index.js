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
    /https:\/\/pottery-gallery-app.*\.vercel\.app$/,
    'https://frontend-phi-seven-81.vercel.app',
    /https:\/\/frontend-.*\.vercel\.app$/
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
  // Prioritize Authorization header over cookie (for impersonation to work)
  const token = req.headers.authorization?.split(' ')[1] || req.cookies.token;

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

// ============================================
// AUTH ENDPOINTS
// ============================================

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔐 Login attempt for email:', email);

    if (!email || !password) {
      console.log('❌ Missing email or password');
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Check if this is admin login
    const isAdminEmail = email === 'info@ves.sg';

    if (isAdminEmail) {
      // Verify admin password against bcrypt hash from environment
      const isValidAdmin = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
      if (!isValidAdmin) {
        console.error('❌ Invalid admin password attempt');
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      console.log('✅ Admin login successful:', email);
    } else {
      // Student login - verify password from database
      console.log('📊 Querying database for customer...');
      const { data: customer, error: customerError } = await supabaseDb.supabase
        .from('customers')
        .select('id, email, first_name, last_name, password_hash, shopify_customer_id, role')
        .eq('email', email.toLowerCase())
        .single();

      console.log('📊 Database query result:', { found: !!customer, error: !!customerError });

      if (customerError || !customer) {
        console.log('❌ Customer not found or error:', customerError);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      console.log('📊 Customer has password_hash:', !!customer.password_hash);

      if (!customer.password_hash) {
        console.log('❌ No password hash - needs verification');
        return res.status(401).json({
          error: 'Please verify your email first',
          needsVerification: true
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, customer.password_hash);
      console.log('🔑 Password check for', email, ':', isValidPassword ? 'VALID' : 'INVALID');
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      console.log('✅ Student login successful:', email);

      // Create JWT token for student
      const token = jwt.sign(
        {
          customerId: customer.shopify_customer_id,
          dbCustomerId: customer.id,
          email: customer.email,
          firstName: customer.first_name,
          lastName: customer.last_name,
          isAdmin: false
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

      // Fetch membership and enrollment info for smart redirect
      const [hasMembership, activeEnrollmentRes] = await Promise.all([
        supabaseDb.hasActiveMembership(customer.id),
        supabaseDb.supabase
          .from('course_enrollments')
          .select('id')
          .eq('student_id', customer.id)
          .in('status', ['active', 'pending'])
          .limit(1)
      ]);
      const hasActiveEnrollments = (activeEnrollmentRes.data || []).length > 0;

      // Fetch customer_type
      const { data: custRecord } = await supabaseDb.supabase
        .from('customers')
        .select('customer_type')
        .eq('id', customer.id)
        .single();

      return res.json({
        success: true,
        user: {
          id: customer.shopify_customer_id,
          dbId: customer.id,
          email: customer.email,
          firstName: customer.first_name,
          lastName: customer.last_name,
          role: customer.role || 'student',
          isAdmin: false,
          hasMembership,
          hasActiveEnrollments,
          customerType: custRecord?.customer_type || 'student'
        },
        token
      });
    }

    // Admin login - get or create admin customer in database
    let { data: customer, error: dbError } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', email)
      .single();

    // If admin doesn't exist in database, create it or update old admin email
    if (dbError || !customer) {
      console.log('Admin not found in database, checking for old admin...');

      // First, try to find and update the old admin (info@ves.com)
      const { data: oldAdmin } = await supabaseDb.supabase
        .from('customers')
        .select('*')
        .eq('email', 'info@ves.com')
        .single();

      if (oldAdmin) {
        // Update the old admin email to the new one
        console.log('Updating old admin email from info@ves.com to info@ves.sg');
        const { data: updatedAdmin, error: updateError } = await supabaseDb.supabase
          .from('customers')
          .update({
            email: 'info@ves.sg',
            updated_at: new Date().toISOString()
          })
          .eq('id', oldAdmin.id)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating admin:', updateError);
          return res.status(500).json({ error: 'Failed to update admin user' });
        }

        customer = updatedAdmin;
        console.log('✅ Updated admin email successfully');
      } else {
        // Create new admin with different shopify_customer_id
        console.log('Creating new admin user...');
        const { data: newCustomer, error: createError } = await supabaseDb.supabase
          .from('customers')
          .insert({
            shopify_customer_id: '9999999999998', // Different ID to avoid conflict
            email: 'info@ves.sg',
            first_name: 'VES',
            last_name: 'Admin',
            customer_type: 'admin',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating admin:', createError);
          console.error('Error details:', JSON.stringify(createError, null, 2));
          return res.status(500).json({ error: 'Failed to create admin user', details: createError.message });
        }

        customer = newCustomer;
        console.log('✅ Created new admin user in database');
      }
    }

    // Create JWT token for admin
    const token = jwt.sign(
      {
        customerId: customer.shopify_customer_id,
        dbCustomerId: customer.id,
        email: customer.email,
        firstName: customer.first_name,
        lastName: customer.last_name,
        isAdmin: true
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
        id: customer.shopify_customer_id,
        dbId: customer.id,
        email: customer.email,
        firstName: customer.first_name,
        lastName: customer.last_name,
        isAdmin: true
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    console.error('Error details:', error.message);
    res.status(500).json({ error: 'Login failed', debug: error.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  return res.status(403).json({
    error: 'Registration is disabled. Please contact VES staff to be added as a customer.'
  });
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    // Fetch latest user data from database to include course_purchase_count
    const { data: customer, error } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('id', dbCustomerId)
      .single();

    if (error || !customer) {
      // Fallback to JWT data if database fetch fails
      return res.json({ user: req.user });
    }

    // Fetch membership and enrollment info
    const [hasMembership, activeEnrollmentRes] = await Promise.all([
      supabaseDb.hasActiveMembership(customer.id),
      supabaseDb.supabase
        .from('course_enrollments')
        .select('id')
        .eq('student_id', customer.id)
        .in('status', ['active', 'pending'])
        .limit(1)
    ]);
    const hasActiveEnrollments = (activeEnrollmentRes.data || []).length > 0;

    // Return user data with snake_case fields mapped to camelCase for frontend
    res.json({
      user: {
        customerId: customer.shopify_customer_id,
        dbCustomerId: customer.id,
        email: customer.email,
        firstName: customer.first_name,
        lastName: customer.last_name,
        mobile: customer.phone,
        dateOfBirth: customer.date_of_birth,
        profilePicture: customer.profile_picture,
        coursePurchaseCount: customer.course_purchase_count || 0,
        classesAllocated: customer.classes_allocated || 0,
        classesUsed: customer.classes_used || 0,
        role: customer.role || 'student',
        isAdmin: req.user.isAdmin || false,
        isImpersonating: req.user.isImpersonating || false,
        impersonatedBy: req.user.impersonatedBy,
        hasMembership,
        hasActiveEnrollments,
        customerType: customer.customer_type || 'student'
      }
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.json({ user: req.user });
  }
});

// Admin impersonation endpoint
app.post('/api/auth/impersonate/:email', authenticateToken, async (req, res) => {
  try {
    // Verify the requester is an admin
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const studentEmail = decodeURIComponent(req.params.email);
    console.log('🎭 Admin impersonation request for:', studentEmail);

    // Look up the student
    const { data: student, error } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', studentEmail)
      .single();

    if (error || !student) {
      console.log('❌ Student not found:', studentEmail);
      return res.status(404).json({ error: 'Student not found' });
    }

    // Create JWT token for the student (with impersonation flag)
    // Note: we do NOT embed the admin token here for security reasons.
    // Instead, the stop-impersonation endpoint re-issues a fresh admin token.
    const impersonationToken = jwt.sign(
      {
        customerId: student.shopify_customer_id,
        dbCustomerId: student.id,
        email: student.email,
        firstName: student.first_name,
        lastName: student.last_name,
        isAdmin: false,
        isImpersonating: true,
        impersonatedBy: req.user.email // Track who is impersonating
      },
      JWT_SECRET,
      { expiresIn: '1d' } // Shorter expiry for impersonation
    );

    console.log('✅ Impersonation token created for:', studentEmail);

    res.json({
      success: true,
      token: impersonationToken,
      student: {
        id: student.shopify_customer_id,
        dbId: student.id,
        email: student.email,
        firstName: student.first_name,
        lastName: student.last_name
      }
    });

  } catch (error) {
    console.error('❌ Impersonation error:', error);
    res.status(500).json({ error: 'Impersonation failed' });
  }
});

// Stop impersonation — re-issues a fresh admin token
app.post('/api/auth/stop-impersonation', authenticateToken, async (req, res) => {
  try {
    // Verify this is an impersonation session
    if (!req.user.isImpersonating || !req.user.impersonatedBy) {
      return res.status(400).json({ error: 'Not currently impersonating' });
    }

    // Verify the original user was an admin
    const adminEmail = req.user.impersonatedBy;
    if (adminEmail !== 'info@ves.sg') {
      return res.status(403).json({ error: 'Original user is not an admin' });
    }

    // Look up the admin customer record to issue a fresh token
    const { data: adminCustomer, error } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('email', adminEmail)
      .single();

    if (error || !adminCustomer) {
      console.error('❌ Admin customer not found for stop-impersonation:', adminEmail);
      return res.status(500).json({ error: 'Admin account not found' });
    }

    // Issue a fresh admin JWT (same structure as admin login)
    const token = jwt.sign(
      {
        customerId: adminCustomer.shopify_customer_id,
        dbCustomerId: adminCustomer.id,
        email: adminCustomer.email,
        firstName: adminCustomer.first_name,
        lastName: adminCustomer.last_name,
        isAdmin: true
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('🎭 Impersonation ended, admin token re-issued for:', adminEmail);

    res.json({
      success: true,
      token,
      user: {
        email: adminCustomer.email,
        firstName: adminCustomer.first_name,
        lastName: adminCustomer.last_name,
        isAdmin: true
      }
    });

  } catch (error) {
    console.error('❌ Stop impersonation error:', error);
    res.status(500).json({ error: 'Failed to stop impersonation' });
  }
});

// Get current student's data (for student dashboard)
app.get('/api/students/me', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    const { data: student, error } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('id', dbCustomerId)
      .single();

    if (error || !student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Calculate classes_allocated from active enrollments only (not lifetime cumulative)
    const { data: activeEnrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id, number_of_weeks')
      .eq('student_id', dbCustomerId)
      .eq('status', 'active');

    if (activeEnrollments && activeEnrollments.length > 0) {
      student.classes_allocated = activeEnrollments.reduce((sum, e) => sum + (e.number_of_weeks || 0), 0);
    }

    // Calculate classes used from ALL BOOKINGS (enrollment + makeup)
    // classes_used = classes that have ENDED (end time has passed)

    // Get ALL bookings for this student (both enrollment and makeup classes)
    // Use explicit relationship to avoid ambiguity with original_class_instance_id
    const { data: allBookings } = await supabaseDb.supabase
      .from('bookings')
      .select('id, status, class_instance:class_instances!bookings_class_instance_id_fkey(class_date, end_time)')
      .eq('student_id', dbCustomerId)
      .in('status', ['booked', 'attended']);

    if (allBookings && allBookings.length > 0) {
      // Count classes that have ended (end time has passed)
      const now = new Date();
      const endedCount = allBookings.filter(b => {
        if (!b.class_instance) return false;
        const classDate = b.class_instance.class_date.split('T')[0];
        const endTime = b.class_instance.end_time;

        // Parse end time (e.g., "9:30pm")
        const timeParts = endTime.match(/(\d+):(\d+)(am|pm)/i);
        if (!timeParts) return false;

        let hours = parseInt(timeParts[1]);
        const minutes = parseInt(timeParts[2]);
        const period = timeParts[3].toLowerCase();

        if (period === 'pm' && hours !== 12) hours += 12;
        if (period === 'am' && hours === 12) hours = 0;

        const [year, month, day] = classDate.split('-');
        const classEndDateTime = new Date(year, month - 1, day, hours, minutes);

        return classEndDateTime < now;
      }).length;

      student.classes_used = endedCount;
    } else {
      student.classes_used = 0;
    }

    res.json({ student });
  } catch (error) {
    console.error('Error fetching student data:', error);
    res.status(500).json({ error: 'Failed to fetch student data' });
  }
});

// Get structured dashboard data for student (enrollments grouped by status)
app.get('/api/students/me/dashboard', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    // Get student data
    const { data: student, error: studentError } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('id', dbCustomerId)
      .single();

    if (studentError || !student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get only active enrollments for this student
    const { data: enrollments, error: enrollmentsError } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', dbCustomerId)
      .eq('status', 'active')
      .order('course_start_date', { ascending: true });

    if (enrollmentsError) {
      console.error('Error fetching enrollments:', enrollmentsError);
      return res.status(500).json({ error: 'Failed to fetch enrollments' });
    }

    // Get all bookings with class details
    const { data: bookings, error: bookingsError } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          id,
          class_type,
          class_date,
          start_time,
          end_time,
          instructor,
          room
        )
      `)
      .eq('student_id', dbCustomerId)
      .in('status', ['booked', 'attended', 'completed'])
      .order('class_instances(class_date)', { ascending: true });

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      return res.status(500).json({ error: 'Failed to fetch bookings' });
    }

    // Group bookings by enrollment
    const bookingsByEnrollment = {};
    bookings.forEach(booking => {
      const enrollmentId = booking.course_enrollment_id;
      if (!bookingsByEnrollment[enrollmentId]) {
        bookingsByEnrollment[enrollmentId] = [];
      }
      bookingsByEnrollment[enrollmentId].push(booking);
    });

    // Helper function to determine enrollment status
    const getEnrollmentStatus = (enrollment, bookingsForEnrollment) => {
      if (!bookingsForEnrollment || bookingsForEnrollment.length === 0) {
        return 'pending'; // No bookings yet = pending schedule
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allDates = bookingsForEnrollment.map(b => new Date(b.class_instances.class_date));
      const earliestDate = new Date(Math.min(...allDates));
      const latestDate = new Date(Math.max(...allDates));

      earliestDate.setHours(0, 0, 0, 0);
      latestDate.setHours(0, 0, 0, 0);

      // Special logic for package courses: if it's a 3-course package, treat as upcoming
      if (enrollment.package_total_courses && enrollment.package_total_courses > 1) {
        // Package courses should show as upcoming if their classes start in the future
        if (earliestDate > today) {
          return 'upcoming';
        }
        // Even if some classes are current/past, if most classes are future, show as upcoming
        const futureClasses = allDates.filter(date => {
          const d = new Date(date);
          d.setHours(0, 0, 0, 0);
          return d > today;
        });
        if (futureClasses.length >= allDates.length / 2) {
          return 'upcoming';
        }
      }

      // All classes in the future = upcoming
      if (earliestDate > today) {
        return 'upcoming';
      }

      // All classes in the past = completed
      if (latestDate < today) {
        return 'completed';
      }

      // Some past, some future = active
      return 'active';
    };

    // Process enrollments into categories
    const activeEnrollments = [];
    const upcomingEnrollments = [];
    const completedEnrollments = [];
    const pendingEnrollments = [];

    // Track package info
    let packageInfo = null;

    enrollments.forEach(enrollment => {
      const bookingsForEnrollment = bookingsByEnrollment[enrollment.id] || [];
      const status = getEnrollmentStatus(enrollment, bookingsForEnrollment);

      const enrollmentWithBookings = {
        ...enrollment,
        bookings: bookingsForEnrollment,
        computedStatus: status
      };

      // Check if this is part of a package
      if (enrollment.package_total_courses) {
        if (!packageInfo) {
          const currentCourse = enrollment.package_total_courses - (enrollment.package_courses_remaining || 0);
          packageInfo = {
            totalCourses: enrollment.package_total_courses,
            totalClasses: enrollment.package_total_classes,
            coursesRemaining: enrollment.package_courses_remaining || 0,
            currentCourse: currentCourse,
            coursesCompleted: currentCourse - 1
          };
        }
      }

      switch (status) {
        case 'active':
          activeEnrollments.push(enrollmentWithBookings);
          break;
        case 'upcoming':
          upcomingEnrollments.push(enrollmentWithBookings);
          break;
        case 'completed':
          completedEnrollments.push(enrollmentWithBookings);
          break;
        case 'pending':
          pendingEnrollments.push(enrollmentWithBookings);
          break;
      }
    });

    // Calculate total classes allocated from ACTIVE enrollments only
    const totalClassesAllocated = enrollments.reduce((sum, e) => {
      return sum + (e.number_of_weeks || 6);
    }, 0);

    // Separate past and current/future bookings
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pastBookings = bookings.filter(b => {
      if (b.status === 'cancelled') return false;
      const classDate = new Date(b.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      return classDate < today;
    });

    const currentAndFutureBookings = bookings.filter(b => {
      if (b.status === 'cancelled') return false;
      const classDate = new Date(b.class_instances.class_date);
      classDate.setHours(0, 0, 0, 0);
      return classDate >= today; // Only current and future classes
    });

    // Count past classes as attended — only from active enrollments
    const activeEnrollmentIds = new Set(enrollments.map(e => e.id));
    const attendedFromActiveCourses = pastBookings.filter(b =>
      activeEnrollmentIds.has(b.course_enrollment_id)
    ).length;

    // Remaining = future booked classes (classes that are booked but not yet attended)
    const remaining = currentAndFutureBookings.length;
    const totalBooked = remaining + attendedFromActiveCourses;
    const available = totalClassesAllocated - totalBooked;

    // Calculate credits remaining (for pending courses)
    const creditsRemaining = pendingEnrollments.length * 6; // Assume 6 classes per pending course

    // Calculate flexible credits (for 10-class packages)
    let flexibleCreditsInfo = null;
    const totalFlexibleAllocated = enrollments.reduce((sum, e) => sum + (e.flexible_credits_allocated || 0), 0);
    const totalFlexibleUsed = enrollments.reduce((sum, e) => sum + (e.flexible_credits_used || 0), 0);
    const totalFlexibleRemaining = enrollments.reduce((sum, e) => sum + (e.flexible_credits_remaining || 0), 0);

    if (totalFlexibleAllocated > 0) {
      flexibleCreditsInfo = {
        allocated: totalFlexibleAllocated,
        used: totalFlexibleUsed,
        remaining: totalFlexibleRemaining
      };
    }

    // HB enrollments with remaining credits (for HB booking section)
    const hbEnrollments = enrollments
      .filter(e =>
        (e.course_type || '').toLowerCase().includes('handbuilding') &&
        (e.class_credits_remaining || 0) > 0
      )
      .map(e => ({
        id: e.id,
        courseTitle: e.course_title,
        courseType: e.course_type,
        creditsAllocated: e.class_credits_allocated || 0,
        creditsUsed: e.class_credits_used || 0,
        creditsRemaining: e.class_credits_remaining || 0,
        status: e.status,
        courseStartDate: e.course_start_date,
        courseEndDate: e.course_end_date,
        numberOfWeeks: e.number_of_weeks
      }));

    res.json({
      student,
      stats: {
        totalClassesAllocated,
        totalBooked,
        attended: attendedFromActiveCourses,
        remaining,
        available,
        creditsRemaining
      },
      packageInfo,
      flexibleCreditsInfo,
      hbEnrollments,
      studioAccessPasses: await getStudioAccessPasses(dbCustomerId),
      enrollments: {
        active: activeEnrollments,
        upcoming: upcomingEnrollments,
        completed: completedEnrollments,
        pending: pendingEnrollments
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// Update user profile
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { firstName, lastName, email, mobile, dateOfBirth, profilePicture } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: 'First name, last name, and email are required' });
    }

    // Check if email is already taken by another user
    if (email !== req.user.email) {
      const { data: existingUser } = await supabase
        .from('customers')
        .select('id')
        .eq('email', email)
        .neq('id', dbCustomerId)
        .single();

      if (existingUser) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }

    // Update customer in database
    const updateData = {
      first_name: firstName,
      last_name: lastName,
      email: email,
      mobile: mobile || null,
      date_of_birth: dateOfBirth || null,
      updated_at: new Date().toISOString()
    };

    // Only update profile_picture if it's provided in the request
    if (profilePicture !== undefined) {
      updateData.profile_picture = profilePicture || null;
    }

    const { data: updatedCustomer, error } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', dbCustomerId)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    // Generate new token with updated info
    const token = jwt.sign(
      {
        customerId: req.user.customerId,
        dbCustomerId: dbCustomerId,
        email: updatedCustomer.email,
        firstName: updatedCustomer.first_name,
        lastName: updatedCustomer.last_name
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        customerId: req.user.customerId,
        dbCustomerId: dbCustomerId,
        email: updatedCustomer.email,
        firstName: updatedCustomer.first_name,
        lastName: updatedCustomer.last_name,
        mobile: updatedCustomer.mobile,
        dateOfBirth: updatedCustomer.date_of_birth,
        profilePicture: updatedCustomer.profile_picture
      }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Get current password hash from database
    const { data: customer, error: fetchError } = await supabase
      .from('customers')
      .select('password_hash')
      .eq('id', dbCustomerId)
      .single();

    if (fetchError || !customer) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!customer.password_hash) {
      return res.status(400).json({ error: 'No password set. Please contact support.' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, customer.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password in database
    const { error: updateError } = await supabase
      .from('customers')
      .update({
        password_hash: newPasswordHash,
        updated_at: new Date().toISOString()
      })
      .eq('id', dbCustomerId);

    if (updateError) {
      console.error('Error updating password:', updateError);
      return res.status(500).json({ error: 'Failed to update password' });
    }

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ============================================
// EMAIL VERIFICATION ENDPOINTS (Student First-Time Login)
// ============================================

// Request email verification (send 6-digit PIN)
app.post('/api/auth/request-verification', pinLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    console.log('🔔 Verification request for:', email);

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find customer by email
    const { data: customer, error: customerError } = await supabaseDb.supabase
      .from('customers')
      .select('id, email, first_name, last_name, password_hash')
      .eq('email', email.toLowerCase())
      .single();

    console.log('Database response:', { customer: customer ? 'found' : 'not found', error: customerError });

    if (customerError || !customer) {
      console.log('❌ Customer not found or error:', customerError);
      return res.status(404).json({ error: 'No account found with this email address' });
    }

    // Check if customer already has a password set
    if (customer.password_hash) {
      return res.status(400).json({
        error: 'Account already verified. Please use the login page.',
        hasPassword: true
      });
    }

    // Generate random 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Set expiration to 24 hours from now (workaround for timezone issue)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Delete any existing unverified codes for this customer
    await supabaseDb.supabase
      .from('verification_codes')
      .delete()
      .eq('customer_id', customer.id)
      .eq('verified', false);

    // Store verification code
    const { error: insertError } = await supabaseDb.supabase
      .from('verification_codes')
      .insert({
        customer_id: customer.id,
        email: email.toLowerCase(),
        code: code,
        verified: false,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Error storing verification code:', insertError);
      return res.status(500).json({ error: 'Failed to generate verification code' });
    }

    // TODO: Send email with verification code
    // For now, log it to console (in production, use nodemailer or SendGrid)
    console.log('\n📧 Verification Code for', email);
    console.log('👤 Name:', customer.first_name, customer.last_name);
    console.log('🔢 Code:', code);
    console.log('⏰ Expires:', expiresAt.toLocaleString());
    console.log('\n');

    res.json({
      success: true,
      message: 'Verification code sent to your email',
      // In development, return the code for testing
      ...(process.env.NODE_ENV !== 'production' && { code })
    });

  } catch (error) {
    console.error('Error requesting verification:', error);
    res.status(500).json({ error: 'Failed to request verification' });
  }
});

// Verify PIN code
app.post('/api/auth/verify-pin', pinLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and verification code are required' });
    }

    // Find verification code
    const { data: verification, error: verifyError } = await supabaseDb.supabase
      .from('verification_codes')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('code', code)
      .eq('verified', false)
      .single();

    if (verifyError || !verification) {
      return res.status(401).json({ error: 'Invalid or expired verification code' });
    }

    // Check if code has expired
    const expiresAt = new Date(verification.expires_at);
    const now = new Date();
    console.log('⏰ Expiration check:', {
      expires_at: expiresAt.toISOString(),
      now: now.toISOString(),
      expired: expiresAt < now
    });

    if (expiresAt < now) {
      console.log('❌ Code expired');
      return res.status(401).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    console.log('✅ Code is valid and not expired');

    // Mark code as verified
    const { error: updateError } = await supabaseDb.supabase
      .from('verification_codes')
      .update({
        verified: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', verification.id);

    if (updateError) {
      console.error('Error updating verification code:', updateError);
      return res.status(500).json({ error: 'Failed to verify code' });
    }

    // Get customer details
    const { data: customer, error: customerError } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('id', verification.customer_id)
      .single();

    if (customerError || !customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Create a temporary token for password setup (valid for 30 minutes)
    const tempToken = jwt.sign(
      {
        customerId: customer.shopify_customer_id,
        dbCustomerId: customer.id,
        email: customer.email,
        isVerified: true,
        isTemporary: true
      },
      JWT_SECRET,
      { expiresIn: '30m' }
    );

    res.json({
      success: true,
      message: 'Email verified successfully',
      tempToken,
      customer: {
        id: customer.id,
        email: customer.email,
        firstName: customer.first_name,
        lastName: customer.last_name
      }
    });

  } catch (error) {
    console.error('Error verifying PIN:', error);
    res.status(500).json({ error: 'Failed to verify PIN' });
  }
});

// Set initial password (after email verification)
app.post('/api/auth/set-initial-password', pinLimiter, async (req, res) => {
  try {
    const { tempToken, newPassword } = req.body;

    if (!tempToken || !newPassword) {
      return res.status(400).json({ error: 'Temporary token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // Verify temporary token
    let decoded;
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired verification session' });
    }

    if (!decoded.isTemporary || !decoded.isVerified) {
      return res.status(401).json({ error: 'Invalid verification token' });
    }

    // Check if password is already set
    const { data: customer, error: fetchError } = await supabaseDb.supabase
      .from('customers')
      .select('password_hash')
      .eq('id', decoded.dbCustomerId)
      .single();

    if (fetchError) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (customer.password_hash) {
      return res.status(400).json({ error: 'Password already set. Please use the login page.' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password in database
    const { error: updateError } = await supabaseDb.supabase
      .from('customers')
      .update({
        password_hash: passwordHash,
        updated_at: new Date().toISOString()
      })
      .eq('id', decoded.dbCustomerId);

    if (updateError) {
      console.error('Error setting password:', updateError);
      return res.status(500).json({ error: 'Failed to set password' });
    }

    // Create permanent JWT token for login
    const token = jwt.sign(
      {
        customerId: decoded.customerId,
        dbCustomerId: decoded.dbCustomerId,
        email: decoded.email,
        isAdmin: false
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

    // Get full customer details
    const { data: fullCustomer } = await supabaseDb.supabase
      .from('customers')
      .select('*')
      .eq('id', decoded.dbCustomerId)
      .single();

    res.json({
      success: true,
      message: 'Password set successfully. You are now logged in.',
      user: {
        id: fullCustomer.shopify_customer_id,
        dbId: fullCustomer.id,
        email: fullCustomer.email,
        firstName: fullCustomer.first_name,
        lastName: fullCustomer.last_name,
        isAdmin: false
      },
      token
    });

  } catch (error) {
    console.error('Error setting initial password:', error);
    res.status(500).json({ error: 'Failed to set password' });
  }
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
      isPublic: pieceData.is_public,
      courseEnrollmentId: pieceData.course_enrollment_id ? parseInt(pieceData.course_enrollment_id) : null
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

// Get pottery pieces by course enrollment
app.get('/api/pottery/by-course/:courseEnrollmentId', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { courseEnrollmentId } = req.params;

    // Verify the course enrollment belongs to the user
    const { data: enrollment, error: enrollmentError } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*')
      .eq('id', parseInt(courseEnrollmentId))
      .eq('student_id', dbCustomerId)
      .single();

    if (enrollmentError || !enrollment) {
      return res.status(403).json({ error: 'Course enrollment not found or access denied' });
    }

    // Get pottery pieces linked to this course
    const { data: pieces, error: piecesError } = await supabaseDb.supabase
      .from('pottery_pieces')
      .select('*')
      .eq('course_enrollment_id', parseInt(courseEnrollmentId))
      .eq('customer_id', dbCustomerId)
      .order('date_completed', { ascending: false });

    if (piecesError) {
      throw piecesError;
    }

    const formattedPieces = pieces.map(piece => ({
      id: piece.id.toString(),
      title: piece.title,
      description: piece.notes,
      clay_type: piece.clay_type,
      glazes: piece.glazes,
      original_weight: piece.original_weight?.toString(),
      final_weight: piece.final_weight?.toString(),
      height: piece.height?.toString(),
      length: piece.length?.toString(),
      width: piece.width?.toString(),
      date_completed: new Date(piece.date_completed).toISOString().split('T')[0],
      images: piece.images,
      tags: piece.tags,
      is_public: piece.is_public,
      featured: piece.featured,
      course_enrollment_id: piece.course_enrollment_id
    }));

    res.json({
      pieces: formattedPieces,
      course: {
        id: enrollment.id,
        title: enrollment.course_title,
        type: enrollment.course_type,
        startDate: enrollment.course_start_date,
        endDate: enrollment.course_end_date
      }
    });
  } catch (error) {
    console.error('Error fetching pottery pieces by course:', error);
    res.status(500).json({ error: 'Failed to fetch pottery pieces' });
  }
});

// Add image to pottery piece
app.post('/api/pottery/pieces/:id/images', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { id } = req.params;
    const { url, description, date_added } = req.body;

    // Verify ownership
    const existingPieces = await supabaseDb.getPotteryPiecesByCustomerId(dbCustomerId);
    const piece = existingPieces.find(p => p.id === parseInt(id));

    if (!piece) {
      return res.status(403).json({ error: 'Pottery piece not found or access denied' });
    }

    // Check if already at max images (10)
    const currentImages = piece.images || [];
    if (currentImages.length >= 10) {
      return res.status(400).json({ error: 'Maximum 10 images allowed per piece' });
    }

    // Add new image with order
    const newImage = {
      url,
      description: description || '',
      date_added: date_added || new Date().toISOString().split('T')[0],
      order: currentImages.length + 1
    };

    const updatedImages = [...currentImages, newImage];

    // Update piece with new images array
    const { data: updatedPiece, error } = await supabaseDb.supabase
      .from('pottery_pieces')
      .update({ images: updatedImages, updated_at: new Date().toISOString() })
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({ success: true, images: updatedPiece.images });
  } catch (error) {
    console.error('Error adding image to pottery piece:', error);
    res.status(500).json({ error: 'Failed to add image' });
  }
});

// Delete image from pottery piece
app.delete('/api/pottery/pieces/:id/images/:imageIndex', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { id, imageIndex } = req.params;

    // Verify ownership
    const existingPieces = await supabaseDb.getPotteryPiecesByCustomerId(dbCustomerId);
    const piece = existingPieces.find(p => p.id === parseInt(id));

    if (!piece) {
      return res.status(403).json({ error: 'Pottery piece not found or access denied' });
    }

    const currentImages = piece.images || [];
    const index = parseInt(imageIndex);

    if (index < 0 || index >= currentImages.length) {
      return res.status(400).json({ error: 'Invalid image index' });
    }

    // Remove image and reorder
    const updatedImages = currentImages
      .filter((_, i) => i !== index)
      .map((img, i) => ({ ...img, order: i + 1 }));

    // Update piece
    const { data: updatedPiece, error } = await supabaseDb.supabase
      .from('pottery_pieces')
      .update({ images: updatedImages, updated_at: new Date().toISOString() })
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({ success: true, images: updatedPiece.images });
  } catch (error) {
    console.error('Error deleting image from pottery piece:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// Update image metadata (description, order)
app.put('/api/pottery/pieces/:id/images/:imageIndex', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { id, imageIndex } = req.params;
    const { description, order } = req.body;

    // Verify ownership
    const existingPieces = await supabaseDb.getPotteryPiecesByCustomerId(dbCustomerId);
    const piece = existingPieces.find(p => p.id === parseInt(id));

    if (!piece) {
      return res.status(403).json({ error: 'Pottery piece not found or access denied' });
    }

    const currentImages = piece.images || [];
    const index = parseInt(imageIndex);

    if (index < 0 || index >= currentImages.length) {
      return res.status(400).json({ error: 'Invalid image index' });
    }

    // Update image metadata
    const updatedImages = [...currentImages];
    if (description !== undefined) {
      updatedImages[index].description = description;
    }
    if (order !== undefined) {
      updatedImages[index].order = order;
    }

    // Update piece
    const { data: updatedPiece, error } = await supabaseDb.supabase
      .from('pottery_pieces')
      .update({ images: updatedImages, updated_at: new Date().toISOString() })
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({ success: true, images: updatedPiece.images });
  } catch (error) {
    console.error('Error updating image metadata:', error);
    res.status(500).json({ error: 'Failed to update image' });
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
        classTitle: booking.class_instance.class_title,
        classDescription: booking.class_instance.class_description,
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

// Get student class history with course enrollments
app.get('/api/classes/my-history', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    console.log('📥 /api/classes/my-history called for student:', dbCustomerId);

    // Get all bookings (past and current)
    const { data: bookings, error: bookingsError } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        id,
        status,
        attended,
        booking_date,
        course_enrollment_id,
        class_instance:class_instances!bookings_class_instance_id_fkey (
          id,
          class_date,
          start_time,
          end_time,
          class_type,
          instructor,
          room
        )
      `)
      .eq('student_id', dbCustomerId)
      .order('class_instance(class_date)', { ascending: false });

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      throw bookingsError;
    }

    // Get course enrollments
    const { data: enrollments, error: enrollmentsError } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', dbCustomerId)
      .order('course_start_date', { ascending: false });

    if (enrollmentsError) {
      console.error('Error fetching enrollments:', enrollmentsError);
      throw enrollmentsError;
    }

    // Group bookings by actual course identifier (extracted from class_type)
    const courseHistory = [];
    const today = new Date();

    // Helper function to extract base course identifier from class_type
    // e.g., "WT1701AM_DL6.2" -> "WT1701AM_DL6"
    const extractCourseIdentifier = (classType) => {
      if (!classType) return null;
      const match = classType.match(/^(.+?)(?:\.\d+)?$/);
      return match ? match[1] : classType;
    };

    // Process enrollments and split by actual course identifiers
    enrollments.forEach(enrollment => {
      const courseBookings = bookings.filter(b => b.course_enrollment_id === enrollment.id);

      // If no bookings exist but enrollment is completed, show it from enrollment data
      if (courseBookings.length === 0) {
        if (enrollment.status === 'completed') {
          courseHistory.push({
            id: `${enrollment.id}-enrollment`,
            type: 'course',
            courseIdentifier: enrollment.course_identifier || enrollment.id.toString(),
            courseTitle: enrollment.course_title || 'Wheelthrowing Course',
            courseType: enrollment.course_type || '',
            numberOfWeeks: enrollment.number_of_weeks || enrollment.class_credits_allocated || 6,
            startDate: enrollment.course_start_date,
            endDate: enrollment.course_end_date || enrollment.course_expiry_date,
            instructor: enrollment.instructor || 'VES Instructor',
            status: 'completed',
            scheduleDescription: enrollment.schedule_description || '',
            classesAttended: enrollment.class_credits_used || enrollment.number_of_weeks || 6,
            classes: []
          });
        }
        return;
      }

      // If enrollment has a course_identifier set, use that and group all bookings together
      if (enrollment.course_identifier) {
        const hasUpcomingClasses = courseBookings.some(b =>
          new Date(b.class_instance.class_date) >= today && b.status === 'booked'
        );

        const sortedBookings = [...courseBookings].sort((a, b) =>
          new Date(a.class_instance.class_date) - new Date(b.class_instance.class_date)
        );
        const startDate = sortedBookings[0]?.class_instance.class_date;
        const endDate = sortedBookings[sortedBookings.length - 1]?.class_instance.class_date;

        const instructor = sortedBookings[0]?.class_instance.instructor ||
                          enrollment.instructor ||
                          'VES Instructor';

        courseHistory.push({
          id: `${enrollment.id}-${enrollment.course_identifier}`,
          type: 'course',
          courseIdentifier: enrollment.course_identifier,
          courseTitle: enrollment.course_title,
          courseType: enrollment.course_type,
          numberOfWeeks: sortedBookings.length,
          startDate: startDate,
          endDate: endDate,
          instructor: instructor,
          status: hasUpcomingClasses ? 'current' : 'completed',
          classes: sortedBookings.map(b => ({
            id: b.class_instance.id,
            date: b.class_instance.class_date,
            startTime: b.class_instance.start_time,
            endTime: b.class_instance.end_time,
            classType: b.class_instance.class_type,
            instructor: b.class_instance.instructor,
            attended: b.attended === true || b.status === 'attended' || b.status === 'completed',
            status: b.status
          }))
        });
        return; // Skip the normal per-course processing
      }

      // Group bookings by course identifier
      const bookingsByCourse = {};
      courseBookings.forEach(booking => {
        const courseId = extractCourseIdentifier(booking.class_instance.class_type);
        if (courseId) {
          if (!bookingsByCourse[courseId]) {
            bookingsByCourse[courseId] = [];
          }
          bookingsByCourse[courseId].push(booking);
        }
      });

      // Determine if we should split or keep together
      // If all course identifiers have < 4 bookings, treat as one course with makeups
      // If any course identifier has 4+ bookings, split into separate courses
      const courseIds = Object.keys(bookingsByCourse);
      const hasFullCourse = courseIds.some(id => bookingsByCourse[id].length >= 4);

      // If no full courses detected, keep all bookings together as one course entry
      if (!hasFullCourse && courseIds.length > 1) {
        // Use the most common course identifier, or first one
        const primaryCourseId = courseIds[0];
        const allBookings = courseBookings;

        const hasUpcomingClasses = allBookings.some(b =>
          new Date(b.class_instance.class_date) >= today && b.status === 'booked'
        );

        const sortedBookings = [...allBookings].sort((a, b) =>
          new Date(a.class_instance.class_date) - new Date(b.class_instance.class_date)
        );
        const startDate = sortedBookings[0]?.class_instance.class_date;
        const endDate = sortedBookings[sortedBookings.length - 1]?.class_instance.class_date;

        const instructor = sortedBookings[0]?.class_instance.instructor ||
                          enrollment.instructor ||
                          'VES Instructor';

        courseHistory.push({
          id: `${enrollment.id}-${primaryCourseId}`,
          type: 'course',
          courseIdentifier: primaryCourseId,
          courseTitle: enrollment.course_title,
          courseType: enrollment.course_type,
          numberOfWeeks: sortedBookings.length,
          startDate: startDate,
          endDate: endDate,
          instructor: instructor,
          status: hasUpcomingClasses ? 'current' : 'completed',
          classes: sortedBookings.map(b => ({
            id: b.class_instance.id,
            date: b.class_instance.class_date,
            startTime: b.class_instance.start_time,
            endTime: b.class_instance.end_time,
            classType: b.class_instance.class_type,
            instructor: b.class_instance.instructor,
            attended: b.attended === true || b.status === 'attended' || b.status === 'completed',
            status: b.status
          }))
        });
        return; // Skip the normal per-course processing
      }

      // Create a separate history entry for each unique course
      Object.entries(bookingsByCourse).forEach(([courseId, courseBookings]) => {
        const hasUpcomingClasses = courseBookings.some(b =>
          new Date(b.class_instance.class_date) >= today && b.status === 'booked'
        );

        // Determine course status
        let courseStatus = 'completed';
        if (hasUpcomingClasses) {
          courseStatus = 'current';
        }

        // Calculate actual start and end dates from bookings
        const sortedBookings = [...courseBookings].sort((a, b) =>
          new Date(a.class_instance.class_date) - new Date(b.class_instance.class_date)
        );
        const startDate = sortedBookings[0]?.class_instance.class_date;
        const endDate = sortedBookings[sortedBookings.length - 1]?.class_instance.class_date;

        // Get instructor from first booking or enrollment
        const instructor = sortedBookings[0]?.class_instance.instructor ||
                          enrollment.instructor ||
                          'VES Instructor';

        courseHistory.push({
          id: `${enrollment.id}-${courseId}`,
          type: 'course',
          courseIdentifier: courseId,
          courseTitle: enrollment.course_title,
          courseType: enrollment.course_type,
          numberOfWeeks: sortedBookings.length,
          startDate: startDate,
          endDate: endDate,
          instructor: instructor,
          status: courseStatus,
          classes: sortedBookings.map(b => ({
            id: b.class_instance.id,
            date: b.class_instance.class_date,
            startTime: b.class_instance.start_time,
            endTime: b.class_instance.end_time,
            classType: b.class_instance.class_type,
            instructor: b.class_instance.instructor,
            attended: b.attended === true || b.status === 'attended' || b.status === 'completed',
            status: b.status
          }))
        });
      });
    });

    // Add standalone bookings (not part of a course enrollment)
    const standaloneBookings = bookings.filter(b => !b.course_enrollment_id);
    standaloneBookings.forEach(booking => {
      const classDate = new Date(booking.class_instance.class_date);
      courseHistory.push({
        id: `booking-${booking.id}`,
        type: 'standalone',
        status: classDate >= today && booking.status === 'booked' ? 'upcoming' : 'past',
        classes: [{
          id: booking.class_instance.id,
          date: booking.class_instance.class_date,
          startTime: booking.class_instance.start_time,
          endTime: booking.class_instance.end_time,
          classType: booking.class_instance.class_type,
          instructor: booking.class_instance.instructor,
          attended: booking.attended,
          status: booking.status
        }]
      });
    });

    // Sort by most recent first
    courseHistory.sort((a, b) => {
      const dateA = a.startDate || a.classes[0]?.date || '';
      const dateB = b.startDate || b.classes[0]?.date || '';
      return new Date(dateB) - new Date(dateA);
    });

    // Count attended classes including completed enrollments without bookings
    const completedWithoutBookings = courseHistory.filter(c => c.status === 'completed' && c.classes.length === 0);
    const extraAttended = completedWithoutBookings.reduce((sum, c) => sum + (c.classesAttended || 0), 0);

    const response = {
      history: courseHistory,
      totalClasses: bookings.length + extraAttended,
      attendedClasses: bookings.filter(b => b.attended).length + extraAttended
    };

    console.log('📤 Returning history:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (error) {
    console.error('❌ Error in /api/classes/my-history:', error);
    res.status(500).json({ error: 'Failed to fetch class history' });
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

// Book a makeup class using remaining credits
app.post('/api/classes/book-makeup', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { classInstanceId } = req.body;

    if (!classInstanceId) {
      return res.status(400).json({ error: 'Class instance ID required' });
    }

    // Get student's credit info
    const { data: customer, error: customerError } = await supabaseDb.supabase
      .from('customers')
      .select('id, classes_allocated, first_name, last_name')
      .eq('id', dbCustomerId)
      .single();

    if (customerError || !customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get ALL bookings to calculate remaining credits
    const { data: allBookings } = await supabaseDb.supabase
      .from('bookings')
      .select('id')
      .eq('student_id', dbCustomerId)
      .in('status', ['booked', 'attended']);

    const totalBooked = allBookings ? allBookings.length : 0;
    const remainingCredits = customer.classes_allocated - totalBooked;

    if (remainingCredits <= 0) {
      return res.status(400).json({
        error: 'No remaining credits available',
        details: `You have used all ${customer.classes_allocated} class credits.`
      });
    }

    // Check class availability
    const classInstance = await supabaseDb.getClassInstanceById(parseInt(classInstanceId));

    if (!classInstance) {
      return res.status(404).json({ error: 'Class not found' });
    }

    if (classInstance.current_enrollment >= classInstance.max_capacity) {
      return res.status(400).json({ error: 'Class is full. No makeup spots available.' });
    }

    // Check if already booked
    const existingBooking = await supabaseDb.findBooking(dbCustomerId, parseInt(classInstanceId), 'booked');

    if (existingBooking) {
      return res.status(400).json({ error: 'You are already booked for this class' });
    }

    // Check if there's a cancelled booking for this class - if so, reactivate it instead of creating new
    const { data: cancelledBooking } = await supabaseDb.supabase
      .from('bookings')
      .select('*')
      .eq('student_id', dbCustomerId)
      .eq('class_instance_id', parseInt(classInstanceId))
      .eq('status', 'cancelled')
      .maybeSingle();

    let booking;
    let bookingError;

    if (cancelledBooking) {
      // Reactivate the cancelled booking
      const { data: updatedBooking, error: updateError } = await supabaseDb.supabase
        .from('bookings')
        .update({
          status: 'booked',
          booking_type: 'makeup',
          booking_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', cancelledBooking.id)
        .select()
        .single();

      booking = updatedBooking;
      bookingError = updateError;
    } else {
      // Create new makeup booking
      const { data: newBooking, error: insertError } = await supabaseDb.supabase
        .from('bookings')
        .insert({
          student_id: dbCustomerId,
          class_instance_id: parseInt(classInstanceId),
          status: 'booked',
          booking_type: 'makeup',
          course_enrollment_id: null,
          booking_date: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      booking = newBooking;
      bookingError = insertError;
    }

    if (bookingError) {
      console.error('Error creating makeup booking:', bookingError);
      return res.status(500).json({ error: 'Failed to create booking' });
    }

    // Update class enrollment count
    await supabaseDb.updateClassEnrollment(parseInt(classInstanceId), 1);

    res.json({
      success: true,
      booking: {
        id: booking.id,
        classInstanceId: booking.class_instance_id,
        status: booking.status,
        isMakeup: true
      },
      remainingCredits: remainingCredits - 1,
      message: 'Makeup class booked successfully!'
    });
  } catch (error) {
    console.error('Error booking makeup class:', error);
    res.status(500).json({ error: 'Failed to book makeup class' });
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

// Book HB schedule — use existing enrollment credits to book consecutive HB classes
app.post('/api/classes/book-hb-schedule', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { enrollmentId, firstClassId, courseWeeks } = req.body;
    console.log('📚 HB booking request:', { dbCustomerId, enrollmentId, firstClassId, courseWeeks });

    if (!enrollmentId || !firstClassId) {
      return res.status(400).json({ error: 'Enrollment ID and first class ID required' });
    }

    if (!courseWeeks || ![4, 8].includes(courseWeeks)) {
      return res.status(400).json({ error: 'Course weeks must be 4 or 8 for handbuilding' });
    }

    // Verify enrollment belongs to this student and has sufficient credits
    const { data: enrollment, error: enrollError } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*')
      .eq('id', enrollmentId)
      .eq('student_id', dbCustomerId)
      .single();

    if (enrollError || !enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    if (enrollment.status !== 'active') {
      return res.status(400).json({ error: 'Enrollment is not active' });
    }

    const creditsRemaining = enrollment.class_credits_remaining || 0;
    if (creditsRemaining < courseWeeks) {
      return res.status(400).json({
        error: `Not enough credits. You have ${creditsRemaining} credits but need ${courseWeeks}.`
      });
    }

    // Get the first class instance
    const firstClass = await supabaseDb.getClassInstanceById(parseInt(firstClassId));
    if (!firstClass) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Find consecutive HB classes on the same day-of-week with same time + instructor
    // Query directly instead of using getAvailableClasses() which has a limit and unnecessary overhead
    const { data: hbClassesRaw, error: hbQueryError } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .eq('status', 'active')
      .eq('start_time', firstClass.start_time)
      .eq('instructor', firstClass.instructor)
      .like('class_type', 'HB_%')
      .gte('class_date', firstClass.class_date)
      .order('class_date', { ascending: true })
      .limit(courseWeeks * 2); // extra buffer for filtering

    if (hbQueryError) {
      console.error('Error querying HB classes:', hbQueryError);
      return res.status(500).json({ error: 'Failed to find available classes' });
    }

    const firstClassDayOfWeek = new Date(firstClass.class_date).getDay();
    const hbClasses = (hbClassesRaw || [])
      .filter(c => new Date(c.class_date).getDay() === firstClassDayOfWeek)
      .slice(0, courseWeeks)
      .map(c => ({
        id: c.id,
        classDate: c.class_date,
        startTime: c.start_time,
        endTime: c.end_time,
        classType: c.class_type,
        instructor: c.instructor,
        currentEnrollment: c.current_enrollment,
        maxCapacity: c.max_capacity
      }));

    if (hbClasses.length < courseWeeks) {
      return res.status(400).json({
        error: `Only ${hbClasses.length} consecutive classes available. Need ${courseWeeks}.`
      });
    }

    // Check student isn't already booked into these classes
    for (const cls of hbClasses) {
      const existing = await supabaseDb.findBooking(dbCustomerId, cls.id, 'booked');
      if (existing) {
        return res.status(400).json({ error: 'You are already booked in one of these classes' });
      }
    }

    // Check capacity for each class (HB max 10)
    for (const cls of hbClasses) {
      if (cls.currentEnrollment >= 10) {
        const weekNum = hbClasses.indexOf(cls) + 1;
        return res.status(400).json({
          error: `Week ${weekNum} is full. Cannot book schedule.`
        });
      }
    }

    // Create bookings for all weeks, linked to existing enrollment
    const bookings = [];
    for (const cls of hbClasses) {
      const booking = await supabaseDb.createBooking({
        studentId: dbCustomerId,
        classInstanceId: cls.id,
        status: 'booked',
        bookingType: 'regular',
        courseEnrollmentId: enrollment.id
      });

      await supabaseDb.updateClassEnrollment(cls.id, 1);
      bookings.push(booking);
    }

    // Don't decrement credits on booking — credits are only "used" when student attends.
    // Just mark that bookings have been created.
    await supabaseDb.supabase
      .from('course_enrollments')
      .update({
        bookings_created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollmentId);

    // Update enrollment with course dates
    const startDate = new Date(firstClass.class_date);
    const endDate = new Date(hbClasses[hbClasses.length - 1].classDate);

    await supabaseDb.supabase
      .from('course_enrollments')
      .update({
        course_start_date: startDate.toISOString().split('T')[0],
        course_end_date: endDate.toISOString().split('T')[0],
        number_of_weeks: courseWeeks
      })
      .eq('id', enrollmentId);

    console.log(`✅ HB schedule booked: ${bookings.length} classes for enrollment ${enrollmentId}`);

    res.json({
      success: true,
      enrollmentId: enrollment.id,
      bookings: bookings.map(b => ({
        id: b.id,
        classInstanceId: b.class_instance_id
      })),
      creditsRemaining: newCreditsRemaining,
      message: `Successfully booked ${courseWeeks}-week handbuilding schedule!`
    });

  } catch (error) {
    console.error('Error booking HB schedule:', error);
    res.status(500).json({ error: 'Failed to book handbuilding schedule' });
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
    let currentBooking = await supabaseDb.findBooking(dbCustomerId, parseInt(oldClassId), 'booked');
    let isRecoveryReschedule = false;

    if (!currentBooking) {
      console.log(`Booking not found for student ${dbCustomerId}, class ${oldClassId} with status 'booked'`);
      // Check bookings with any status (old and target) to provide better error message
      const { data: oldBookingAny } = await supabaseDb.supabase
        .from('bookings')
        .select('*')
        .eq('student_id', dbCustomerId)
        .eq('class_instance_id', parseInt(oldClassId))
        .maybeSingle();

      const { data: targetBookingAny } = await supabaseDb.supabase
        .from('bookings')
        .select('*')
        .eq('student_id', dbCustomerId)
        .eq('class_instance_id', parseInt(newClassId))
        .maybeSingle();

      // Recovery path: previous reschedule attempt cancelled the old booking, then failed on duplicate insert.
      // If the target already has a cancelled/rescheduled row, we can complete the reschedule by reactivating it.
      if (
        oldBookingAny?.status === 'cancelled' &&
        targetBookingAny &&
        ['cancelled', 'rescheduled'].includes(targetBookingAny.status)
      ) {
        console.log('Recovering partial reschedule by reactivating existing target booking');
        currentBooking = oldBookingAny;
        isRecoveryReschedule = true;
      } else if (targetBookingAny?.status === 'booked') {
        return res.json({
          success: true,
          booking: {
            id: targetBookingAny.id,
            classInstanceId: targetBookingAny.class_instance_id
          },
          rescheduleFee: 0,
          message: 'Class was already rescheduled successfully.'
        });
      } else if (oldBookingAny) {
        console.log(`Found booking with status: ${oldBookingAny.status}`);
        return res.status(400).json({
          error: `Cannot reschedule: booking status is '${oldBookingAny.status}' (expected 'booked')`
        });
      }
      if (!currentBooking) {
        return res.status(404).json({ error: 'You are not enrolled in the original class' });
      }
    }

    // Get the old and new class instances
    const oldClass = await supabaseDb.getClassInstanceById(parseInt(oldClassId));
    const newClass = await supabaseDb.getClassInstanceById(parseInt(newClassId));

    if (!oldClass || !newClass) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Parse class start datetime (combine date + start_time)
    const parseClassDateTime = (classDateStr, timeStr) => {
      const datePart = classDateStr.split('T')[0]; // Get YYYY-MM-DD
      const normalizedTime = timeStr.toUpperCase().trim();

      // Handle both 12-hour (9:30 AM, 3:30pm) and 24-hour (19:00) formats
      const time24Match = normalizedTime.match(/^(\d{1,2}):(\d{2})$/);
      let hour24, minutes;

      if (time24Match) {
        hour24 = parseInt(time24Match[1]);
        minutes = parseInt(time24Match[2]);
      } else {
        const match = normalizedTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
        if (!match) return new Date(NaN);

        const hours = parseInt(match[1]);
        minutes = parseInt(match[2]);
        const period = match[3];

        hour24 = hours;
        if (period === 'PM' && hours !== 12) hour24 = hours + 12;
        else if (period === 'AM' && hours === 12) hour24 = 0;
      }

      const [year, month, day] = datePart.split('-').map(Number);
      return new Date(year, month - 1, day, hour24, minutes);
    };

    // Check if class is within 24 hours
    const now = new Date();
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const oldClassDateTime = parseClassDateTime(oldClass.class_date, oldClass.start_time);

    if (isNaN(oldClassDateTime.getTime())) {
      return res.status(400).json({ error: 'Invalid class time format' });
    }

    if (oldClassDateTime < now) {
      return res.status(400).json({ error: 'Cannot reschedule past classes' });
    }

    if (oldClassDateTime < twentyFourHoursFromNow) {
      return res.status(400).json({
        error: 'Cannot reschedule classes within 24 hours of start time. This class will be marked as attended.'
      });
    }

    // Get student info to check for 10-class package
    const { data: student, error: studentError } = await supabaseDb.supabase
      .from('customers')
      .select('classes_allocated, course_expiry_date')
      .eq('id', dbCustomerId)
      .single();

    if (studentError) {
      console.error('Error fetching student:', studentError);
      return res.status(500).json({ error: 'Failed to fetch student information' });
    }

    const has10ClassPackage = student.classes_allocated === 10 && student.course_expiry_date === null;

    // Check if this is a glazing class (Week 6/6 Glazing)
    const isOldClassGlazing = oldClass.class_type?.includes('Week 6/6') && oldClass.class_type?.includes('Glazing');
    const isNewClassGlazing = newClass.class_type?.includes('Week 6/6') && newClass.class_type?.includes('Glazing');

    // For 10-class package: check if this is their 10th class (final class must be glazing)
    if (has10ClassPackage) {
      // Count current bookings for this student
      const { data: allBookings, error: bookingsError } = await supabaseDb.supabase
        .from('bookings')
        .select('id')
        .eq('student_id', dbCustomerId)
        .eq('status', 'booked');

      if (bookingsError) {
        console.error('Error fetching bookings:', bookingsError);
        return res.status(500).json({ error: 'Failed to fetch bookings' });
      }

      // After rescheduling, they'll still have the same number of bookings (cancelling one, adding one)
      // So if they currently have 9+ bookings, this must be for their 10th class slot
      const totalBookings = allBookings.length;

      if (totalBookings >= 9) {
        // This is their 10th class - must be glazing
        if (!isNewClassGlazing) {
          return res.status(400).json({
            error: 'Your 10th and final class must be a glazing class (Week 6). Please select a glazing class.'
          });
        }
      }
    }

    // Apply cohort restrictions for standard 6-week WT courses (not 10-class package)
    // NOTE: 10-class package students can reschedule across categories (HB ↔ WT)
    // Regular course students must stay within their original course type and cohort dates
    if (!has10ClassPackage) {
      // Get student's course enrollment to find cohort dates
      const { data: enrollment, error: enrollmentError } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('course_start_date, course_end_date, course_title, package_total_courses')
        .eq('id', currentBooking.course_enrollment_id)
        .single();

      if (enrollmentError) {
        console.error('Error fetching enrollment:', enrollmentError);
        return res.status(500).json({ error: 'Failed to fetch course enrollment' });
      }

      // Check if this is a 6-week Wheelthrowing course
      const isWheelthrowing6Week = enrollment.course_title?.toLowerCase().includes('wheelthrowing') &&
                                    enrollment.course_title?.toLowerCase().includes('6');

      if (isWheelthrowing6Week && enrollment.course_start_date && enrollment.course_end_date) {
        if (isOldClassGlazing) {
          // 3-course package students on courses 1 or 2 can swap glazing → regular WT
          const is3CoursePackage = enrollment.package_total_courses === 3;
          let canSwapGlazingToWT = false;

          if (is3CoursePackage) {
            const { data: completedPkgCourses } = await supabaseDb.supabase
              .from('course_enrollments')
              .select('id')
              .eq('student_id', dbCustomerId)
              .eq('status', 'completed')
              .ilike('course_title', '%3 Course Package%');
            const completedCount = completedPkgCourses?.length || 0;
            // Courses 1 & 2 can swap glazing→WT; course 3 (2 completed) cannot
            canSwapGlazingToWT = completedCount < 2;
          }

          if (!isNewClassGlazing && !canSwapGlazingToWT) {
            return res.status(400).json({
              error: is3CoursePackage
                ? 'Your final course glazing class cannot be rescheduled to a regular class.'
                : 'Glazing class can only be rescheduled to another glazing class (Week 6).'
            });
          }
          // No date restriction for glazing - can reschedule to any future cohort's glazing class
        } else {
          // Regular class (Weeks 1-5): must stay within cohort dates
          const cohortStartDate = new Date(enrollment.course_start_date);
          const cohortEndDate = new Date(enrollment.course_end_date);
          const newClassDate = new Date(newClass.class_date);

          if (newClassDate < cohortStartDate || newClassDate > cohortEndDate) {
            const startStr = cohortStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endStr = cohortEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return res.status(400).json({
              error: `You can only reschedule to classes within your cohort period (${startStr} - ${endStr}).`
            });
          }
        }
      }
    }

    // Check if new class has availability (total capacity is 10)
    if (newClass.current_enrollment >= newClass.max_capacity) {
      return res.status(400).json({ error: 'This class is completely full' });
    }

    // Check if student already has any booking row for the target class
    const { data: targetBookingAnyStatus, error: targetBookingLookupError } = await supabaseDb.supabase
      .from('bookings')
      .select('*')
      .eq('student_id', dbCustomerId)
      .eq('class_instance_id', parseInt(newClassId))
      .maybeSingle();

    if (targetBookingLookupError) {
      throw targetBookingLookupError;
    }

    if (targetBookingAnyStatus?.status === 'booked') {
      return res.status(400).json({ error: 'You are already enrolled in this class' });
    }

    // For non-glazing classes, check if reschedule is within same cohort (no fee) or different cohort ($40 fee)
    let rescheduleFee = 0;
    if (!isOldClassGlazing) {
      // Determine if the new class is within the same cohort period
      let isSameCohort = false;
      if (currentBooking.course_enrollment_id) {
        const { data: enroll } = await supabaseDb.supabase
          .from('course_enrollments')
          .select('course_start_date, course_end_date')
          .eq('id', currentBooking.course_enrollment_id)
          .single();

        if (enroll?.course_start_date && enroll?.course_end_date) {
          const cohortStart = new Date(enroll.course_start_date);
          const cohortEnd = new Date(enroll.course_end_date);
          const newClassDate = new Date(newClass.class_date);
          isSameCohort = newClassDate >= cohortStart && newClassDate <= cohortEnd;
        }
      }

      if (!isSameCohort) {
        rescheduleFee = 40; // $40 reschedule fee only for rescheduling outside your cohort

        // Create reschedule fee record
        const { error: feeError } = await supabaseDb.supabase
          .from('reschedule_fees')
          .insert({
            student_id: dbCustomerId,
            booking_id: currentBooking.id,
            fee_type: 'reschedule',
            amount: rescheduleFee,
            payment_status: 'pending',
            notes: `Reschedule fee for ${oldClass.class_type} on ${new Date(oldClass.class_date).toLocaleDateString()} (rescheduled outside cohort)`
          });

        if (feeError) {
          console.error('Error creating reschedule fee:', feeError);
          // Continue with reschedule but log the error
        }
      }
    }

    // Cancel old booking only if it is still booked (skip in recovery mode to avoid double-decrementing)
    if (currentBooking.status === 'booked') {
      await supabaseDb.updateBooking(currentBooking.id, {
        status: 'cancelled',
        advanceNoticeGiven: true
      });
      await supabaseDb.updateClassEnrollment(parseInt(oldClassId), -1);
    }

    // Determine booking type: if rescheduling back to own course, mark as regular (not makeup)
    const getBaseId = (id) => { const i = (id || '').lastIndexOf('.'); return i > 0 ? id.substring(0, i) : id; };
    const newClassBase = getBaseId(newClass.class_type);
    let resolvedBookingType = 'makeup';
    if (currentBooking.course_enrollment_id) {
      const { data: enrollment } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('course_identifier')
        .eq('id', currentBooking.course_enrollment_id)
        .single();
      if (enrollment && getBaseId(enrollment.course_identifier) === newClassBase) {
        resolvedBookingType = 'regular';
      }
    }

    let newBooking;

    if (targetBookingAnyStatus && ['cancelled', 'rescheduled'].includes(targetBookingAnyStatus.status)) {
      // Reactivate existing target booking row instead of inserting a duplicate
      const { data: reactivatedBooking, error: reactivateError } = await supabaseDb.supabase
        .from('bookings')
        .update({
          status: 'booked',
          booking_type: resolvedBookingType,
          course_enrollment_id: currentBooking.course_enrollment_id || null,
          is_glazing_reschedule: isOldClassGlazing,
          original_class_instance_id: parseInt(oldClassId),
          rescheduled_from_date: oldClass.class_date,
          reschedule_fee_paid: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', targetBookingAnyStatus.id)
        .select()
        .single();

      if (reactivateError) throw reactivateError;
      newBooking = reactivatedBooking;
    } else {
      // Create new booking (regular if same course, makeup if different)
      newBooking = await supabaseDb.createBooking({
        studentId: dbCustomerId,
        classInstanceId: parseInt(newClassId),
        status: 'booked',
        bookingType: resolvedBookingType,
        courseEnrollmentId: currentBooking.course_enrollment_id, // Keep same course enrollment ID
        isGlazingReschedule: isOldClassGlazing,
        originalClassInstanceId: parseInt(oldClassId),
        rescheduledFromDate: oldClass.class_date,
        rescheduleFeePaid: 0 // Fee is pending payment
      });
    }

    await supabaseDb.updateClassEnrollment(parseInt(newClassId), 1);

    res.json({
      success: true,
      booking: {
        id: newBooking.id,
        classInstanceId: newBooking.class_instance_id
      },
      rescheduleFee: rescheduleFee,
      message: isRecoveryReschedule
        ? 'Class rescheduled successfully (recovered from a previous failed attempt).'
        : isOldClassGlazing
        ? 'Glazing class rescheduled successfully (no fee)!'
        : rescheduleFee > 0
        ? `Class rescheduled successfully! A $${rescheduleFee} reschedule fee has been added (rescheduled outside your cohort).`
        : 'Class rescheduled successfully (no fee — same cohort).'
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
      .select('*')
      .eq('id', dbCustomerId)
      .single();

    if (customerError) {
      console.error('Error fetching customer:', customerError);
      return res.status(500).json({ error: 'Failed to fetch customer information' });
    }

    if (customer?.pause_used_for_course) {
      return res.status(400).json({
        error: 'You have already used your one-time pause for this course'
      });
    }

    if (customer?.course_paused) {
      return res.status(400).json({
        error: 'Your course is already paused'
      });
    }

    // Calculate remaining classes from enrollment
    const remainingCount = Number.isFinite(enrollment.weeks_remaining)
      ? enrollment.weeks_remaining
      : Math.max(0, (enrollment.number_of_weeks || 0) - (enrollment.weeks_completed || 0));
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
      .select('*')
      .eq('id', dbCustomerId)
      .single();

    if (customerError) {
      console.error('Error fetching customer:', customerError);
      return res.status(500).json({ error: 'Failed to fetch customer information' });
    }

    // Check if pause has already been used
    if (customer?.pause_used_for_course) {
      return res.status(400).json({
        error: 'You have already used your one-time pause for this course'
      });
    }

    // Check if course is currently paused
    if (customer?.course_paused) {
      return res.status(400).json({
        error: 'Your course is already paused'
      });
    }

    // Calculate pause fee from enrollment data
    const remainingCount = Number.isFinite(enrollment.weeks_remaining)
      ? enrollment.weeks_remaining
      : Math.max(0, (enrollment.number_of_weeks || 0) - (enrollment.weeks_completed || 0));
    const pauseFeePerClass = 40;
    const totalPauseFee = remainingCount * pauseFeePerClass;

    // Update customer pause status
    const customerUpdate = {};
    if ('course_paused' in customer) customerUpdate.course_paused = true;
    if ('pause_start_date' in customer) customerUpdate.pause_start_date = new Date().toISOString().split('T')[0];
    if ('pause_reason' in customer) customerUpdate.pause_reason = 'Student requested pause';
    if ('paused_at_week' in customer) customerUpdate.paused_at_week = (enrollment.weeks_completed || 0) + 1;
    if ('resume_course_identifier' in customer) customerUpdate.resume_course_identifier = enrollment.course_identifier;
    if ('pause_used_for_course' in customer) customerUpdate.pause_used_for_course = true;
    if ('pause_used_date' in customer) customerUpdate.pause_used_date = new Date().toISOString();

    if (Object.keys(customerUpdate).length > 0) {
      const { error: updateError } = await supabaseDb.supabase
        .from('customers')
        .update(customerUpdate)
        .eq('id', dbCustomerId);

      if (updateError) {
        console.error('Error updating customer pause status:', updateError);
        return res.status(500).json({ error: 'Failed to pause course' });
      }
    } else {
      console.warn('Pause tracking columns not found on customers table; skipping customer pause status update');
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
    const paymentLink = `https://ves.sg/pages/pause-payment?amount=${totalPauseFee}&student=${encodeURIComponent(customer?.email || '')}`;

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

app.post('/api/classes/bookings/:bookingId/mark-attendance', authenticateToken, requireAdmin, async (req, res) => {
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

    // Update HB credits when attendance is marked
    if (booking.course_enrollment_id) {
      const { data: enrollment } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('id, course_type, class_credits_used, class_credits_remaining')
        .eq('id', booking.course_enrollment_id)
        .single();

      if (enrollment && (enrollment.course_type || '').toLowerCase().includes('handbuilding')) {
        if (attended) {
          // Credit used on attendance
          await supabaseDb.supabase
            .from('course_enrollments')
            .update({
              class_credits_used: (enrollment.class_credits_used || 0) + 1,
              class_credits_remaining: Math.max(0, (enrollment.class_credits_remaining || 0) - 1),
              updated_at: new Date().toISOString()
            })
            .eq('id', enrollment.id);
        } else if (!attended && !booking.advance_notice_given) {
          // No-show without notice also uses a credit (forfeited)
          await supabaseDb.supabase
            .from('course_enrollments')
            .update({
              class_credits_used: (enrollment.class_credits_used || 0) + 1,
              class_credits_remaining: Math.max(0, (enrollment.class_credits_remaining || 0) - 1),
              updated_at: new Date().toISOString()
            })
            .eq('id', enrollment.id);
        }
        // No-show WITH notice: credit is not consumed, student can rebook
      }
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

    if (!req.user.isAdmin && req.user.dbCustomerId !== parseInt(studentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

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

app.post('/api/classes/:classInstanceId/waitlist/offer-next', authenticateToken, requireAdmin, async (req, res) => {
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

app.post('/api/classes/waitlist/process-expired', authenticateToken, requireAdmin, async (req, res) => {
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

// Search students by name or email
app.get('/api/admin/students/search', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ students: [] });
    const { data, error } = await supabaseDb.supabase
      .from('customers')
      .select('id, email, first_name, last_name, customer_type')
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(10);
    if (error) throw error;
    res.json({ students: data || [] });
  } catch (err) {
    console.error('Student search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get student statistics summary (lightweight, count-only)
app.get('/api/admin/students/stats/summary', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [
      { count: totalStudents, error: e1 },
      { count: activeStudents, error: e2 },
      { count: pausedStudents, error: e3 },
      { count: hbStudents, error: e4 },
      { count: activeMembers, error: e5 }
    ] = await Promise.all([
      supabaseDb.supabase
        .from('customers')
        .select('*', { count: 'exact', head: true }),
      supabaseDb.supabase
        .from('course_enrollments')
        .select('*', { count: 'exact', head: true })
        .in('status', ['active', 'upcoming']),
      supabaseDb.supabase
        .from('course_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'paused'),
      supabaseDb.supabase
        .from('course_enrollments')
        .select('*', { count: 'exact', head: true })
        .ilike('course_type', '%handbuilding%')
        .in('status', ['active', 'upcoming']),
      supabaseDb.supabase
        .from('memberships')
        .select('*', { count: 'exact', head: true })
        .in('status', ['active', 'expiring'])
    ]);

    const err = e1 || e2 || e3 || e4 || e5;
    if (err) throw err;

    res.json({
      totalStudents: totalStudents || 0,
      activeStudents: activeStudents || 0,
      pausedStudents: pausedStudents || 0,
      hbStudents: hbStudents || 0,
      activeMembers: activeMembers || 0
    });
  } catch (error) {
    console.error('Error fetching student stats summary:', error);
    res.status(500).json({ error: 'Failed to fetch student stats summary' });
  }
});

// Get student statistics
app.get('/api/admin/students/stats', authenticateToken, requireAdmin, async (req, res) => {
  console.log('📊 /api/admin/students/stats endpoint called');
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

    // Get bookings with class instances to extract course identifiers AND calculate ended classes
    const { data: allBookingsWithClasses, error: bookingsClassError } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        student_id,
        class_instance_id,
        course_enrollment_id,
        status,
        booking_type,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date,
          start_time,
          end_time,
          instructor,
          room
        )
      `)
      .in('status', ['booked', 'completed', 'attended'])
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
    // Use the SAME grouping logic as course history to handle makeup classes correctly
    const studentCourseMap = {};

    // First, get all bookings grouped by student and enrollment
    const { data: allBookingsForCourseGrouping } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        student_id,
        course_enrollment_id,
        booking_type,
        class_instances!bookings_class_instance_id_fkey (
          class_type,
          class_date
        )
      `)
      .in('status', ['booked', 'completed', 'attended'])
      .order('class_instances(class_date)', { ascending: false });

    // Helper function to extract base course identifier
    const extractCourseIdentifier = (classType) => {
      if (!classType) return null;
      const match = classType.match(/^(.+?)(?:\.\d+)?$/);
      return match ? match[1] : classType;
    };

    // Build a variant title from booking/class data when enrollment is missing it
    // e.g. "SATURDAYS • 28 Feb –4 Apr • 1:00pm-3:30pm"
    const buildVariantTitleFromBookings = (studentId, courseIdentifier) => {
      if (!courseIdentifier) return null;
      const baseCourse = courseIdentifier.split('.')[0];
      const studentBookings = allBookingsWithClasses.filter(b => {
        if (b.student_id !== studentId) return false;
        const ci = b.class_instances;
        return ci && ci.class_type && ci.class_type.startsWith(baseCourse);
      });
      if (studentBookings.length === 0) return null;

      studentBookings.sort((a, b) => new Date(a.class_instances.class_date) - new Date(b.class_instances.class_date));

      const firstClass = studentBookings[0].class_instances;
      const lastClass = studentBookings[studentBookings.length - 1].class_instances;
      const firstDate = new Date(firstClass.class_date);
      const lastDate = new Date(lastClass.class_date);

      const days = ['SUNDAYS', 'MONDAYS', 'TUESDAYS', 'WEDNESDAYS', 'THURSDAYS', 'FRIDAYS', 'SATURDAYS'];
      const dayName = days[firstDate.getUTCDay()];

      const fmtDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
      const dateRange = `${fmtDate(firstDate)} –${fmtDate(lastDate)}`;

      const time = firstClass.start_time && firstClass.end_time
        ? `${firstClass.start_time}-${firstClass.end_time}`
        : firstClass.start_time || '';

      return `${dayName} • ${dateRange} • ${time}`;
    };

    // Group bookings by student, then by enrollment
    const studentEnrollmentBookings = {};
    allBookingsForCourseGrouping?.forEach(booking => {
      const studentId = booking.student_id;
      const enrollmentId = booking.course_enrollment_id;

      if (!studentEnrollmentBookings[studentId]) {
        studentEnrollmentBookings[studentId] = {};
      }
      if (!studentEnrollmentBookings[studentId][enrollmentId]) {
        studentEnrollmentBookings[studentId][enrollmentId] = [];
      }

      studentEnrollmentBookings[studentId][enrollmentId].push(booking);
    });

    // Process each student's enrollments to extract courses
    Object.keys(studentEnrollmentBookings).forEach(studentId => {
      studentCourseMap[studentId] = [];

      Object.keys(studentEnrollmentBookings[studentId]).forEach(enrollmentId => {
        const bookings = studentEnrollmentBookings[studentId][enrollmentId];

        // Group bookings by course identifier within this enrollment
        // EXCLUDE makeup bookings - they don't count as separate courses
        const bookingsByCourse = {};
        bookings.forEach(booking => {
          // Debug for Geraldine (student_id 2344)
          if (studentId === '2344' || studentId === 2344) {
            console.log(`[DEBUG Geraldine] Processing booking: ${booking.class_instances?.class_type}, booking_type: ${booking.booking_type}`);
          }

          // Skip makeup bookings when determining courses
          if (booking.booking_type === 'makeup') {
            if (studentId === '2344' || studentId === 2344) {
              console.log(`[DEBUG Geraldine] SKIPPING makeup booking: ${booking.class_instances?.class_type}`);
            }
            return;
          }
          const courseId = extractCourseIdentifier(booking.class_instances?.class_type);
          if (courseId) {
            if (!bookingsByCourse[courseId]) {
              bookingsByCourse[courseId] = [];
            }
            bookingsByCourse[courseId].push(booking);
            if (studentId === '2344' || studentId === 2344) {
              console.log(`[DEBUG Geraldine] Added to course ${courseId}`);
            }
          }
        });

        // Apply makeup class detection logic
        const courseIds = Object.keys(bookingsByCourse);
        const hasFullCourse = courseIds.some(id => bookingsByCourse[id].length >= 4);

        // If no full courses (all < 4 bookings), keep together as one course with makeups
        if (!hasFullCourse && courseIds.length > 1) {
          const primaryCourseId = courseIds[0];
          const latestDate = bookings[0]?.class_instances?.class_date;
          studentCourseMap[studentId].push({
            courseIdentifier: primaryCourseId,
            classDate: latestDate
          });
        } else {
          // Split into separate courses
          courseIds.forEach(courseId => {
            const courseBookings = bookingsByCourse[courseId];
            const latestDate = courseBookings[0]?.class_instances?.class_date;
            studentCourseMap[studentId].push({
              courseIdentifier: courseId,
              classDate: latestDate
            });
          });
        }
      });

      // Sort courses by date (most recent first)
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

    // Calculate ended classes count for each student (classes where end time has passed)
    const now = new Date();
    const studentEndedClassesMap = {};

    allBookingsWithClasses.forEach(booking => {
      const studentId = booking.student_id;
      const classInstance = booking.class_instances;

      if (!classInstance || !classInstance.class_date || !classInstance.end_time) {
        return;
      }

      // Parse class date and end time to check if class has ended
      const classDate = classInstance.class_date.split('T')[0];
      const endTime = classInstance.end_time;

      const timeParts = endTime.match(/(\d+):(\d+)(am|pm)/i);
      if (!timeParts) return;

      let hours = parseInt(timeParts[1]);
      const minutes = parseInt(timeParts[2]);
      const period = timeParts[3].toLowerCase();

      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;

      const [year, month, day] = classDate.split('-');
      const classEndDateTime = new Date(year, month - 1, day, hours, minutes);

      // Count this class as ended if end time has passed
      if (classEndDateTime < now) {
        if (!studentEndedClassesMap[studentId]) {
          studentEndedClassesMap[studentId] = 0;
        }
        studentEndedClassesMap[studentId]++;
      }
    });

    // All students are already filtered during sync (only course purchasers were synced)
    const totalStudents = allStudents.length;

    // Active students: students who have bookings for classes on or after today OR have paused enrollments
    const today = now.toISOString().split('T')[0];

    // Get unique student IDs who have bookings for future classes
    const activeStudentIds = new Set();
    allBookingsWithClasses.forEach(booking => {
      const classDate = booking.class_instances?.class_date;
      if (classDate && classDate >= today && booking.student_id) {
        activeStudentIds.add(booking.student_id);
      }
    });

    // Also include students with paused enrollments (they need to continue their course)
    const { data: pausedEnrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('student_id')
      .eq('status', 'paused');

    if (pausedEnrollments) {
      pausedEnrollments.forEach(enrollment => {
        activeStudentIds.add(enrollment.student_id);
      });
    }

    const activeStudents = activeStudentIds.size;

    console.log(`👥 Student Management Stats: ${allStudents.length} total students, ${activeStudents} active students (with future bookings or paused enrollments)`);

    // Inactive students: students whose course has expired or no dates available
    const inactiveStudents = totalStudents - activeStudents;

    // Returning students: students with multiple course purchases within the last year
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    const returningStudents = allStudents.filter(s => {
      // Must have purchased more than one course
      if ((s.course_purchase_count || 0) <= 1) return false;

      // Must have a recent course purchase (within last year)
      if (!s.course_purchase_date) return false;
      const purchaseDate = new Date(s.course_purchase_date);
      return purchaseDate >= oneYearAgo;
    }).length;

    // Students by number of courses purchased
    const courseStats = {};
    allStudents.forEach(s => {
      const courseCount = bookingMap[s.id]?.courseCount || 0;
      if (courseCount > 0) {
        courseStats[courseCount] = (courseStats[courseCount] || 0) + 1;
      }
    });

    // Top 3 returning students (most courses purchased within last year)
    const topReturning = allStudents
      .filter(s => {
        if ((s.course_purchase_count || 0) <= 1) return false;
        if (!s.course_purchase_date) return false;
        const purchaseDate = new Date(s.course_purchase_date);
        return purchaseDate >= oneYearAgo;
      })
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

    // Get all active/paused enrollments to include status and weeks remaining
    const { data: allEnrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id, student_id, status, weeks_remaining, number_of_weeks, course_variant_title, course_title, schedule_pattern, class_time, course_start_date, course_end_date, course_type, created_at, package_total_courses')
      .in('status', ['active', 'paused']);

    const enrollmentMap = {};
    const activeEnrollmentIds = new Set();
    const studentActiveEnrollmentIds = {}; // student_id -> Set of enrollment IDs
    const studentActiveEnrollmentsMap = {}; // student_id -> active/paused enrollment rows
    if (allEnrollments) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      allEnrollments.forEach(enrollment => {
        activeEnrollmentIds.add(enrollment.id);
        if (!studentActiveEnrollmentIds[enrollment.student_id]) {
          studentActiveEnrollmentIds[enrollment.student_id] = new Set();
        }
        studentActiveEnrollmentIds[enrollment.student_id].add(enrollment.id);
        if (!studentActiveEnrollmentsMap[enrollment.student_id]) {
          studentActiveEnrollmentsMap[enrollment.student_id] = [];
        }
        studentActiveEnrollmentsMap[enrollment.student_id].push(enrollment);

        // Pick the most relevant enrollment per student:
        // Prefer the one closest to today (already started or about to start)
        // over one far in the future
        const existing = enrollmentMap[enrollment.student_id];
        if (!existing) {
          enrollmentMap[enrollment.student_id] = enrollment;
        } else {
          const existingStart = existing.course_start_date ? new Date(existing.course_start_date) : null;
          const newStart = enrollment.course_start_date ? new Date(enrollment.course_start_date) : null;

          if (existingStart && newStart) {
            const existingDiff = Math.abs(existingStart - today);
            const newDiff = Math.abs(newStart - today);
            // Pick the enrollment whose start date is closest to today
            if (newDiff < existingDiff) {
              enrollmentMap[enrollment.student_id] = enrollment;
            }
          } else if (newStart && !existingStart) {
            enrollmentMap[enrollment.student_id] = enrollment;
          }
        }
      });
    }

    // Compute cohort sizes for WT courses (group by normalized schedule + time + start date)
    const normalizeTimeStr = (t) => (t || '').toLowerCase().replace(/\s+/g, '');
    const cohortSizeMap = {}; // key: "schedule|normTime|startDate" → count
    if (allEnrollments) {
      const wtEnrollments = allEnrollments.filter(e =>
        e.course_type && e.course_type.toLowerCase().includes('wheelthrowing') && e.status === 'active'
      );
      for (const e of wtEnrollments) {
        const key = `${(e.schedule_pattern || '').toUpperCase()}|${normalizeTimeStr(e.class_time)}|${e.course_start_date}`;
        cohortSizeMap[key] = (cohortSizeMap[key] || 0) + 1;
      }
    }

    // Helper to get cohort size for a student's enrollment
    const getCohortSize = (studentId) => {
      const enrollment = enrollmentMap[studentId];
      if (!enrollment || !enrollment.schedule_pattern) return null;
      const key = `${(enrollment.schedule_pattern || '').toUpperCase()}|${normalizeTimeStr(enrollment.class_time)}|${enrollment.course_start_date}`;
      return cohortSizeMap[key] || null;
    };

    // Helper function to determine if a course is current (has started) or upcoming (all future)
    const getCourseStatus = (courseIdentifier, studentId) => {
      const baseCourseCode = courseIdentifier.split('.')[0];
      const courseBookings = allBookingsWithClasses.filter(booking => {
        if (booking.student_id !== studentId) return false;
        const classInstance = booking.class_instances;
        if (!classInstance || !classInstance.class_type) return false;
        return classInstance.class_type.startsWith(baseCourseCode);
      });

      if (courseBookings.length === 0) return 'upcoming';

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check if any class has started (date is today or in the past)
      const hasStarted = courseBookings.some(booking => {
        const classDate = new Date(booking.class_instances.class_date);
        classDate.setHours(0, 0, 0, 0);
        return classDate <= today;
      });

      // Check if any class is still in the future
      const hasFutureClasses = courseBookings.some(booking => {
        const classDate = new Date(booking.class_instances.class_date);
        classDate.setHours(0, 0, 0, 0);
        return classDate > today;
      });

      // If all classes are in the past, it's completed (not current)
      if (hasStarted && !hasFutureClasses) return 'completed';

      return hasStarted ? 'current' : 'upcoming';
    };

    const getPooledProgressForStudent = (student) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const activeEnrollmentsForStudent = (studentActiveEnrollmentsMap[student.id] || []).filter(e => {
        // Ignore stale "active" enrollments that have already ended
        if (e.status === 'active' && e.course_end_date) {
          const end = new Date(e.course_end_date);
          end.setHours(0, 0, 0, 0);
          if (end < today) return false;
        }
        return true;
      });
      const totalAllocatedFromEnrollments = activeEnrollmentsForStudent.reduce(
        (sum, e) => sum + (e.number_of_weeks || 0),
        0
      );

      const studentEnrollIds = new Set(activeEnrollmentsForStudent.map(e => e.id));
      const totalAttended = allBookingsWithClasses.filter(b => {
        if (b.student_id !== student.id) return false;
        if (!studentEnrollIds.has(b.course_enrollment_id)) return false;
        const ci = b.class_instances;
        if (!ci) return false;
        if (b.status === 'attended' || b.status === 'completed') return true;
        if (b.status === 'booked') {
          const d = new Date(ci.class_date); d.setHours(0,0,0,0);
          const t = new Date(); t.setHours(0,0,0,0);
          return d < t;
        }
        return false;
      }).length;

      // For Student Management progress, prefer allocation derived from ACTIVE/PAUSED enrollments.
      // Customer.classes_allocated can be lifetime/legacy and causes inflated values (e.g. 18).
      const inferredAllocated = totalAllocatedFromEnrollments || (student.classes_allocated || 0);

      const hasPooledAllocation =
        activeEnrollmentsForStudent.length > 1 || totalAllocatedFromEnrollments > 6;

      return {
        hasPooledAllocation,
        totalAttended,
        totalAllocated: inferredAllocated || 6
      };
    };

    const getStartedActiveEnrollment = (studentId) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const enrollments = (studentActiveEnrollmentsMap[studentId] || [])
        .filter(e => e.status === 'active');

      const started = enrollments.filter(e => {
        if (!e.course_start_date) return false;
        const start = new Date(e.course_start_date);
        start.setHours(0, 0, 0, 0);
        if (start > today) return false;

        // Exclude enrollments that have already ended
        if (e.course_end_date) {
          const end = new Date(e.course_end_date);
          end.setHours(0, 0, 0, 0);
          if (end < today) return false;
        }

        return true;
      });

      // A "current" enrollment should still have at least one future booked class.
      const startedWithFutureBookings = started.filter(e => {
        return allBookingsWithClasses.some(b => {
          if (b.student_id !== studentId) return false;
          if (b.course_enrollment_id !== e.id) return false;
          if (b.status !== 'booked') return false;
          const ci = b.class_instances;
          if (!ci?.class_date) return false;
          const d = new Date(ci.class_date);
          d.setHours(0, 0, 0, 0);
          return d >= today;
        });
      });

      // Prefer the most recently started active enrollment
      startedWithFutureBookings.sort((a, b) => {
        const aDate = a.course_start_date ? new Date(a.course_start_date) : new Date(0);
        const bDate = b.course_start_date ? new Date(b.course_start_date) : new Date(0);
        return bDate - aDate;
      });

      return startedWithFutureBookings[0] || null;
    };

    const getEnrollmentBaseCourseCode = (studentId, enrollmentId) => {
      if (!enrollmentId) return null;

      const enrollmentBookings = allBookingsWithClasses.filter(b =>
        b.student_id === studentId &&
        b.course_enrollment_id === enrollmentId &&
        b.booking_type !== 'makeup' &&
        b.class_instances?.class_type
      );

      if (enrollmentBookings.length === 0) return null;

      const latestRegularBooking = enrollmentBookings[0];
      return latestRegularBooking.class_instances?.class_type?.split('.')[0] || null;
    };

    const getCourseFromBaseCode = (courses, baseCourseCode) => {
      if (!baseCourseCode) return null;
      return courses.find(c => (c.courseIdentifier || '').split('.')[0] === baseCourseCode) || null;
    };

    // Paused Students List (students with paused enrollments)
    const pausedStudentsList = allStudents
      .filter(s => {
        const enrollment = enrollmentMap[s.id];
        return enrollment && enrollment.status === 'paused';
      })
      .map(s => {
        const courses = studentCourseMap[s.id] || [];
        const enrollment = enrollmentMap[s.id];
        const displayCourse = courses.length > 0 ? courses[0] : null;

        return {
          name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
          email: s.email,
          courseIdentifier: displayCourse?.courseIdentifier || null,
          variantTitle: enrollment?.course_variant_title || null,
          coursePurchaseCount: courses.length || 0,
          coursePurchaseDate: s.course_purchase_date,
          enrollmentStatus: 'paused',
          weeksRemaining: enrollment?.weeks_remaining || 0,
          cohortSize: getCohortSize(s.id)
        };
      })
      .sort((a, b) => {
        const dateA = a.coursePurchaseDate ? new Date(a.coursePurchaseDate) : new Date(0);
        const dateB = b.coursePurchaseDate ? new Date(b.coursePurchaseDate) : new Date(0);
        const dateCompare = dateB - dateA;
        if (dateCompare !== 0) return dateCompare;
        return a.name.localeCompare(b.name);
      });

    // Get HB student IDs early so we can exclude them from Active Students
    const { data: hbEnrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('student_id')
      .ilike('course_type', '%handbuilding%')
      .in('status', ['active', 'completed']);

    const hbStudentIds = new Set();
    if (hbEnrollments) {
      hbEnrollments.forEach(enrollment => hbStudentIds.add(enrollment.student_id));
    }

    // Active Students List (students who have bookings for classes on or after today)
    const activeStudentsList = allStudents
      .filter(s => {
        if (!activeStudentIds.has(s.id)) return false;

        // EXCLUDE students with paused enrollments (they're in their own section now)
        const enrollment = enrollmentMap[s.id];
        if (enrollment && enrollment.status === 'paused') return false;

        // EXCLUDE students who have HB enrollments (they go in HB Students section)
        if (hbStudentIds.has(s.id)) return false;

        const courses = studentCourseMap[s.id] || [];
        const startedActiveEnrollment = getStartedActiveEnrollment(s.id);
        if (startedActiveEnrollment) return true;
        // Fallback to booking-based status if enrollment dates are missing
        return courses.some(c => getCourseStatus(c.courseIdentifier, s.id) === 'current');
      })
      .map(s => {
        // Get all courses for this student
        const courses = studentCourseMap[s.id] || [];
        const startedActiveEnrollment = getStartedActiveEnrollment(s.id);
        const startedActiveBaseCourse = getEnrollmentBaseCourseCode(s.id, startedActiveEnrollment?.id);

        // Separate current and upcoming courses
        const currentCourse =
          getCourseFromBaseCode(courses, startedActiveBaseCourse) ||
          courses.find(c => getCourseStatus(c.courseIdentifier, s.id) === 'current');
        const upcomingCourses = courses.filter(c => getCourseStatus(c.courseIdentifier, s.id) === 'upcoming');

        // Use current course if available, otherwise use the most recent one
        const displayCourse = currentCourse || (courses.length > 0 ? courses[0] : null);
        const enrollment = startedActiveEnrollment || enrollmentMap[s.id];

        // For active students, calculate classes remaining from CURRENT COURSE ONLY
        // Get bookings for the current active course enrollment
        let currentCourseBookingsCount = 0;
        let endedClassesInCurrentCourse = 0;
        let futureBookingsCount = 0;

        // Get the current course identifier to filter bookings
        const currentCourseIdentifier = displayCourse?.courseIdentifier;
        const baseCourseCode = currentCourseIdentifier ? currentCourseIdentifier.split('.')[0] : null;

        // Filter bookings to ONLY the current course + makeup classes
        const getCurrentCourseBookings = (allBookings) => {
          return allBookings.filter(booking => {
            if (booking.student_id !== s.id) return false;

            // ALWAYS include makeup classes (admin rescheduled classes)
            if (booking.booking_type === 'makeup') return true;

            // If no base course code, include all non-makeup bookings
            if (!baseCourseCode) return true;

            const classInstance = booking.class_instances;
            if (!classInstance || !classInstance.class_type) return false;

            // Match bookings that belong to the current course
            return classInstance.class_type.startsWith(baseCourseCode);
          });
        };

        const currentCourseBookings = getCurrentCourseBookings(allBookingsWithClasses);

        // Count attended classes (EXACT SAME logic as Student Detail page)
        endedClassesInCurrentCourse = currentCourseBookings.filter(booking => {
          const classInstance = booking.class_instances;
          if (!classInstance) return false;

          // Count if status is 'attended' or 'completed'
          if (booking.status === 'attended' || booking.status === 'completed') {
            return true;
          }

          // Also count if status is 'booked' but class date is in the past
          if (booking.status === 'booked') {
            const classDate = new Date(classInstance.class_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            classDate.setHours(0, 0, 0, 0);
            return classDate < today;
          }

          return false;
        }).length;

        // Count future bookings for current course only
        futureBookingsCount = currentCourseBookings.filter(booking => {
          const classInstance = booking.class_instances;
          if (!classInstance) return false;
          if (booking.status !== 'booked') return false;

          const classDate = new Date(classInstance.class_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          classDate.setHours(0, 0, 0, 0);
          return classDate >= today;
        }).length;

        // Classes remaining = allocated - attended
        // For package / multi-enrollment students, use pooled math across active enrollments
        // Active Students table should show CURRENT COURSE progress only (not pooled purchases)
        const currentCourseAllocated = enrollment?.number_of_weeks || 6;
        const classesRemaining = Math.max(0, currentCourseAllocated - endedClassesInCurrentCourse);

        return {
          name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
          email: s.email,
          courseIdentifier: displayCourse?.courseIdentifier || null, // Show only current course
          variantTitle: enrollment?.course_variant_title || buildVariantTitleFromBookings(s.id, displayCourse?.courseIdentifier) || null,
          coursePurchaseCount: courses.length || 0,
          coursePurchaseDate: s.course_purchase_date,
          enrollmentCreatedAt: enrollment?.created_at || s.course_purchase_date || null,
          enrollmentStatus: enrollment?.status || 'active',
          weeksRemaining: classesRemaining,
          classesAttended: endedClassesInCurrentCourse,
          classesAllocated: currentCourseAllocated,
          packageTotalCourses: enrollment?.package_total_courses || null,
          hasUpcomingCourse: upcomingCourses.length > 0, // Flag to indicate student has upcoming courses
          cohortSize: getCohortSize(s.id)
        };
      })
      .sort((a, b) => {
        // Sort: Active students first, then paused students
        if (a.enrollmentStatus !== b.enrollmentStatus) {
          return a.enrollmentStatus === 'active' ? -1 : 1;
        }
        // Within same status, sort by course purchase date (most recent first), then by name
        const dateA = a.coursePurchaseDate ? new Date(a.coursePurchaseDate) : new Date(0);
        const dateB = b.coursePurchaseDate ? new Date(b.coursePurchaseDate) : new Date(0);
        const dateCompare = dateB - dateA; // Most recent first
        if (dateCompare !== 0) return dateCompare;
        return a.name.localeCompare(b.name);
      });

    // Returning Students List (students with multiple purchases within last year)
    const returningStudentsList = allStudents
      .filter(s => {
        if ((s.course_purchase_count || 0) <= 1) return false;
        if (!s.course_purchase_date) return false;
        const purchaseDate = new Date(s.course_purchase_date);
        return purchaseDate >= oneYearAgo;
      })
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
        // Sort by course purchase count (highest first), then by name
        const countCompare = (b.coursePurchaseCount || 0) - (a.coursePurchaseCount || 0);
        if (countCompare !== 0) return countCompare;
        return a.name.localeCompare(b.name);
      });

    // Upcoming Enrollments List (students with courses that haven't started yet)
    // Debug: Check Meghna's course map
    const meghnaStudent = allStudents.find(s => s.email === 'meghna@newcampus.com');
    if (meghnaStudent) {
      const meghnaCourses = studentCourseMap[meghnaStudent.id] || [];
      console.log(`[DEBUG Meghna] id=${meghnaStudent.id}, classes_allocated=${meghnaStudent.classes_allocated}, courses in map:`, meghnaCourses.length);
      meghnaCourses.forEach(c => console.log(`  course: ${c.courseIdentifier}, status: ${getCourseStatus(c.courseIdentifier, meghnaStudent.id)}`));
      console.log(`[DEBUG Meghna] isHB: ${hbStudentIds.has(meghnaStudent.id)}`);
    }

    // Build set of student IDs already in active list to avoid duplicates
    const activeListStudentIds = new Set(activeStudentsList.map(s => {
      // Find the customer by email to get the DB id
      const customer = allStudents.find(c => c.email === s.email);
      return customer?.id;
    }).filter(Boolean));

    const upcomingEnrollmentsList = allStudents
      .filter(s => {
        // EXCLUDE students already in the active list
        if (activeListStudentIds.has(s.id)) return false;

        // EXCLUDE HB students (they have their own section)
        if (hbStudentIds.has(s.id)) return false;

        // Must have an active/paused enrollment record to appear in Student Management upcoming list.
        // This prevents historical students with stale/future-coded course identifiers from leaking in.
        const enrollment = enrollmentMap[s.id];
        if (!enrollment || !['active', 'paused'].includes(enrollment.status)) return false;

        const courses = studentCourseMap[s.id] || [];
        // Only include students who have at least one upcoming course
        return courses.some(c => getCourseStatus(c.courseIdentifier, s.id) === 'upcoming');
      })
      .map(s => {
        const courses = studentCourseMap[s.id] || [];
        // Get all upcoming courses for this student
        const upcomingCourses = courses.filter(c => getCourseStatus(c.courseIdentifier, s.id) === 'upcoming');
        const enrollment = enrollmentMap[s.id];

        // Upcoming course hasn't started yet
        const pooledProgress = getPooledProgressForStudent(s);
        const isPackageStudent = pooledProgress.hasPooledAllocation;
        let classesRemaining;
        let classesAllocated;
        let classesAttended;

        if (isPackageStudent) {
          classesAllocated = pooledProgress.totalAllocated;
          classesAttended = pooledProgress.totalAttended;
          classesRemaining = Math.max(0, classesAllocated - classesAttended);
        } else {
          // Fresh course purchase → full course weeks remaining
          classesAllocated = enrollment?.number_of_weeks || 6;
          classesAttended = 0;
          classesRemaining = classesAllocated;
        }

        return {
          name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unknown',
          email: s.email,
          courseIdentifier: upcomingCourses[0]?.courseIdentifier || null,
          variantTitle: enrollment?.course_variant_title || buildVariantTitleFromBookings(s.id, upcomingCourses[0]?.courseIdentifier) || null,
          startDate: upcomingCourses[0]?.classDate || null,
          coursePurchaseCount: s.course_purchase_count || 0,
          coursePurchaseDate: s.course_purchase_date,
          enrollmentCreatedAt: enrollment?.created_at || s.course_purchase_date || null,
          weeksRemaining: classesRemaining,
          classesAllocated,
          classesAttended,
          packageTotalCourses: enrollment?.package_total_courses || null,
          cohortSize: getCohortSize(s.id)
        };
      })
      .sort((a, b) => {
        // Sort by start date (earliest first)
        const dateA = a.startDate ? new Date(a.startDate) : new Date(0);
        const dateB = b.startDate ? new Date(b.startDate) : new Date(0);
        const dateCompare = dateA - dateB;
        if (dateCompare !== 0) return dateCompare;
        return a.name.localeCompare(b.name);
      });

    // Debug: Log Joey Lee's data
    const joey = activeStudentsList.find(s => s.name?.toLowerCase().includes('joey') && s.name?.toLowerCase().includes('lee'));
    if (joey) {
      console.log('📊 JOEY LEE FOUND - Classes Remaining:', joey.weeksRemaining, '(Expected: 8)');
      console.log('   Full stats:', JSON.stringify({
        name: joey.name,
        courseIdentifier: joey.courseIdentifier,
        enrollmentStatus: joey.enrollmentStatus,
        weeksRemaining: joey.weeksRemaining
      }));
    } else {
      console.log('⚠️  Joey Lee not found in activeStudentsList');
    }

    // Debug: Log upcoming enrollments
    if (upcomingEnrollmentsList.length > 0) {
      console.log(`\n📋 UPCOMING ENROLLMENTS (${upcomingEnrollmentsList.length}):`);
      upcomingEnrollmentsList.forEach(s => {
        console.log(`  - ${s.name} (${s.email}): ${s.courseIdentifier} starts ${s.startDate}`);
      });
    }

    // Log total students for debugging
    console.log(`📊 Returning ${activeStudentsList.length} active students, ${pausedStudentsList.length} paused students, ${upcomingEnrollmentsList.length} upcoming enrollments`);
    // Debug: log a few students' progress data
    activeStudentsList.slice(0, 3).forEach(s => console.log(`  DEBUG ${s.name}: attended=${s.classesAttended}, allocated=${s.classesAllocated}, remaining=${s.weeksRemaining}`));

    // HB Students: Get full details for HB enrollments (we already have student IDs)
    const { data: hbEnrollmentsDetailed } = await supabaseDb.supabase
      .from('course_enrollments')
      .select(`
        id, student_id, course_title, course_variant_title, course_type, status,
        class_credits_allocated, class_credits_used, class_credits_remaining,
        schedule_pattern, class_time,
        bookings_created_at, course_start_date, course_end_date,
        number_of_weeks, created_at
      `)
      .ilike('course_type', '%handbuilding%')
      .in('status', ['active', 'completed']);

    const hbStudentsList = [];
    if (hbEnrollmentsDetailed) {
      for (const enrollment of hbEnrollmentsDetailed) {
        const student = allStudents.find(s => s.id === enrollment.student_id);
        if (!student) continue;

        // Get bookings for this enrollment to determine schedule status
        const enrollmentBookings = allBookingsWithClasses.filter(
          b => b.course_enrollment_id === enrollment.id
        );

        // Find next upcoming class
        const futureBookings = enrollmentBookings.filter(b => {
          const classDate = new Date(b.class_instances?.class_date);
          return classDate >= now;
        }).sort((a, b) =>
          new Date(a.class_instances?.class_date) - new Date(b.class_instances?.class_date)
        );

        const nextClass = futureBookings.length > 0
          ? futureBookings[0].class_instances?.class_date
          : null;

        // Determine schedule status
        let scheduleStatus = 'unbooked';
        if (enrollmentBookings.length > 0 && futureBookings.length > 0) {
          scheduleStatus = 'scheduled';
        } else if (enrollmentBookings.length > 0 && futureBookings.length === 0) {
          scheduleStatus = 'completed';
        }

        hbStudentsList.push({
          name: `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown',
          email: student.email,
          courseTitle: enrollment.course_title || 'Handbuilding',
          variantTitle: enrollment.course_variant_title || null,
          scheduleDay: enrollment.schedule_pattern || null,
          classTime: enrollment.class_time || null,
          creditsAllocated: enrollment.class_credits_allocated || 0,
          creditsUsed: enrollment.class_credits_used || 0,
          creditsRemaining: enrollment.class_credits_remaining || 0,
          scheduleStatus,
          nextClass,
          totalBookings: enrollmentBookings.length,
          enrollmentStatus: enrollment.status,
          enrollmentId: enrollment.id,
          createdAt: enrollment.created_at,
          purchaseCount: student.course_purchase_count || 1
        });
      }
    }

    // Sort: unbooked first (needs attention), then scheduled, then completed
    hbStudentsList.sort((a, b) => {
      const statusOrder = { unbooked: 0, scheduled: 1, completed: 2 };
      const orderDiff = (statusOrder[a.scheduleStatus] || 99) - (statusOrder[b.scheduleStatus] || 99);
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name);
    });

    console.log(`🎨 HB Students: ${hbStudentsList.length} (${hbStudentsList.filter(s => s.scheduleStatus === 'unbooked').length} unbooked, ${hbStudentsList.filter(s => s.scheduleStatus === 'scheduled').length} scheduled)`);

    // ── Membership data for unified Users page ──────────────────────────────
    const { data: allMemberships } = await supabaseDb.supabase
      .from('memberships')
      .select(`
        id, customer_id, membership_type, status, start_date, end_date, perks,
        customers!memberships_customer_id_fkey (
          id, email, first_name, last_name, customer_type
        )
      `);

    // Build set of emails already in student lists (active, upcoming, hb, paused)
    const studentEmails = new Set([
      ...activeStudentsList.map(s => s.email),
      ...upcomingEnrollmentsList.map(s => s.email),
      ...hbStudentsList.map(s => s.email),
      ...pausedStudentsList.map(s => s.email),
    ]);

    const membersList = [];
    const membershipByEmail = {}; // email -> membership data (for attaching to dual-role students)

    if (allMemberships) {
      for (const m of allMemberships) {
        if (!m.customers) continue;
        const email = m.customers.email;
        const name = `${m.customers.first_name || ''} ${m.customers.last_name || ''}`.trim() || 'Unknown';
        const daysLeft = Math.ceil((new Date(m.end_date) - new Date()) / (1000 * 60 * 60 * 24));
        const totalDays = Math.ceil((new Date(m.end_date) - new Date(m.start_date)) / (1000 * 60 * 60 * 24));
        let derivedStatus = m.status;
        if (m.status !== 'cancelled') {
          if (daysLeft < 0) derivedStatus = 'expired';
          else if (daysLeft <= 30) derivedStatus = 'expiring';
          else derivedStatus = 'active';
        }

        const membershipData = {
          membershipId: m.id,
          membershipType: m.membership_type,
          membershipStatus: derivedStatus,
          startDate: m.start_date,
          endDate: m.end_date,
          daysRemaining: Math.max(0, daysLeft),
          totalDays,
          perks: m.perks,
        };

        // Store by email for cross-referencing with students
        membershipByEmail[email] = membershipData;

        // If this person is NOT already in the student lists, add to members-only list
        if (!studentEmails.has(email)) {
          membersList.push({
            name,
            email,
            customerType: m.customers.customer_type || 'member',
            ...membershipData,
          });
        }
      }
    }

    // Sort members: active first, then by expiry date
    membersList.sort((a, b) => {
      const order = { active: 0, expiring: 1, expired: 2, cancelled: 3 };
      const sa = order[a.membershipStatus] ?? 4;
      const sb = order[b.membershipStatus] ?? 4;
      if (sa !== sb) return sa - sb;
      return (a.daysRemaining || 0) - (b.daysRemaining || 0);
    });

    console.log(`🎫 Members: ${membersList.length} members-only, ${Object.keys(membershipByEmail).length} total memberships`);

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
      pausedStudentsList,
      returningStudentsList,
      upcomingEnrollmentsList,
      hbStudentsList,
      membersList,
      membershipByEmail,
      message: 'Student statistics calculated successfully'
    });

  } catch (error) {
    console.error('Error fetching student stats:', error);
    res.status(500).json({ error: 'Failed to fetch student stats' });
  }
});

// Get paused students
app.get('/api/admin/students/paused/list', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Get all paused enrollments
    const { data: pausedEnrollments, error } = await supabaseDb.supabase
      .from('course_enrollments')
      .select(`
        id,
        student_id,
        course_title,
        course_type,
        course_identifier,
        number_of_weeks,
        weeks_completed,
        weeks_remaining,
        course_start_date,
        updated_at,
        customers (
          id,
          first_name,
          last_name,
          email
        )
      `)
      .eq('status', 'paused')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // Format the response
    const pausedStudents = pausedEnrollments.map(enrollment => ({
      enrollmentId: enrollment.id,
      studentId: enrollment.student_id,
      name: `${enrollment.customers.first_name || ''} ${enrollment.customers.last_name || ''}`.trim(),
      email: enrollment.customers.email,
      courseTitle: enrollment.course_title,
      courseType: enrollment.course_type,
      courseIdentifier: enrollment.course_identifier,
      totalWeeks: enrollment.number_of_weeks,
      weeksCompleted: enrollment.weeks_completed || 0,
      weeksRemaining: enrollment.weeks_remaining || enrollment.number_of_weeks,
      pausedDate: enrollment.updated_at,
      courseStartDate: enrollment.course_start_date
    }));

    res.json({
      count: pausedStudents.length,
      students: pausedStudents
    });

  } catch (error) {
    console.error('Error fetching paused students:', error);
    res.status(500).json({ error: 'Failed to fetch paused students' });
  }
});

// Resume a paused student
app.post('/api/admin/students/:id/resume', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const studentId = parseInt(req.params.id);

    // Get the student's paused enrollment
    const { data: enrollment, error: fetchError } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', studentId)
      .eq('status', 'paused')
      .single();

    if (fetchError || !enrollment) {
      return res.status(404).json({ error: 'No paused enrollment found for this student' });
    }

    // Update enrollment status to active
    const { error: updateError } = await supabaseDb.supabase
      .from('course_enrollments')
      .update({
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollment.id);

    if (updateError) {
      console.error('Error resuming enrollment:', updateError);
      return res.status(500).json({ error: 'Failed to resume enrollment' });
    }

    res.json({
      success: true,
      message: 'Student enrollment resumed successfully',
      enrollment: {
        id: enrollment.id,
        studentId: enrollment.student_id,
        courseTitle: enrollment.course_title,
        weeksCompleted: enrollment.weeks_completed,
        weeksRemaining: enrollment.weeks_remaining
      }
    });
  } catch (error) {
    console.error('Error resuming student:', error);
    res.status(500).json({ error: 'Failed to resume student' });
  }
});

// Get single student details
app.get('/api/admin/students/:email', authenticateToken, requireAdmin, async (req, res) => {
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

    // Calculate classes_allocated from active enrollments only (not lifetime cumulative)
    const { data: activeEnrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id, number_of_weeks')
      .eq('student_id', student.id)
      .eq('status', 'active');

    if (activeEnrollments && activeEnrollments.length > 0) {
      const enrollmentIds = activeEnrollments.map(e => e.id);

      // Sum allocation from active enrollments only
      student.classes_allocated = activeEnrollments.reduce((sum, e) => sum + (e.number_of_weeks || 0), 0);

      // Get attended bookings from active enrollments only
      const { data: attendedBookings } = await supabaseDb.supabase
        .from('bookings')
        .select('id')
        .eq('student_id', student.id)
        .in('course_enrollment_id', enrollmentIds)
        .eq('status', 'attended');

      student.classes_used = attendedBookings ? attendedBookings.length : 0;
    } else {
      student.classes_used = 0;
    }

    // Fetch membership data from memberships table
    const { data: memberships } = await supabaseDb.supabase
      .from('memberships')
      .select('id, membership_type, start_date, end_date, status, perks')
      .eq('customer_id', student.id)
      .order('end_date', { ascending: false });

    if (memberships && memberships.length > 0) {
      // Find active membership first, else most recent
      const activeMembership = memberships.find(m => m.status === 'active') || memberships[0];
      student.membership = {
        id: activeMembership.id,
        type: activeMembership.membership_type,
        startDate: activeMembership.start_date,
        endDate: activeMembership.end_date,
        status: activeMembership.status,
        perks: activeMembership.perks,
      };
      student.membershipHistory = memberships.map(m => ({
        id: m.id,
        type: m.membership_type,
        startDate: m.start_date,
        endDate: m.end_date,
        status: m.status,
      }));
    }

    res.json(student);
  } catch (error) {
    console.error('Error fetching student:', error);
    res.status(500).json({ error: 'Failed to fetch student' });
  }
});

// Get student enrollment
app.get('/api/admin/students/:id/enrollment', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const studentId = parseInt(req.params.id);

    // Get all enrollments for the student (including completed for history)
    const { data: enrollments, error } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*')
      .eq('student_id', studentId)
      .order('course_start_date', { ascending: false });

    if (error) {
      throw error;
    }

    if (!enrollments || enrollments.length === 0) {
      return res.json(null);
    }

    // Split into active/paused vs completed
    const activeEnrollments = enrollments.filter(e => e.status === 'active' || e.status === 'paused');
    const completedEnrollments = enrollments.filter(e => e.status === 'completed');

    // Separate individual courses from package courses (among active)
    const individualCourses = activeEnrollments.filter(e => !e.package_total_courses || e.package_total_courses === null);
    const packageCourses = activeEnrollments.filter(e => e.package_total_courses && e.package_total_courses > 0);

    // If we have both individual and package courses, return individual as current
    let currentEnrollment;
    if (individualCourses.length > 0) {
      currentEnrollment = individualCourses[0]; // Most recent individual course
    } else if (packageCourses.length > 0) {
      currentEnrollment = packageCourses[0]; // Most recent package if no individual
    } else if (activeEnrollments.length > 0) {
      currentEnrollment = activeEnrollments[0]; // Fallback to most recent active
    } else {
      currentEnrollment = null;
    }

    // If course_identifier is missing, derive it from the student's bookings for this enrollment
    if (currentEnrollment && !currentEnrollment.course_identifier) {
      const { data: bookings } = await supabaseDb.supabase
        .from('bookings')
        .select('class_instance_id')
        .eq('student_id', studentId)
        .eq('course_enrollment_id', currentEnrollment.id)
        .in('status', ['booked', 'attended', 'completed'])
        .limit(1);

      if (bookings && bookings.length > 0) {
        const { data: cls } = await supabaseDb.supabase
          .from('class_instances')
          .select('class_type')
          .eq('id', bookings[0].class_instance_id)
          .single();

        if (cls?.class_type) {
          const derived = cls.class_type.split('.')[0]; // e.g. WT0103AM_DL6.1 → WT0103AM_DL6
          currentEnrollment = { ...currentEnrollment, course_identifier: derived };
          // Backfill the DB so it's correct next time
          await supabaseDb.supabase
            .from('course_enrollments')
            .update({ course_identifier: derived })
            .eq('id', currentEnrollment.id);
        }
      }
    }

    // If this is a package enrollment, count completed courses in the package
    if (currentEnrollment && currentEnrollment.package_total_courses && currentEnrollment.package_total_courses > 1) {
      const { data: allEnrollments } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('id, status')
        .eq('student_id', studentId)
        .ilike('course_title', '%3 Course Package%');

      const completedInPackage = (allEnrollments || []).filter(e => e.status === 'completed').length;
      const activeInPackage = (allEnrollments || []).filter(e => e.status === 'active').length;
      currentEnrollment = {
        ...currentEnrollment,
        package_courses_completed: completedInPackage,
        package_current_course: completedInPackage + activeInPackage,
        package_courses_remaining: currentEnrollment.package_total_courses - completedInPackage - activeInPackage,
      };
    }

    // Return current enrollment with completed history attached
    if (currentEnrollment) {
      currentEnrollment.completed_history = completedEnrollments;
      res.json(currentEnrollment);
    } else if (completedEnrollments.length > 0) {
      // No active enrollment but has history — return null current with history
      res.json({ no_active: true, completed_history: completedEnrollments });
    } else {
      res.json(null);
    }
  } catch (error) {
    console.error('Error fetching enrollment:', error);
    res.status(500).json({ error: 'Failed to fetch enrollment' });
  }
});

// Pause an enrollment
app.post('/api/admin/enrollments/:id/pause', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const enrollmentId = parseInt(req.params.id);
    const { weeksCompleted, weeksRemaining, reason } = req.body;

    // Get the enrollment first
    const { data: enrollment, error: fetchError } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*, customers(first_name, last_name, email)')
      .eq('id', enrollmentId)
      .single();

    if (fetchError || !enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    if (enrollment.status !== 'active') {
      return res.status(400).json({ error: 'Enrollment is not active' });
    }

    // Update enrollment to paused
    const { error: updateError } = await supabaseDb.supabase
      .from('course_enrollments')
      .update({
        status: 'paused',
        weeks_completed: weeksCompleted,
        weeks_remaining: weeksRemaining,
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollmentId);

    if (updateError) {
      console.error('Error pausing enrollment:', updateError);
      return res.status(500).json({ error: 'Failed to pause enrollment' });
    }

    // Get all bookings for this student and mark attended/cancelled based on weeks completed
    const { data: bookings } = await supabaseDb.supabase
      .from('bookings')
      .select('id, status, class_instances!bookings_class_instance_id_fkey(class_date)')
      .eq('student_id', enrollment.student_id)
      .order('class_instances(class_date)', { ascending: true });

    if (bookings && bookings.length > 0) {
      // Mark first N bookings as attended
      if (weeksCompleted > 0) {
        const completedBookingIds = bookings.slice(0, weeksCompleted).map(b => b.id);
        await supabaseDb.supabase
          .from('bookings')
          .update({ attended: true })
          .in('id', completedBookingIds);
      }

      // Cancel remaining bookings
      const remainingBookingIds = bookings.slice(weeksCompleted).map(b => b.id);
      if (remainingBookingIds.length > 0) {
        await supabaseDb.supabase
          .from('bookings')
          .update({ status: 'cancelled' })
          .in('id', remainingBookingIds);
      }
    }

    console.log(`✅ Paused enrollment ${enrollmentId} for student ${enrollment.student_id} - ${weeksCompleted}/${enrollment.number_of_weeks} weeks`);

    res.json({
      success: true,
      message: 'Enrollment paused successfully',
      enrollment: {
        id: enrollmentId,
        weeksCompleted,
        weeksRemaining,
        status: 'paused'
      }
    });
  } catch (error) {
    console.error('Error pausing enrollment:', error);
    res.status(500).json({ error: 'Failed to pause enrollment' });
  }
});

// Get dashboard stats summary (lightweight, count-only)
app.get('/api/admin/dashboard/stats/summary', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    const [
      { count: totalStudents, error: e1 },
      { count: totalClasses, error: e2 },
      { count: totalBookings, error: e3 },
      { count: activeMemberships, error: e4 },
      { count: galleryPieces, error: e5 },
      { count: pendingStudioAccess, error: e6 }
    ] = await Promise.all([
      supabaseDb.supabase
        .from('customers')
        .select('*', { count: 'exact', head: true }),
      supabaseDb.supabase
        .from('class_instances')
        .select('*', { count: 'exact', head: true })
        .gte('class_date', todayStr),
      supabaseDb.supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .in('status', ['booked', 'attended']),
      supabaseDb.supabase
        .from('memberships')
        .select('*', { count: 'exact', head: true })
        .in('status', ['active', 'expiring']),
      supabaseDb.supabase
        .from('pottery_pieces')
        .select('*', { count: 'exact', head: true }),
      supabaseDb.supabase
        .from('studio_access_bookings')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
    ]);

    const err = e1 || e2 || e3 || e4 || e5 || e6;
    if (err) throw err;

    res.json({
      totalStudents: totalStudents || 0,
      totalClasses: totalClasses || 0,
      totalBookings: totalBookings || 0,
      activeMemberships: activeMemberships || 0,
      galleryPieces: galleryPieces || 0,
      pendingStudioAccess: pendingStudioAccess || 0
    });
  } catch (error) {
    console.error('Error fetching dashboard stats summary:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats summary' });
  }
});

// Get dashboard stats
app.get('/api/admin/dashboard/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Get period filter from query params
    const { startDate: periodStart, endDate: periodEnd } = req.query;

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayOfWeek = new Date(now);
    firstDayOfWeek.setDate(now.getDate() - now.getDay());

    // Use period dates if provided, otherwise use current date
    const filterStartDate = periodStart || null;
    const filterEndDate = periodEnd || null;

    console.log(`📊 Dashboard Stats Request: Period ${filterStartDate || 'All'} to ${filterEndDate || 'All'}`);

    // Fetch all customers with pagination (Supabase default limit is 1000)
    let allStudents = [];
    let page = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabaseDb.supabase
        .from('customers')
        .select('id, created_at, course_purchase_count, course_purchase_date, course_expiry_date')
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
    // Apply period filter if provided
    let classQuery = supabaseDb.supabase
      .from('class_instances')
      .select('id, class_date, max_capacity');

    if (filterStartDate && filterEndDate) {
      classQuery = classQuery.gte('class_date', filterStartDate).lte('class_date', filterEndDate);
    }

    const results = await Promise.allSettled([
      classQuery,
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
    // Active students: students who have bookings for classes on or after today OR have paused enrollments
    const activeStudentIds = new Set();
    allBookings.forEach(booking => {
      const classDate = classDateMap[booking.class_instance_id];
      if (classDate && classDate >= today && booking.student_id) {
        activeStudentIds.add(booking.student_id);
      }
    });

    // Also include students with paused enrollments
    const { data: pausedEnrollments } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('student_id')
      .eq('status', 'paused');

    if (pausedEnrollments) {
      pausedEnrollments.forEach(enrollment => {
        activeStudentIds.add(enrollment.student_id);
      });
    }

    console.log(`📊 Dashboard Stats: ${allStudents.length} total students, ${activeStudentIds.size} active students (with future bookings or paused enrollments), ${allBookings.length} bookings, ${allClasses.length} total classes (${futureClasses.length} future), ${allMemberships.length} memberships, ${allGalleryPieces.length} gallery pieces`);

    // Get full student objects for active students
    const activeStudents = allStudents.filter(s => activeStudentIds.has(s.id));

    const newStudentsThisMonth = activeStudents.filter(s =>
      new Date(s.created_at) >= firstDayOfMonth
    ).length;

    // Returning students: students with multiple course purchases within the last year
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    const returningStudents = allStudents.filter(s => {
      // Must have purchased more than one course
      if ((s.course_purchase_count || 0) <= 1) return false;

      // Must have a recent course purchase (within last year)
      if (!s.course_purchase_date) return false;
      const purchaseDate = new Date(s.course_purchase_date);
      return purchaseDate >= oneYearAgo;
    }).length;

    // Get paused students count (reuse pausedEnrollments from active students calculation above)
    const pausedStudentsCount = pausedEnrollments ? new Set(pausedEnrollments.map(e => e.student_id)).size : 0;

    // Calculate class stats
    // Total enrolled = unique students with bookings
    const totalEnrolled = new Set(allBookings.map(b => b.student_id)).size;

    // Use future classes for capacity calculation
    const totalCapacity = futureClasses.reduce((sum, cls) => sum + (cls.max_capacity || 8), 0);
    const futureClassIdSet = new Set(futureClasses.map(c => c.id));
    const futureBookings = allBookings.filter(b => futureClassIdSet.has(b.class_instance_id));
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

    // Studio access stats
    const { data: studioBookings } = await supabaseDb.supabase
      .from('studio_access_bookings')
      .select('id, status, booking_date')
      .neq('status', 'cancelled');
    const todayStr2 = now.toISOString().split('T')[0];
    const studioUpcoming = (studioBookings || []).filter(b => b.booking_date >= todayStr2).length;
    const studioPending = (studioBookings || []).filter(b => b.status === 'pending').length;
    const studioConfirmed = (studioBookings || []).filter(b => b.status === 'booked' && b.booking_date >= todayStr2).length;

    res.json({
      students: {
        total: activeStudentIds.size, // Count students with future bookings (matches Student Management)
        newThisMonth: newStudentsThisMonth,
        returning: returningStudents,
        paused: pausedStudentsCount
      },
      classes: {
        total: futureClasses.length,
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
      },
      studioAccess: {
        upcoming: studioUpcoming,
        pending: studioPending,
        confirmed: studioConfirmed
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats', details: error.message });
  }
});

// Dashboard alerts + recent activity
app.get('/api/admin/dashboard/activity', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const fourteenDaysFromNow = new Date(now);
    fourteenDaysFromNow.setDate(now.getDate() + 14);
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(now.getDate() + 7);
    const sevenDaysStr = sevenDaysFromNow.toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

    const [alertMembershipsRes, recentBookingsRes, recentMembershipsRes, upcomingClassesRes, recentEnrollmentsRes, recentPiecesRes, todayClassesRes, pendingStudioAccessRes, recentStudioAccessRes] = await Promise.all([
      // Memberships expiring within 14 days
      supabaseDb.supabase
        .from('memberships')
        .select('id, membership_type, end_date, customer:customers!memberships_customer_id_fkey(first_name, last_name)')
        .eq('status', 'active')
        .lte('end_date', fourteenDaysFromNow.toISOString().split('T')[0])
        .gte('end_date', today)
        .order('end_date', { ascending: true })
        .limit(6),

      // Recent bookings + cancellations
      supabaseDb.supabase
        .from('bookings')
        .select('id, status, created_at, student:customers!bookings_student_id_fkey(first_name, last_name), class_instance:class_instances!bookings_class_instance_id_fkey(class_date, class_type, start_time)')
        .in('status', ['booked', 'cancelled'])
        .order('created_at', { ascending: false })
        .limit(20),

      // Recent memberships created
      supabaseDb.supabase
        .from('memberships')
        .select('id, membership_type, created_at, customer:customers!memberships_customer_id_fkey(first_name, last_name)')
        .order('created_at', { ascending: false })
        .limit(5),

      // Upcoming classes this week (for near-full alerts)
      supabaseDb.supabase
        .from('class_instances')
        .select('id, class_date, class_type, start_time, max_capacity')
        .gte('class_date', today)
        .lte('class_date', sevenDaysStr)
        .order('class_date', { ascending: true })
        .limit(30),

      // Recent enrollments
      supabaseDb.supabase
        .from('course_enrollments')
        .select('id, course_name, status, created_at, student:customers!course_enrollments_student_id_fkey(first_name, last_name)')
        .gte('created_at', thirtyDaysAgoStr)
        .order('created_at', { ascending: false })
        .limit(10),

      // Recent gallery pieces
      supabaseDb.supabase
        .from('pottery_pieces')
        .select('id, title, created_at, student:customers!pottery_pieces_student_id_fkey(first_name, last_name)')
        .gte('created_at', thirtyDaysAgoStr)
        .order('created_at', { ascending: false })
        .limit(5),

      // Today's classes (for "classes today" alert)
      supabaseDb.supabase
        .from('class_instances')
        .select('id, class_date, class_type, start_time')
        .eq('class_date', today),

      // Pending studio access bookings
      supabaseDb.supabase
        .from('studio_access_bookings')
        .select('id', { count: 'exact' })
        .eq('status', 'pending'),

      // Recent studio access bookings (for activity feed)
      supabaseDb.supabase
        .from('studio_access_bookings')
        .select('id, booking_date, start_time, hours, amount_sgd, status, created_at, customer:customers(first_name, last_name)')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    // ── Alerts ──────────────────────────────────────────────────────────────
    const alerts = [];
    const alertKeys = new Set();

    function addAlert(type, icon, text, priority) {
      if (alertKeys.has(text)) return;
      alertKeys.add(text);
      alerts.push({ type, icon, text, priority });
    }

    // Today's classes summary
    const todayClasses = todayClassesRes.data || [];
    if (todayClasses.length > 0) {
      const wtCount = todayClasses.filter(c => (c.class_type || '').startsWith('WT')).length;
      const hbCount = todayClasses.filter(c => (c.class_type || '').startsWith('HB')).length;
      const parts = [];
      if (wtCount) parts.push(`${wtCount} WT`);
      if (hbCount) parts.push(`${hbCount} HB`);
      addAlert('info', 'today', `${todayClasses.length} class${todayClasses.length !== 1 ? 'es' : ''} today — ${parts.join(', ')}`, 0);
    }

    // Near-full / full class alerts
    const upcomingClasses = upcomingClassesRes.data || [];
    if (upcomingClasses.length > 0) {
      const classIds = upcomingClasses.map(c => c.id);
      const { data: classBookings } = await supabaseDb.supabase
        .from('bookings')
        .select('class_instance_id')
        .in('class_instance_id', classIds)
        .in('status', ['booked', 'attended']);

      const bookingCounts = {};
      (classBookings || []).forEach(b => {
        bookingCounts[b.class_instance_id] = (bookingCounts[b.class_instance_id] || 0) + 1;
      });

      upcomingClasses.forEach(c => {
        const booked = bookingCounts[c.id] || 0;
        const capacity = c.max_capacity || 8;
        const spotsLeft = capacity - booked;
        if (spotsLeft <= 2 && booked > 0) {
          const rawDate = (c.class_date || '').split('T')[0];
          const dateStr = rawDate ? new Date(rawDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
          const typeLabel = (c.class_type || '').startsWith('WT') ? 'Wheelthrowing' : (c.class_type || '').startsWith('HB') ? 'Handbuilding' : (c.class_type || '').substring(0, 10);
          if (spotsLeft === 0) {
            addAlert('class', 'event_busy', `${typeLabel} ${dateStr} — fully booked`, 1);
          } else {
            addAlert('class', 'event_available', `${typeLabel} ${dateStr} — ${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`, 2);
          }
        }
      });
    }

    // Membership expiry alerts
    (alertMembershipsRes.data || []).forEach(m => {
      const endDate = new Date(m.end_date + 'T12:00:00');
      const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
      const name = m.customer ? `${m.customer.first_name} ${m.customer.last_name}`.trim() : 'Unknown';
      const urgency = daysLeft <= 3 ? 'expires in ' + daysLeft + 'd' : 'expires ' + endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      addAlert('membership', 'card_membership', `${name} — ${m.membership_type} ${urgency}`, daysLeft <= 3 ? 1 : 3);
    });

    // New enrollments needing attention (paused)
    const pausedEnrollments = (recentEnrollmentsRes.data || []).filter(e => e.status === 'paused');
    pausedEnrollments.forEach(e => {
      const name = e.student ? `${e.student.first_name} ${e.student.last_name}`.trim() : 'Unknown';
      addAlert('enrollment', 'pause_circle', `${name} — ${e.course_name || 'course'} paused`, 2);
    });

    // Pending studio access bookings
    const pendingStudioAccess = pendingStudioAccessRes?.data || [];
    if (pendingStudioAccess.length > 0) {
      addAlert('studio_pending', 'chair', `${pendingStudioAccess.length} studio access booking${pendingStudioAccess.length !== 1 ? 's' : ''} awaiting confirmation`, 1);
    }

    // Sort alerts by priority (lower = more urgent), then deduplicate and limit
    alerts.sort((a, b) => a.priority - b.priority);
    const topAlerts = alerts.slice(0, 5).map(({ priority, ...rest }) => rest);

    // ── Recent Activity ──────────────────────────────────────────────────────
    function timeAgo(dateStr) {
      const diffMs = now - new Date(dateStr);
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${diffDays}d ago`;
    }

    const activity = [];
    const activityKeys = new Set();

    function addActivity(action, who, detail, when, createdAt) {
      const key = `${action}|${who}|${detail}`;
      if (activityKeys.has(key)) return;
      activityKeys.add(key);
      activity.push({ action, who, detail, when, createdAt });
    }

    // Bookings/cancellations — group batch bookings (e.g. 6-week WT enrollment creates 6 at once)
    const bookingGroups = {};
    (recentBookingsRes.data || []).forEach(b => {
      const name = b.student ? `${b.student.first_name} ${b.student.last_name}`.trim() : 'Unknown';
      const action = b.status === 'cancelled' ? 'Cancelled' : 'Booked';
      const ci = b.class_instance;
      const typeShort = ci ? ((ci.class_type || '').startsWith('WT') ? 'WT' : (ci.class_type || '').startsWith('HB') ? 'HB' : (ci.class_type || '').substring(0, 6)) : '';
      // Group by student + action + class type + created_at (within 60s = batch)
      const createdMin = Math.floor(new Date(b.created_at).getTime() / 60000);
      const groupKey = `${action}|${name}|${typeShort}|${createdMin}`;
      if (!bookingGroups[groupKey]) {
        bookingGroups[groupKey] = { action, name, typeShort, createdAt: b.created_at, count: 0, firstDate: null };
      }
      bookingGroups[groupKey].count++;
      if (ci && ci.class_date) {
        const d = (ci.class_date || '').split('T')[0];
        if (!bookingGroups[groupKey].firstDate || d < bookingGroups[groupKey].firstDate) {
          bookingGroups[groupKey].firstDate = d;
        }
      }
    });
    Object.values(bookingGroups).forEach(g => {
      let detail = '';
      if (g.count > 1) {
        detail = `${g.typeShort} — ${g.count} classes`;
      } else if (g.firstDate) {
        const dateStr = new Date(g.firstDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        detail = `${g.typeShort} ${dateStr}`;
      } else {
        detail = g.typeShort;
      }
      addActivity(g.action, g.name, detail, timeAgo(g.createdAt), g.createdAt);
    });

    // New enrollments
    (recentEnrollmentsRes.data || []).filter(e => e.status === 'active').forEach(e => {
      const name = e.student ? `${e.student.first_name} ${e.student.last_name}`.trim() : 'Unknown';
      addActivity('Enrolled', name, e.course_name || 'New course', timeAgo(e.created_at), e.created_at);
    });

    // New memberships
    (recentMembershipsRes.data || []).forEach(m => {
      const name = m.customer ? `${m.customer.first_name} ${m.customer.last_name}`.trim() : 'Unknown';
      addActivity('Membership', name, m.membership_type, timeAgo(m.created_at), m.created_at);
    });

    // Gallery uploads
    (recentPiecesRes.data || []).forEach(p => {
      const name = p.student ? `${p.student.first_name} ${p.student.last_name}`.trim() : 'Unknown';
      addActivity('Gallery', name, p.title || 'New piece added', timeAgo(p.created_at), p.created_at);
    });

    // Studio access bookings
    (recentStudioAccessRes.data || []).forEach(sa => {
      const name = sa.customer ? `${sa.customer.first_name} ${sa.customer.last_name}`.trim() : 'Unknown';
      const dateStr = sa.booking_date ? new Date(sa.booking_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
      const statusLabel = sa.status === 'pending' ? ' (pending)' : sa.status === 'cancelled' ? ' (cancelled)' : '';
      addActivity('Studio', name, `Studio access ${dateStr}${statusLabel}`, timeAgo(sa.created_at), sa.created_at);
    });

    // Sort by date, take top 6, strip createdAt
    activity.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const topActivity = activity.slice(0, 6).map(({ createdAt, ...rest }) => rest);

    res.json({ alerts: topAlerts, activity: topActivity });
  } catch (error) {
    console.error('Error fetching dashboard activity:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard activity' });
  }
});

// Get student bookings (accepts email or numeric ID)
app.get('/api/admin/students/:emailOrId/bookings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { emailOrId } = req.params;
    const decodedParam = decodeURIComponent(emailOrId);

    let student;

    // Check if parameter is a numeric ID or email
    if (/^\d+$/.test(decodedParam)) {
      // It's a numeric ID
      const { data } = await supabaseDb.supabase
        .from('customers')
        .select('id')
        .eq('id', parseInt(decodedParam))
        .single();
      student = data;
    } else {
      // It's an email
      const { data } = await supabaseDb.supabase
        .from('customers')
        .select('id')
        .eq('email', decodedParam)
        .single();
      student = data;
    }

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get their ACTIVE bookings with class details (exclude rescheduled/cancelled)
    // Filter to show bookings from ONLY active or paused enrollments
    // This ensures admin page only shows current course, not completed past courses
    const { data: allBookings, error } = await supabaseDb.supabase
      .from('bookings')
      .select(`
        *,
        class_instances!bookings_class_instance_id_fkey (
          id,
          class_date,
          start_time,
          end_time,
          class_type,
          instructor
        ),
        course_enrollment:course_enrollments!bookings_course_enrollment_id_fkey (
          status
        )
      `)
      .eq('student_id', student.id)
      .in('status', ['booked', 'completed', 'attended'])
      .order('class_instances(class_date)', { ascending: false });

    // Group bookings by course, then exclude fully-completed courses
    const todayStr = new Date().toISOString().split('T')[0];

    // First, exclude bookings from explicitly completed/cancelled enrollments
    // BUT: if the enrollment still has future bookings, don't treat it as completed
    // (protects against enrollments incorrectly marked as completed)
    const enrollmentHasFutureBookings = {};
    (allBookings || []).forEach(b => {
      if (b.course_enrollment_id) {
        const classDate = b.class_instances?.class_date?.split('T')[0];
        if (classDate && classDate >= todayStr) {
          enrollmentHasFutureBookings[b.course_enrollment_id] = true;
        }
      }
    });

    const nonCompletedBookings = (allBookings || []).filter(booking => {
      if (booking.course_enrollment && ['completed', 'cancelled'].includes(booking.course_enrollment.status)) {
        // If this enrollment still has future bookings, don't filter it out
        if (enrollmentHasFutureBookings[booking.course_enrollment_id]) return true;
        return false;
      }
      return true;
    });

    // Group remaining by base course identifier to find courses where ALL dates are past
    const getBase = (classType) => {
      if (!classType) return 'unknown';
      const dot = classType.lastIndexOf('.');
      return dot > 0 ? classType.substring(0, dot) : classType;
    };
    const groups = {};
    nonCompletedBookings.forEach(b => {
      const base = getBase(b.class_instances?.class_type);
      if (!groups[base]) groups[base] = [];
      groups[base].push(b);
    });
    // A course group is fully done if every booking's class_date is past
    const completedGroups = new Set();
    Object.entries(groups).forEach(([base, group]) => {
      const allPast = group.every(b => {
        const d = b.class_instances?.class_date?.split('T')[0];
        return d && d < todayStr;
      });
      if (allPast) completedGroups.add(base);
    });

    const bookings = nonCompletedBookings.filter(b => {
      const base = getBase(b.class_instances?.class_type);
      return !completedGroups.has(base);
    });

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
      class_instance_id: booking.class_instance_id,  // Include for double-booking prevention
      class_date: booking.class_instances.class_date,
      start_time: booking.class_instances.start_time,
      end_time: booking.class_instances.end_time,
      class_type: booking.class_instances.class_type,
      instructor: booking.class_instances.instructor,
      course_identifier: classIdToCourseIdentifier[booking.class_instances.id] || 'N/A'
    }));

    res.json({ bookings: formattedBookings });
  } catch (error) {
    console.error('Error fetching student bookings:', error);
    res.status(500).json({ error: 'Failed to fetch student bookings' });
  }
});

// Update student
app.put('/api/admin/students/:email', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { email } = req.params;
    const decodedEmail = decodeURIComponent(email);
    const { first_name, last_name, email: newEmail, customer_type, course_purchase_count, classes_allocated, phone, wheel_preference } = req.body;

    const updateData = {
      updated_at: new Date().toISOString()
    };

    // Only update fields if they're provided in the request
    const nameChanged = first_name !== undefined || last_name !== undefined;
    if (first_name !== undefined)          updateData.first_name = first_name;
    if (last_name !== undefined)           updateData.last_name = last_name;
    if (newEmail !== undefined)            updateData.email = newEmail;
    if (customer_type !== undefined)       updateData.customer_type = customer_type;
    if (course_purchase_count !== undefined) updateData.course_purchase_count = course_purchase_count;
    if (classes_allocated !== undefined)   updateData.classes_allocated = classes_allocated;
    if (phone !== undefined)               updateData.phone = phone;
    if (wheel_preference !== undefined)    updateData.wheel_preference = wheel_preference;

    // If name changed, try to set name_locked flag to prevent sync overwrite
    if (nameChanged) updateData.name_locked = true;

    let { data, error } = await supabaseDb.supabase
      .from('customers')
      .update(updateData)
      .eq('email', decodedEmail)
      .select()
      .single();

    // If name_locked column doesn't exist yet, retry without it
    if (error && nameChanged && error.message?.includes('name_locked')) {
      delete updateData.name_locked;
      ({ data, error } = await supabaseDb.supabase
        .from('customers')
        .update(updateData)
        .eq('email', decodedEmail)
        .select()
        .single());
    }

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({ error: 'Failed to update student' });
  }
});

// Get classes summary (lightweight, count-only)
app.get('/api/admin/classes/summary', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    const [
      { count: totalClasses, error: e1 },
      { count: wtCourses, error: e2 },
      { count: hbClasses, error: e3 }
    ] = await Promise.all([
      supabaseDb.supabase
        .from('class_instances')
        .select('*', { count: 'exact', head: true })
        .gte('class_date', todayStr),
      supabaseDb.supabase
        .from('class_instances')
        .select('*', { count: 'exact', head: true })
        .ilike('class_type', 'WT%')
        .gte('class_date', todayStr),
      supabaseDb.supabase
        .from('class_instances')
        .select('*', { count: 'exact', head: true })
        .ilike('class_type', 'HB%')
        .gte('class_date', todayStr)
    ]);

    const err = e1 || e2 || e3;
    if (err) throw err;

    res.json({
      totalClasses: totalClasses || 0,
      wtCourses: wtCourses || 0,
      hbClasses: hbClasses || 0
    });
  } catch (error) {
    console.error('Error fetching classes summary:', error);
    res.status(500).json({ error: 'Failed to fetch classes summary' });
  }
});

// Get all classes with course identifiers for admin
app.get('/api/admin/classes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('🔍 Fetching admin classes...');

    // Get all 2026 class instances for accurate enrollment counts
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: allClassInstances, error: classesError } = await supabaseDb.supabase
      .from('class_instances')
      .select('id, class_type, class_date, start_time, end_time, instructor, room, max_capacity, current_enrollment, class_title, class_description')
      .gte('class_date', '2026-01-01')
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
        .in('status', ['booked', 'attended', 'completed'])
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

    // Return all courses (client handles active/past filtering)
    const filteredCourses = courses;

    console.log(`✅ Successfully fetched and processed ${allClassInstances.length} classes in ${filteredCourses.length} courses`);

    res.json({ courses: filteredCourses });
  } catch (error) {
    console.error('❌ Error fetching admin classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

app.get('/api/admin/classes/:classId/members', authenticateToken, requireAdmin, async (req, res) => {
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
        booking_type,
        original_class_instance_id,
        course_enrollment_id,
        customers (
          id,
          first_name,
          last_name,
          email,
          course_purchase_count
        )
      `)
      .eq('class_instance_id', classId)
      .order('created_at', { ascending: true });

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      return res.status(500).json({ error: 'Failed to fetch bookings' });
    }

    // Get original class identifiers for makeup students
    // Find all unique original_class_instance_ids
    const originalClassIds = [...new Set(
      allBookings
        .filter(b => b.original_class_instance_id)
        .map(b => b.original_class_instance_id)
    )];

    // Fetch class details for original classes
    const originalClassIdentifiers = {};
    if (originalClassIds.length > 0) {
      const { data: originalClasses } = await supabaseDb.supabase
        .from('class_instances')
        .select('id, class_type, class_date')
        .in('id', originalClassIds);

      if (originalClasses) {
        originalClasses.forEach(cls => {
          originalClassIdentifiers[cls.id] = cls.class_type;
        });
      }
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

    // Get current class identifier to distinguish same-course reschedules from true makeups
    const { data: currentClassInfo } = await supabaseDb.supabase
      .from('class_instances')
      .select('class_type')
      .eq('id', classId)
      .single();
    const getBase = (id) => { const i = (id || '').lastIndexOf('.'); return i > 0 ? id.substring(0, i) : id; };
    const currentCourseBase = currentClassInfo ? getBase(currentClassInfo.class_type) : '';

    // Fetch enrollment course identifiers for bookings that have enrollment IDs
    const enrollmentIds = [...new Set(allBookings.filter(b => b.course_enrollment_id).map(b => b.course_enrollment_id))];
    const enrollmentCourseMap = {};
    if (enrollmentIds.length > 0) {
      const { data: enrollments } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('id, course_identifier, course_type, class_credits_allocated, class_credits_used, class_credits_remaining')
        .in('id', enrollmentIds);
      (enrollments || []).forEach(e => { enrollmentCourseMap[e.id] = e; });
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
        email: booking.customers?.email,
        returningCount: booking.customers?.course_purchase_count || 0,
        status: booking.status,
        attended: booking.attended,
        courseEnrollmentId: booking.course_enrollment_id,
      };

      // Determine if this is a makeup student
      // If the student's enrollment is for the SAME course as this class, they're enrolled (not makeup)
      // even if they rescheduled away and back
      const enrollmentData = booking.course_enrollment_id ? enrollmentCourseMap[booking.course_enrollment_id] : null;
      const enrollmentCourse = enrollmentData?.course_identifier || null;
      const enrollmentBase = enrollmentCourse ? getBase(enrollmentCourse) : null;

      // Add HB credit info if this is a handbuilding enrollment
      if (enrollmentData && (enrollmentData.course_type || '').toLowerCase().includes('handbuilding')) {
        member.creditsAllocated = enrollmentData.class_credits_allocated || 0;
        member.creditsUsed = enrollmentData.class_credits_used || 0;
      }
      const isOwnCourse = enrollmentBase && enrollmentBase === currentCourseBase;

      if (!isOwnCourse && booking.booking_type === 'makeup') {
        member.isMakeup = true;
        if (booking.original_class_instance_id) {
          const fullId = originalClassIdentifiers[booking.original_class_instance_id] || '';
          member.originalClassIdentifier = getBase(fullId) || null;
        }
      } else if (!isOwnCourse && booking.original_class_instance_id && booking.booking_type !== 'regular') {
        // Fallback: if no explicit type set, check if rescheduled from a different course
        const originalIdentifier = originalClassIdentifiers[booking.original_class_instance_id] || '';
        const originalBase = getBase(originalIdentifier);
        if (originalBase !== currentCourseBase) {
          member.isMakeup = true;
          member.originalClassIdentifier = originalBase;
        }
      }

      // Active members: status is 'booked', 'attended', or 'completed'
      if (booking.status === 'booked' || booking.status === 'attended' || booking.status === 'completed') {
        activeMembers.push(member);
      }
      // Absent members: rescheduled or marked as not attended
      // Skip cancelled bookings from students not enrolled in this course (e.g. cancelled makeups)
      else if (booking.status === 'rescheduled' || booking.attended === false) {
        // If rescheduled, add the new class info
        if (booking.status === 'rescheduled' && rescheduledToMap[booking.student_id]) {
          member.rescheduledTo = rescheduledToMap[booking.student_id];
        }
        absentMembers.push(member);
      }
      else if (booking.status === 'cancelled') {
        // Only show cancelled bookings if the student has other active bookings in this course
        const hasActiveBookingInCourse = allBookings.some(
          b => b.student_id === booking.student_id && b.id !== booking.id &&
               (b.status === 'booked' || b.status === 'attended' || b.status === 'completed')
        );
        if (hasActiveBookingInCourse) {
          absentMembers.push(member);
        }
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
app.post('/api/admin/classes/:classId/add-student', authenticateToken, requireAdmin, async (req, res) => {
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

    // Get class details to find the course and all its weeks
    const { data: thisClass } = await supabaseDb.supabase
      .from('class_instances')
      .select('id, class_type, class_date, start_time, end_time, instructor, max_capacity')
      .eq('id', classId)
      .single();

    // Extract base course identifier (e.g. "WT2802AM_DL6" from "WT2802AM_DL6.2")
    const fullId = thisClass?.class_type || '';
    const lastDot = fullId.lastIndexOf('.');
    const baseCourseId = lastDot > 0 ? fullId.substring(0, lastDot) : fullId;

    // Check if student already has a course_enrollment for this course
    const { data: existingEnrollment } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id')
      .eq('student_id', studentId)
      .eq('course_identifier', baseCourseId)
      .eq('status', 'active')
      .maybeSingle();

    let enrollmentId = existingEnrollment?.id || null;

    // If no enrollment exists, create one (marked as manual) so sync won't overwrite
    if (!enrollmentId) {
      // Copy details from an existing enrollment in the same course, or build from class data
      const { data: refEnrollment } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('course_title, course_variant_title, course_type, schedule_pattern, number_of_weeks, course_start_date, course_end_date, class_time, instructor')
        .eq('course_identifier', baseCourseId)
        .limit(1)
        .maybeSingle();

      const now = new Date().toISOString();
      const { data: newEnrollment, error: enrollError } = await supabaseDb.supabase
        .from('course_enrollments')
        .insert({
          student_id: studentId,
          shopify_order_id: 'MANUAL',
          shopify_line_item_id: `MANUAL-${Date.now()}`,
          course_title: refEnrollment?.course_title || 'Manual Enrollment',
          course_variant_title: refEnrollment?.course_variant_title || '',
          course_type: refEnrollment?.course_type || 'Wheelthrowing Beginner',
          schedule_pattern: refEnrollment?.schedule_pattern || '',
          number_of_weeks: refEnrollment?.number_of_weeks || 6,
          course_start_date: refEnrollment?.course_start_date || thisClass?.class_date,
          course_end_date: refEnrollment?.course_end_date || null,
          class_time: refEnrollment?.class_time || thisClass?.start_time,
          instructor: refEnrollment?.instructor || thisClass?.instructor,
          status: 'active',
          course_identifier: baseCourseId,
          bookings_created_at: now,
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single();

      if (enrollError) {
        console.error('Error creating enrollment:', enrollError);
        // Continue anyway — booking without enrollment is still useful
      } else {
        enrollmentId = newEnrollment.id;
        console.log(`✅ Created manual course_enrollment ${enrollmentId} for student ${studentId} in ${baseCourseId}`);
      }
    }

    // Find all class instances for this course and create bookings for unbooked weeks
    const { data: courseClasses } = await supabaseDb.supabase
      .from('class_instances')
      .select('id, class_type, class_date')
      .like('class_type', `${baseCourseId}.%`)
      .order('class_date', { ascending: true });

    const classIds = (courseClasses || []).map(c => c.id);

    // Get existing bookings for this student in this course
    const { data: existingBookings } = await supabaseDb.supabase
      .from('bookings')
      .select('class_instance_id')
      .eq('student_id', studentId)
      .in('class_instance_id', classIds.length > 0 ? classIds : [0])
      .in('status', ['booked', 'attended', 'completed']);

    const alreadyBookedIds = new Set((existingBookings || []).map(b => b.class_instance_id));

    // Create bookings for all unbooked weeks
    const newBookings = [];
    for (const cls of (courseClasses || [])) {
      if (alreadyBookedIds.has(cls.id)) continue;
      const { data: booking, error: bookErr } = await supabaseDb.supabase
        .from('bookings')
        .insert({
          student_id: studentId,
          class_instance_id: cls.id,
          status: 'booked',
          course_enrollment_id: enrollmentId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      if (!bookErr && booking) newBookings.push(booking);
    }

    // Also link the enrollment to any pre-existing bookings that had null course_enrollment_id
    if (enrollmentId && alreadyBookedIds.size > 0) {
      await supabaseDb.supabase
        .from('bookings')
        .update({ course_enrollment_id: enrollmentId, updated_at: new Date().toISOString() })
        .eq('student_id', studentId)
        .in('class_instance_id', [...alreadyBookedIds])
        .is('course_enrollment_id', null);
    }

    console.log(`✅ Added student ${studentId} to ${baseCourseId}: ${newBookings.length} new bookings, ${alreadyBookedIds.size} existing`);
    res.json({ message: `Student added to all ${newBookings.length + alreadyBookedIds.size} weeks of ${baseCourseId}`, bookings: newBookings });
  } catch (error) {
    console.error('Error adding student to class:', error);
    res.status(500).json({ error: 'Failed to add student to class' });
  }
});

// Remove student from class (cancel booking)
app.delete('/api/admin/bookings/:bookingId', authenticateToken, requireAdmin, async (req, res) => {
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

// Toggle booking type between regular and makeup
app.patch('/api/admin/bookings/:bookingId/makeup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Check if booking exists
    const { data: booking, error: fetchError } = await supabaseDb.supabase
      .from('bookings')
      .select('id, booking_type')
      .eq('id', bookingId)
      .single();

    if (fetchError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Toggle booking type
    const newBookingType = booking.booking_type === 'makeup' ? 'regular' : 'makeup';

    const { error: updateError } = await supabaseDb.supabase
      .from('bookings')
      .update({
        booking_type: newBookingType,
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    if (updateError) {
      console.error('Error toggling booking type:', updateError);
      return res.status(500).json({ error: 'Failed to toggle booking type' });
    }

    res.json({
      message: `Booking marked as ${newBookingType}`,
      bookingType: newBookingType
    });
  } catch (error) {
    console.error('Error toggling booking type:', error);
    res.status(500).json({ error: 'Failed to toggle booking type' });
  }
});

// Set booking type (enrolled/makeup) explicitly, with optional original course identifier
app.put('/api/admin/bookings/:bookingId/type', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { bookingType, originalCourseIdentifier } = req.body; // 'enrolled' or 'makeup'

    const dbType = bookingType === 'makeup' ? 'makeup' : 'regular';

    // If makeup with a course identifier, look up the class_instance_id for that identifier
    let originalClassInstanceId = null;
    if (dbType === 'makeup' && originalCourseIdentifier) {
      const { data: matchingClass } = await supabaseDb.supabase
        .from('class_instances')
        .select('id')
        .like('class_type', `${originalCourseIdentifier}%`)
        .limit(1);
      if (matchingClass && matchingClass.length > 0) {
        originalClassInstanceId = matchingClass[0].id;
      }
    }

    const updateData = {
      booking_type: dbType,
      updated_at: new Date().toISOString()
    };
    if (dbType === 'regular') {
      updateData.original_class_instance_id = null;
    } else if (originalClassInstanceId) {
      updateData.original_class_instance_id = originalClassInstanceId;
    }

    const { error } = await supabaseDb.supabase
      .from('bookings')
      .update(updateData)
      .eq('id', bookingId);

    if (error) {
      console.error('Error updating booking type:', error);
      return res.status(500).json({ error: 'Failed to update booking type' });
    }

    res.json({ message: `Booking set to ${bookingType}`, bookingType: dbType });
  } catch (error) {
    console.error('Error updating booking type:', error);
    res.status(500).json({ error: 'Failed to update booking type' });
  }
});

// Toggle booking attended status (admin only)
app.put('/api/admin/bookings/:bookingId/attended', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body; // 'attended' or 'booked'

    const updateData = {
      status: status,
      attended: status === 'attended' ? true : null,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabaseDb.supabase
      .from('bookings')
      .update(updateData)
      .eq('id', bookingId);

    if (error) {
      console.error('Error updating attended status:', error);
      return res.status(500).json({ error: 'Failed to update attended status' });
    }

    res.json({ message: `Booking marked as ${status}`, status });
  } catch (error) {
    console.error('Error updating attended status:', error);
    res.status(500).json({ error: 'Failed to update attended status' });
  }
});

// Create a booking for a student (admin only)
app.post('/api/admin/bookings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { studentId, classInstanceId, bookingType, status } = req.body;

    if (!studentId || !classInstanceId) {
      return res.status(400).json({ error: 'Student ID and class instance ID are required' });
    }

    // Get class instance details
    const { data: classInstance, error: classError } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .eq('id', classInstanceId)
      .single();

    if (classError || !classInstance) {
      return res.status(404).json({ error: 'Class instance not found' });
    }

    // Check if class is full
    if (classInstance.current_capacity >= classInstance.max_capacity) {
      return res.status(400).json({ error: 'Class is full' });
    }

    // Create the booking
    const { data: booking, error: bookingError } = await supabaseDb.supabase
      .from('bookings')
      .insert([{
        student_id: studentId,
        class_instance_id: classInstanceId,
        booking_type: bookingType || 'regular',
        status: status || 'booked',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (bookingError) {
      console.error('Error creating booking:', bookingError);

      // Provide more specific error messages
      if (bookingError.code === '23505') {
        return res.status(409).json({
          error: 'Student is already booked for this class. Please delete the existing booking first.'
        });
      }

      return res.status(500).json({
        error: bookingError.message || 'Failed to create booking'
      });
    }

    // Update class capacity
    const { error: capacityError } = await supabaseDb.supabase
      .from('class_instances')
      .update({
        current_capacity: classInstance.current_capacity + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', classInstanceId);

    if (capacityError) {
      console.error('Error updating class capacity:', capacityError);
    }

    res.json({
      message: 'Booking created successfully',
      booking
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Update class instance (date, time, instructor)
app.patch('/api/admin/classes/:classId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { classId } = req.params;
    const { classDate, startTime, endTime, instructor, maxCapacity, classTitle, classDescription } = req.body;

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
    if (maxCapacity !== undefined) updates.max_capacity = maxCapacity;
    if (classTitle !== undefined) updates.class_title = classTitle;
    if (classDescription !== undefined) updates.class_description = classDescription;

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

// Create a new class
app.post('/api/admin/classes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { startTime, endTime, classType, instructor, room, teachingCapacity, makeUpCapacity, glazingCapacity, numberOfClasses, classDates } = req.body;

    // Validate required fields
    if (!startTime || !endTime || !classType || !instructor || !room || !numberOfClasses || !classDates) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate that we have the correct number of dates
    if (classDates.length !== numberOfClasses) {
      return res.status(400).json({ error: 'Number of dates must match number of classes' });
    }

    // Validate all dates are provided
    const emptyDates = classDates.filter(d => !d);
    if (emptyDates.length > 0) {
      return res.status(400).json({ error: 'All class dates must be provided' });
    }

    const now = new Date().toISOString();
    const createdClasses = [];

    // Calculate total capacity (teaching + make up for regular classes, glazing capacity for last class)
    const regularCapacity = (teachingCapacity || 10) + (makeUpCapacity || 2);
    const finalGlazingCapacity = glazingCapacity || 14;

    // Create each class instance with the appropriate week number
    for (let i = 0; i < numberOfClasses; i++) {
      const weekNumber = i + 1;
      const isLastClass = weekNumber === numberOfClasses;

      // Generate the class type with week number (e.g., WT1210AM_DL6.1, WT1210AM_DL6.2, etc.)
      const classTypeWithWeek = `${classType}.${weekNumber}`;

      // Use glazing capacity for the last class, regular capacity for others
      const classCapacity = isLastClass ? finalGlazingCapacity : regularCapacity;

      const { data, error} = await supabaseDb.supabase
        .from('class_instances')
        .insert({
          class_date: classDates[i],
          start_time: startTime,
          end_time: endTime,
          class_type: classTypeWithWeek,
          instructor: instructor,
          room: room,
          max_capacity: classCapacity,
          current_enrollment: 0,
          status: 'active',
          created_at: now,
          updated_at: now
        })
        .select()
        .single();

      if (error) {
        console.error(`Error creating class ${weekNumber}:`, error);
        // If we fail partway through, return an error but note what was created
        return res.status(500).json({
          error: `Failed to create class ${weekNumber}. ${createdClasses.length} classes were created before this error.`,
          createdClasses: createdClasses
        });
      }

      createdClasses.push(data);
      if (isLastClass) {
        console.log(`✅ Created GLAZING class ${weekNumber}/${numberOfClasses}: ${classTypeWithWeek} on ${classDates[i]} (Capacity: ${classCapacity})`);
      } else {
        console.log(`✅ Created class ${weekNumber}/${numberOfClasses}: ${classTypeWithWeek} on ${classDates[i]} (Teaching: ${teachingCapacity}, Make-up: ${makeUpCapacity}, Total: ${classCapacity})`);
      }
    }

    console.log(`✅ Successfully created ${numberOfClasses} classes for course: ${classType}`);
    res.json({
      message: `${numberOfClasses} class${numberOfClasses > 1 ? 'es' : ''} created successfully`,
      classes: createdClasses
    });
  } catch (error) {
    console.error('Error creating classes:', error);
    res.status(500).json({ error: 'Failed to create classes' });
  }
});

// Admin: Bulk delete phantom classes after a cutoff date (no active bookings)
app.delete('/api/admin/classes/bulk-after', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { afterDate } = req.body || {};
    if (!afterDate) return res.status(400).json({ error: 'afterDate required (YYYY-MM-DD)' });

    const { data: classes, error: fetchErr } = await supabaseDb.supabase
      .from('class_instances')
      .select('id')
      .gt('class_date', afterDate);

    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!classes || classes.length === 0) return res.json({ message: 'No classes found after ' + afterDate, deleted: 0 });

    const classIds = classes.map(c => c.id);

    // Delete any bookings referencing these classes first
    const { error: bookingErr } = await supabaseDb.supabase
      .from('bookings')
      .delete()
      .in('class_instance_id', classIds);

    if (bookingErr) console.error('Warning: error deleting bookings:', bookingErr);

    // Now delete the class instances
    const { data: deleted, error: deleteErr } = await supabaseDb.supabase
      .from('class_instances')
      .delete()
      .in('id', classIds)
      .select('id');

    if (deleteErr) return res.status(500).json({ error: deleteErr.message });

    console.log(`🗑️ Bulk cleanup: deleted ${deleted.length} classes after ${afterDate}`);
    res.json({ message: `Deleted ${deleted.length} classes after ${afterDate}`, deleted: deleted.length });
  } catch (error) {
    console.error('Bulk cleanup error:', error);
    res.status(500).json({ error: 'Bulk cleanup failed' });
  }
});

// Delete a class
app.delete('/api/admin/classes/:classId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { classId } = req.params;

    // Check if class has any bookings
    const { data: bookings, error: bookingsError } = await supabaseDb.supabase
      .from('bookings')
      .select('id')
      .eq('class_instance_id', classId)
      .in('status', ['booked', 'completed']);

    if (bookingsError) {
      console.error('Error checking bookings:', bookingsError);
      return res.status(500).json({ error: 'Failed to check class bookings' });
    }

    if (bookings && bookings.length > 0) {
      return res.status(400).json({ error: 'Cannot delete class with enrolled students. Please remove all students first.' });
    }

    // Delete the class
    const { error: deleteError } = await supabaseDb.supabase
      .from('class_instances')
      .delete()
      .eq('id', classId);

    if (deleteError) {
      console.error('Error deleting class:', deleteError);
      return res.status(500).json({ error: 'Failed to delete class' });
    }

    console.log(`✅ Deleted class: ${classId}`);
    res.json({ message: 'Class deleted successfully' });
  } catch (error) {
    console.error('Error deleting class:', error);
    res.status(500).json({ error: 'Failed to delete class' });
  }
});

app.get('/api/admin/customers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const customers = await supabaseDb.getAllCustomers();

    const formattedCustomers = customers.map(customer => ({
      id: customer.shopify_customer_id,
      dbId: customer.id,
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name,
      role: customer.role || 'student',
      bio: customer.bio || null,
      profile_image: customer.profile_image || null,
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
app.get('/api/admin/paused-students', authenticateToken, requireAdmin, async (req, res) => {
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
app.post('/api/admin/students/:studentId/pause', authenticateToken, requireAdmin, async (req, res) => {
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
app.post('/api/admin/students/:studentId/resume', authenticateToken, requireAdmin, async (req, res) => {
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
app.post('/api/admin/bookings/:bookingId/reschedule', authenticateToken, requireAdmin, async (req, res) => {
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

    // Check if a booking already exists for this student+class (e.g., from a previous reschedule)
    const { data: existingBooking } = await supabaseDb.supabase
      .from('bookings')
      .select('*')
      .eq('student_id', originalBooking.student_id)
      .eq('class_instance_id', newClassInstanceId)
      .single();

    let newBooking;

    if (existingBooking) {
      // Update existing booking (allows rescheduling back into previously rescheduled classes)
      const { data: updatedBooking, error: updateExistingError } = await supabaseDb.supabase
        .from('bookings')
        .update({
          status: 'booked',
          original_class_instance_id: originalBooking.class_instance_id,
          rescheduled_from_date: originalBooking.class_instances.class_date,
          reschedule_reason: rescheduleReason || null,
          reschedule_fee_paid: fee || 0,
          is_makeup_class: fee > 0,
          is_glazing_reschedule: isGlazingReschedule || false,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingBooking.id)
        .select()
        .single();

      if (updateExistingError) throw updateExistingError;
      newBooking = updatedBooking;
    } else {
      // Create new booking
      const { data: createdBooking, error: createError } = await supabaseDb.supabase
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
      newBooking = createdBooking;
    }

    // If there's a fee, create a fee record
    if (fee && fee > 0) {
      const { error: feeError } = await supabaseDb.supabase
        .from('reschedule_fees')
        .insert({
          student_id: originalBooking.student_id,
          booking_id: newBooking.id,
          fee_type: 'makeup',
          amount: fee,
          payment_status: 'waived', // Admin reschedules are automatically waived
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
app.get('/api/admin/students/:studentId/fees', authenticateToken, requireAdmin, async (req, res) => {
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
app.patch('/api/admin/fees/:feeId/payment', authenticateToken, requireAdmin, async (req, res) => {
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

app.delete('/api/admin/fees/:feeId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { feeId } = req.params;

    const { error } = await supabaseDb.supabase
      .from('reschedule_fees')
      .delete()
      .eq('id', feeId);

    if (error) throw error;

    res.json({ message: 'Fee deleted successfully' });
  } catch (error) {
    console.error('Error deleting fee:', error);
    res.status(500).json({ error: 'Failed to delete fee' });
  }
});

app.get('/api/admin/customers/:customerId/pieces', authenticateToken, requireAdmin, async (req, res) => {
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
app.put('/api/admin/customers/:customerId', authenticateToken, requireAdmin, async (req, res) => {
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
app.get('/api/admin/pottery/all', authenticateToken, requireAdmin, async (req, res) => {
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
app.put('/api/admin/pottery/:id/toggle-public', authenticateToken, requireAdmin, async (req, res) => {
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
app.put('/api/admin/pottery/:id/toggle-featured', authenticateToken, requireAdmin, async (req, res) => {
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
app.post('/api/admin/clay-types', authenticateToken, requireAdmin, async (req, res) => {
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
app.put('/api/admin/clay-types/:id', authenticateToken, requireAdmin, async (req, res) => {
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
app.delete('/api/admin/clay-types/:id', authenticateToken, requireAdmin, async (req, res) => {
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
app.post('/api/admin/glazes', authenticateToken, requireAdmin, async (req, res) => {
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
app.put('/api/admin/glazes/:id', authenticateToken, requireAdmin, async (req, res) => {
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
app.delete('/api/admin/glazes/:id', authenticateToken, requireAdmin, async (req, res) => {
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
app.get('/api/admin/memberships', authenticateToken, requireAdmin, async (req, res) => {
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
app.post('/api/admin/memberships', authenticateToken, requireAdmin, async (req, res) => {
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

    // Update customer_type after membership creation
    await supabaseDb.updateSingleCustomerType(parseInt(customerId));

    res.json({ success: true, membership });
  } catch (error) {
    console.error('Error creating membership:', error);
    res.status(500).json({ error: 'Failed to create membership' });
  }
});

// Update membership
app.put('/api/admin/memberships/:id', authenticateToken, requireAdmin, async (req, res) => {
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

    // Update customer_type after membership change
    if (membership.customer_id) {
      await supabaseDb.updateSingleCustomerType(membership.customer_id);
    }

    res.json({ success: true, membership });
  } catch (error) {
    console.error('Error updating membership:', error);
    res.status(500).json({ error: 'Failed to update membership' });
  }
});

// Delete membership
app.delete('/api/admin/memberships/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    // Get membership to know customer_id before deleting
    const { data: memToDelete } = await supabaseDb.supabase
      .from('memberships')
      .select('customer_id')
      .eq('id', parseInt(id))
      .single();
    await supabaseDb.deleteMembership(parseInt(id));
    // Update customer_type after deletion
    if (memToDelete?.customer_id) {
      await supabaseDb.updateSingleCustomerType(memToDelete.customer_id);
    }
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

// Member dashboard endpoint
app.get('/api/membership/dashboard', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    // Fetch active membership, history, gallery pieces, and enrollment status in parallel
    const [activeMembership, allMemberships, galleryPieces, enrollmentRes] = await Promise.all([
      supabaseDb.getActiveMembership(dbCustomerId),
      supabaseDb.getCustomerMemberships(dbCustomerId),
      supabaseDb.getPotteryPiecesByCustomerId(dbCustomerId),
      supabaseDb.supabase
        .from('course_enrollments')
        .select('id')
        .eq('student_id', dbCustomerId)
        .in('status', ['active', 'pending'])
        .limit(1)
    ]);

    const hasActiveEnrollments = (enrollmentRes.data || []).length > 0;

    if (!activeMembership) {
      return res.json({
        hasMembership: false,
        hasActiveEnrollments,
        history: allMemberships.map(m => ({
          id: m.id, type: m.membership_type, status: m.status,
          startDate: m.start_date, endDate: m.end_date
        })),
        gallery: []
      });
    }

    const endDate = new Date(activeMembership.end_date);
    const startDate = new Date(activeMembership.start_date);
    const today = new Date();
    const daysRemaining = Math.max(0, Math.ceil((endDate - today) / (1000 * 60 * 60 * 24)));
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const progressPct = totalDays > 0 ? Math.min(100, Math.round(((totalDays - daysRemaining) / totalDays) * 100)) : 0;

    // Determine tier from membership type
    const monthMatch = (activeMembership.membership_type || '').match(/(\d+)/);
    const months = monthMatch ? parseInt(monthMatch[1]) : 3;
    const tier = months >= 12 ? 'Gold' : months >= 6 ? 'Silver' : 'Bronze';

    // Default perks by tier
    const defaultPerks = {
      Bronze: ['Studio Access', 'Dedicated Storage', 'Studio Glazes', '5% Discount'],
      Silver: ['Studio Access', 'Dedicated Storage', 'Studio Glazes', 'FREE $65 Firing Basket', '10% Discount'],
      Gold: ['Unlimited Studio Access', 'Free Dedicated Storage', 'Studio-Assisted Clay Reclaim', 'FREE $130 Firing Basket', 'All Studio Glazes Included', '10% Discount']
    };

    const perks = activeMembership.perks
      ? (typeof activeMembership.perks === 'object' ? Object.keys(activeMembership.perks) : activeMembership.perks)
      : defaultPerks[tier] || defaultPerks.Bronze;

    res.json({
      hasMembership: true,
      hasActiveEnrollments,
      membership: {
        id: activeMembership.id,
        type: activeMembership.membership_type,
        status: activeMembership.status,
        startDate: activeMembership.start_date,
        endDate: activeMembership.end_date,
        daysRemaining,
        totalDays,
        progressPct,
        tier,
        perks
      },
      history: allMemberships.map(m => ({
        id: m.id, type: m.membership_type, status: m.status,
        startDate: m.start_date, endDate: m.end_date
      })),
      gallery: (galleryPieces || []).slice(0, 6).map(p => ({
        id: p.id,
        title: p.title,
        imageUrl: p.images && p.images.length > 0 ? p.images[0] : null,
        dateCompleted: p.date_completed
      }))
    });
  } catch (error) {
    console.error('Error fetching member dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch member dashboard' });
  }
});

// ============================================
// AUTOMATED COURSE MANAGEMENT
// ============================================

// Manually trigger cohort processing
app.post('/api/admin/process-cohorts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('🔄 Manual cohort processing triggered');
    const result = await processReadyCohorts();

    res.json({
      success: true,
      result,
      message: `Processed ${result.cohortsProcessed} cohorts, ${result.cohortsSkipped} below threshold`
    });
  } catch (error) {
    console.error('Error processing cohorts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process cohorts',
      details: error.message
    });
  }
});

// ============================================
// SHOPIFY INTEGRATION ENDPOINTS
// ============================================

// Auto-complete enrollments where all booked class dates have passed
async function autoCompleteFinishedEnrollments() {
  try {
    const todayStr = new Date().toISOString().split('T')[0];

    // Get all active/paused enrollments
    const { data: activeEnrollments, error } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id, student_id, course_identifier')
      .in('status', ['active']);

    if (error || !activeEnrollments?.length) return 0;

    let completedCount = 0;

    for (const enrollment of activeEnrollments) {
      // Get all bookings for this enrollment
      const { data: bookings } = await supabaseDb.supabase
        .from('bookings')
        .select('id, class_instances!bookings_class_instance_id_fkey(class_date)')
        .eq('course_enrollment_id', enrollment.id)
        .in('status', ['booked', 'completed', 'attended']);

      if (!bookings || bookings.length === 0) continue;

      // Check if ALL booking dates are in the past
      const allPast = bookings.every(b => {
        const d = b.class_instances?.class_date?.split('T')[0];
        return d && d < todayStr;
      });

      if (allPast) {
        await supabaseDb.supabase
          .from('course_enrollments')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', enrollment.id);
        console.log(`Auto-completed enrollment ${enrollment.id} (${enrollment.course_identifier}) — all classes past`);
        completedCount++;
      }
    }

    if (completedCount > 0) {
      console.log(`Auto-completed ${completedCount} finished enrollments`);
    }
    return completedCount;
  } catch (error) {
    console.error('Error auto-completing enrollments:', error);
    return 0;
  }
}

// Sync all customers from Shopify
app.post('/api/admin/sync-shopify-customers', authenticateToken, requireAdmin, async (req, res) => {
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

    // Auto-complete enrollments where all booked classes have passed
    const autoCompleted = await autoCompleteFinishedEnrollments();

    // Sync customer_type based on active memberships
    await supabaseDb.syncCustomerTypeFromMemberships();

    res.json({
      success: true,
      message: `Synced ${syncedCount} customers from Shopify` + (autoCompleted > 0 ? `, auto-completed ${autoCompleted} finished enrollments` : ''),
      count: syncedCount
    });

  } catch (error) {
    console.error('Error syncing Shopify customers:', error);
    res.status(500).json({ error: 'Failed to sync customers from Shopify' });
  }
});

// Backfill HB enrollment credits (fix enrollments where credits were not saved)
app.post('/api/admin/backfill-hb-credits', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('🔧 Backfilling HB enrollment credits...');

    // Find all HB enrollments with NULL or 0 credits
    const { data: hbEnrollments, error } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*')
      .ilike('course_type', '%handbuilding%')
      .or('class_credits_allocated.is.null,class_credits_allocated.eq.0');

    if (error) throw error;

    if (!hbEnrollments || hbEnrollments.length === 0) {
      return res.json({ success: true, message: 'No HB enrollments need backfilling', fixed: 0 });
    }

    let fixedCount = 0;
    for (const enrollment of hbEnrollments) {
      // Determine credits based on number_of_weeks
      const credits = enrollment.number_of_weeks || 4;

      // Count existing bookings for this enrollment to calculate used credits
      const { count: bookingCount } = await supabaseDb.supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('course_enrollment_id', enrollment.id)
        .eq('status', 'booked');

      const used = bookingCount || 0;
      const remaining = Math.max(credits - used, 0);

      const { error: updateError } = await supabaseDb.supabase
        .from('course_enrollments')
        .update({
          class_credits_allocated: credits,
          class_credits_used: used,
          class_credits_remaining: remaining,
          glazing_class_used: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', enrollment.id);

      if (updateError) {
        console.error(`⚠️  Failed to update enrollment ${enrollment.id}:`, updateError);
      } else {
        fixedCount++;
        console.log(`✅ Fixed enrollment ${enrollment.id}: ${credits} credits allocated, ${used} used, ${remaining} remaining`);
      }
    }

    console.log(`🔧 Backfill complete: fixed ${fixedCount}/${hbEnrollments.length} HB enrollments`);

    res.json({
      success: true,
      message: `Fixed ${fixedCount} HB enrollments with missing credits`,
      fixed: fixedCount,
      total: hbEnrollments.length
    });

  } catch (error) {
    console.error('Error backfilling HB credits:', error);
    res.status(500).json({ error: 'Failed to backfill HB credits' });
  }
});

// Admin: Mark HB class as completed (increment used, decrement remaining)
app.post('/api/admin/hb-enrollments/:enrollmentId/mark-class-done', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const { count = 1 } = req.body; // How many classes to mark done (default 1)

    const { data: enrollment, error } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('*')
      .eq('id', enrollmentId)
      .single();

    if (error || !enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const currentUsed = enrollment.class_credits_used || 0;
    const currentRemaining = enrollment.class_credits_remaining || 0;
    const allocated = enrollment.class_credits_allocated || 0;

    if (currentRemaining < count) {
      return res.status(400).json({ error: `Only ${currentRemaining} credits remaining, cannot mark ${count} as done` });
    }

    const newUsed = currentUsed + count;
    const newRemaining = currentRemaining - count;

    const { data: updated, error: updateError } = await supabaseDb.supabase
      .from('course_enrollments')
      .update({
        class_credits_used: newUsed,
        class_credits_remaining: newRemaining,
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollmentId)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log(`✅ HB enrollment ${enrollmentId}: marked ${count} class(es) done (${newUsed}/${allocated} used, ${newRemaining} remaining)`);

    res.json({
      success: true,
      creditsUsed: newUsed,
      creditsRemaining: newRemaining,
      creditsAllocated: allocated
    });

  } catch (error) {
    console.error('Error marking HB class done:', error);
    res.status(500).json({ error: 'Failed to mark class as done' });
  }
});

// Admin: Set HB enrollment credits directly (for corrections)
app.post('/api/admin/hb-enrollments/:enrollmentId/set-credits', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const { allocated, used } = req.body;

    if (allocated === undefined || used === undefined) {
      return res.status(400).json({ error: 'allocated and used are required' });
    }

    const remaining = Math.max(allocated - used, 0);

    const { data: updated, error } = await supabaseDb.supabase
      .from('course_enrollments')
      .update({
        class_credits_allocated: allocated,
        class_credits_used: used,
        class_credits_remaining: remaining,
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollmentId)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ HB enrollment ${enrollmentId}: credits set to ${allocated} allocated, ${used} used, ${remaining} remaining`);

    res.json({
      success: true,
      creditsUsed: used,
      creditsRemaining: remaining,
      creditsAllocated: allocated
    });

  } catch (error) {
    console.error('Error setting HB credits:', error);
    res.status(500).json({ error: 'Failed to set credits' });
  }
});

// Admin: Set HB enrollment status (cancel, complete, etc.)
app.post('/api/admin/hb-enrollments/:enrollmentId/set-status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const { status } = req.body;

    if (!['active', 'completed', 'cancelled', 'paused'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { data, error } = await supabaseDb.supabase
      .from('course_enrollments')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', enrollmentId)
      .select()
      .single();

    if (error) throw error;
    console.log(`✅ HB enrollment ${enrollmentId}: status set to ${status}`);
    res.json({ success: true, status });
  } catch (error) {
    console.error('Error setting HB enrollment status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Sync recent orders and create enrollments/bookings
app.post('/api/admin/sync-shopify-orders', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { sinceDate } = req.body || {};
    console.log('🔄 Starting Shopify order sync...');
    const client = getShopifyClient();
    const { processCoursePurchase } = require('./utils/courseEnrollmentManager');
    const { supabase } = require('./utils/supabaseDb');

    let processedCount = 0;
    let enrollmentsCreated = 0;
    let skippedCount = 0;
    let hasNextPage = true;
    let cursor = null;

    // Use sinceDate from request body if provided (for deep re-sync)
    let lastSyncAt;
    if (sinceDate) {
      lastSyncAt = new Date(sinceDate);
      console.log(`📅 Deep re-sync from: ${lastSyncAt.toISOString()}`);
    } else {
      try {
        const { data: syncData, error: syncError } = await supabase
          .from('sync_tracking')
          .select('last_sync_at')
          .eq('sync_type', 'shopify_orders')
          .single();

        if (syncError) {
          console.log('⚠️  No sync tracking found, using last 7 days as default');
          lastSyncAt = new Date();
          lastSyncAt.setDate(lastSyncAt.getDate() - 7);
        } else {
          lastSyncAt = new Date(syncData.last_sync_at);
          console.log(`📅 Last sync was at: ${lastSyncAt.toISOString()}`);
        }
      } catch (error) {
        console.log('⚠️  Error reading sync tracking, using last 7 days as default');
        lastSyncAt = new Date();
        lastSyncAt.setDate(lastSyncAt.getDate() - 7);
      }
    }

    const sinceISO = lastSyncAt.toISOString();
    const syncStartTime = new Date().toISOString();

    while (hasNextPage) {
      let query, variables;

      if (cursor) {
        query = `
          query getOrders($cursor: String!) {
            orders(first: 250, after: $cursor, query: "updated_at:>\\\"${sinceISO}\\\"") {
              edges {
                node {
                  id
                  createdAt
                  updatedAt
                  displayFinancialStatus
                  customer {
                    id
                    email
                    firstName
                    lastName
                  }
                  lineItems(first: 50) {
                    edges {
                      node {
                        id
                        title
                        variantTitle
                        quantity
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
          query getOrders {
            orders(first: 250, query: "updated_at:>\\\"${sinceISO}\\\"") {
              edges {
                node {
                  id
                  createdAt
                  updatedAt
                  displayFinancialStatus
                  customer {
                    id
                    email
                    firstName
                    lastName
                  }
                  lineItems(first: 50) {
                    edges {
                      node {
                        id
                        title
                        variantTitle
                        quantity
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

      const ordersData = response.body.data.orders;

      for (const edge of ordersData.edges) {
        const orderNode = edge.node;
        const customer = orderNode.customer;

        if (!customer || !customer.email) {
          continue;
        }

        // Skip refunded orders
        if (orderNode.displayFinancialStatus === 'REFUNDED') {
          console.log(`⏭️  Skipping refunded order for ${customer.email}`);
          continue;
        }

        // Sync customer first (ignore if already exists)
        const customerData = {
          id: customer.id,
          email: customer.email,
          firstName: customer.firstName || '',
          lastName: customer.lastName || ''
        };

        try {
          await syncCustomer(customerData, customer.id.split('/').pop());
        } catch (error) {
          // Ignore duplicate customer errors - customer already exists
          if (error.code !== '23505') {
            throw error;
          }
        }

        // Process line items for course purchases
        for (const itemEdge of orderNode.lineItems.edges) {
          const item = itemEdge.node;
          const productTitle = item.title || '';
          const variantTitle = item.variantTitle || '';
          const quantity = item.quantity || 1;

          // Check if this is a pottery course
          if (productTitle.toLowerCase().includes('wheelthrowing') ||
              productTitle.toLowerCase().includes('handbuilding') ||
              productTitle.toLowerCase().includes('pottery course')) {

            // Handle multi-pax orders (qty > 1 = multiple enrollments)
            const paxCount = Math.max(1, quantity);
            if (paxCount > 1) {
              console.log(`👥 ${paxCount}-pax order detected for ${customer.email} - ${productTitle}`);
            }

            for (let paxIndex = 0; paxIndex < paxCount; paxIndex++) {
              const isExtraPax = paxIndex > 0;
              const paxSuffix = isExtraPax ? `-${paxIndex + 1}` : '';
              const paxEmail = isExtraPax
                ? customer.email.replace('@', `+dup${paxIndex > 1 ? paxIndex : ''}@`)
                : customer.email;

              if (isExtraPax) {
                console.log(`👥 Processing pax ${paxIndex + 1}/${paxCount}: ${paxEmail}`);

                // Create duplicate customer record for extra pax
                const dupFirstName = customer.firstName || '';
                const dupLastName = `${customer.lastName || ''} (${paxIndex + 1})`;

                try {
                  const { findCustomerByEmail } = require('./utils/supabaseDb');
                  const existingDup = await findCustomerByEmail(paxEmail);
                  if (!existingDup) {
                    const { supabase: db } = require('./utils/supabaseDb');
                    await db.from('customers').insert({
                      email: paxEmail,
                      first_name: dupFirstName,
                      last_name: dupLastName,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString()
                    });
                    console.log(`👥 Created duplicate customer: ${paxEmail}`);
                  }
                } catch (err) {
                  if (err.code !== '23505') {
                    console.error(`Error creating dup customer:`, err.message);
                  }
                }
              }

              console.log(`🎓 Processing: ${paxEmail} - ${productTitle}`);

              // Prepare order and line item objects
              const order = {
                id: orderNode.id.split('/').pop(),
                customer: {
                  email: paxEmail,
                  first_name: isExtraPax ? (customer.firstName || '') : customer.firstName,
                  last_name: isExtraPax ? `${customer.lastName || ''} (${paxIndex + 1})` : customer.lastName
                }
              };

              const lineItem = {
                id: item.id.split('/').pop() + paxSuffix,
                title: productTitle,
                variantTitle: variantTitle
              };

              // Process the course purchase
              const result = await processCoursePurchase(order, lineItem);

              if (result.success) {
                if (result.skipped) {
                  skippedCount++;
                } else {
                  enrollmentsCreated++;
                  if (result.thresholdMet) {
                    console.log(`✅ Created classes and bookings for ${paxEmail}`);
                  } else if (result.requiresThreshold) {
                    console.log(`⏳ Enrollment created, waiting for threshold (${result.studentCount}/${result.studentsNeeded + result.studentCount})`);
                  } else {
                    console.log(`✅ Enrollment created for ${paxEmail}`);
                  }
                }
              }

              processedCount++;
            }
          } else if (productTitle.toLowerCase().includes('clay club')) {
            // ── Clay Club membership sync ──────────────────────────────────
            const { findCustomerByEmail, createMembership } = require('./utils/supabaseDb');
            const memberCustomer = await findCustomerByEmail(customer.email);
            if (!memberCustomer) {
              console.log(`⚠️  Clay Club order for unknown customer: ${customer.email}`);
            } else {
              // Parse duration from variant or title
              const combined = (productTitle + ' ' + variantTitle).toLowerCase();
              let months = 6; // default
              if (combined.includes('12 month')) months = 12;
              else if (combined.includes('1 month')) months = 1;
              else if (combined.includes('3 month')) months = 3;
              else if (combined.includes('6 month')) months = 6;

              const membershipType = `Clay Club ${months} Month${months !== 1 ? 's' : ''}`;
              const startDate = new Date(orderNode.createdAt);
              const endDate = new Date(startDate);
              endDate.setMonth(endDate.getMonth() + months);

              // Check if membership already exists for this customer + start date
              const { data: existing } = await supabase
                .from('memberships')
                .select('id, end_date, membership_type, status')
                .eq('customer_id', memberCustomer.id)
                .eq('start_date', startDate.toISOString().split('T')[0])
                .maybeSingle();

              if (existing) {
                // Update end_date, type, and status if they differ
                const expectedEnd = endDate.toISOString().split('T')[0];
                const now = new Date();
                const expectedStatus = endDate < now ? 'expired' : 'active';
                const needsUpdate = existing.end_date !== expectedEnd || existing.membership_type !== membershipType || existing.status !== expectedStatus;

                if (needsUpdate) {
                  await supabase
                    .from('memberships')
                    .update({
                      end_date: expectedEnd,
                      membership_type: membershipType,
                      status: expectedStatus,
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', existing.id);
                  console.log(`🔄 Updated membership for ${customer.email}: end_date=${expectedEnd}, type=${membershipType}, status=${expectedStatus}`);
                } else {
                  console.log(`⏭️  Membership already exists for ${customer.email} (${membershipType})`);
                }
                skippedCount++;
              } else {
                // Check if there's an active membership to extend
                const { data: activeMembership } = await supabase
                  .from('memberships')
                  .select('id, end_date, membership_type')
                  .eq('customer_id', memberCustomer.id)
                  .eq('status', 'active')
                  .order('end_date', { ascending: false })
                  .limit(1)
                  .maybeSingle();

                if (activeMembership) {
                  // Extend the existing active membership's end_date
                  const currentEnd = new Date(activeMembership.end_date);
                  const newEnd = new Date(currentEnd);
                  newEnd.setMonth(newEnd.getMonth() + months);

                  await supabase
                    .from('memberships')
                    .update({
                      end_date: newEnd.toISOString().split('T')[0],
                      membership_type: membershipType,
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', activeMembership.id);

                  console.log(`🎫 Extended membership for ${customer.email}: ${currentEnd.toISOString().split('T')[0]} → ${newEnd.toISOString().split('T')[0]} (+${months} months)`);
                  enrollmentsCreated++;
                } else {
                  // No active membership — create new
                  const now = new Date();
                  const status = endDate < now ? 'expired' : 'active';

                  await createMembership({
                    customerId: memberCustomer.id,
                    membershipType,
                    startDate,
                    endDate,
                    status,
                    perks: {}
                  });
                  console.log(`🎫 Created ${status} membership for ${customer.email}: ${membershipType} (${startDate.toISOString().split('T')[0]} → ${endDate.toISOString().split('T')[0]})`);
                  enrollmentsCreated++;
                }
              }
            }
            processedCount++;
          }
        }
      }

      hasNextPage = ordersData.pageInfo.hasNextPage;
      if (hasNextPage && ordersData.edges.length > 0) {
        cursor = ordersData.edges[ordersData.edges.length - 1].cursor;
      }
    }

    console.log(`✅ Processed ${processedCount} course purchases, created ${enrollmentsCreated} enrollments`);

    // Update membership expiry statuses
    let membershipsExpired = 0;
    try {
      const now = new Date().toISOString().split('T')[0];
      const { data: expiredMemberships, error: expError } = await supabase
        .from('memberships')
        .select('id, customer_id, membership_type, end_date')
        .eq('status', 'active')
        .lt('end_date', now);

      if (!expError && expiredMemberships && expiredMemberships.length > 0) {
        const expiredIds = expiredMemberships.map(m => m.id);
        const { error: updateExpError } = await supabase
          .from('memberships')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .in('id', expiredIds);

        if (!updateExpError) {
          membershipsExpired = expiredIds.length;
          console.log(`🎫 Expired ${membershipsExpired} membership(s): ${expiredMemberships.map(m => m.membership_type).join(', ')}`);
        } else {
          console.error('⚠️  Failed to expire memberships:', updateExpError);
        }
      }
    } catch (error) {
      console.error('⚠️  Error checking membership expiry:', error);
    }

    // Update last sync timestamp
    try {
      const { supabase } = require('./utils/supabaseDb');
      const { error: updateError } = await supabase
        .from('sync_tracking')
        .upsert({
          sync_type: 'shopify_orders',
          last_sync_at: syncStartTime,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'sync_type'
        });

      if (updateError) {
        console.error('⚠️  Failed to update sync timestamp:', updateError);
      } else {
        console.log(`✅ Updated last sync timestamp to ${syncStartTime}`);
      }
    } catch (error) {
      console.error('⚠️  Error updating sync timestamp:', error);
    }

    // Auto-complete enrollments where all booked classes have passed
    const autoCompleted = await autoCompleteFinishedEnrollments();

    // Sync customer_type based on active memberships
    const customerTypesUpdated = await supabaseDb.syncCustomerTypeFromMemberships();

    res.json({
      success: true,
      message: `Processed ${processedCount} course purchases, created ${enrollmentsCreated} new enrollments, ${skippedCount} already existed, ${membershipsExpired} memberships expired` + (autoCompleted > 0 ? `, auto-completed ${autoCompleted} finished enrollments` : '') + (customerTypesUpdated > 0 ? `, updated ${customerTypesUpdated} customer types` : ''),
      processedCount,
      enrollmentsCreated,
      skippedCount,
      membershipsExpired,
      autoCompleted,
      customerTypesUpdated
    });

  } catch (error) {
    console.error('Error syncing Shopify orders:', error);
    res.status(500).json({ error: 'Failed to sync orders from Shopify' });
  }
});

// Shopify webhook HMAC verification middleware
function verifyShopifyWebhook(req, res, next) {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!hmac) {
    console.error('Missing Shopify HMAC header');
    return res.status(401).json({ error: 'Missing webhook signature' });
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error('SHOPIFY_API_SECRET not configured');
    return res.status(500).json({ error: 'Webhook verification not configured' });
  }

  const crypto = require('crypto');
  // req.body is a Buffer from express.raw(), use it directly for HMAC
  const body = Buffer.isBuffer(req.body) ? req.body : (req.rawBody || '');
  const digest = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64');

  try {
    if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac))) {
      console.error('Invalid Shopify HMAC');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  } catch (e) {
    console.error('HMAC comparison failed:', e.message);
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  next();
}

// Shopify webhook for order creation
app.post('/api/shopify/webhook/orders', express.raw({ type: 'application/json' }), verifyShopifyWebhook, async (req, res) => {
  try {
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
app.post('/api/shopify/webhook/customers', express.raw({ type: 'application/json' }), verifyShopifyWebhook, async (req, res) => {
  try {
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
// INVENTORY MANAGEMENT ENDPOINTS
// ============================================

// Get all suppliers
app.get('/api/admin/inventory/suppliers', authenticateToken, requireAdmin, async (req, res) => {
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
app.post('/api/admin/inventory/suppliers', authenticateToken, requireAdmin, async (req, res) => {
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
app.get('/api/admin/inventory/items', authenticateToken, requireAdmin, async (req, res) => {
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
app.get('/api/admin/inventory/low-stock', authenticateToken, requireAdmin, async (req, res) => {
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
app.post('/api/admin/inventory/items', authenticateToken, requireAdmin, async (req, res) => {
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
app.post('/api/admin/inventory/items/:id/adjust-stock', authenticateToken, requireAdmin, async (req, res) => {
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
app.get('/api/admin/inventory/categories', authenticateToken, requireAdmin, async (req, res) => {
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
app.post('/api/admin/inventory/send-reorder-email', authenticateToken, requireAdmin, async (req, res) => {
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
app.get('/api/admin/inventory/items/:id/transactions', authenticateToken, requireAdmin, async (req, res) => {
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
app.get('/api/admin/inventory/stats', authenticateToken, requireAdmin, async (req, res) => {
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

app.get('*', (req, res, next) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile('index.html', { root: 'public' });
  } else {
    next();
  }
});

// ── Events (public: upcoming/active only) ────────────────────────────────────
app.get('/api/events/upcoming', async (req, res) => {
  try {
    const { data, error } = await supabaseDb.supabase
      .from('events')
      .select('id, title, event_type, status, date, end_date, start_time, end_time, location, description, link')
      .in('status', ['upcoming', 'active'])
      .order('date', { ascending: true });
    if (error) throw error;
    res.json({ events: data || [] });
  } catch (error) {
    console.error('Error fetching upcoming events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// ── Admin Events ─────────────────────────────────────────────────────────────
app.get('/api/admin/events', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseDb.supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true, nullsFirst: false });
    if (error) throw error;
    res.json({ events: data || [] });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

app.post('/api/admin/events', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, event_type, status, date, end_date, start_time, end_time, location, description, link, notes, checklist } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const { data, error } = await supabaseDb.supabase
      .from('events')
      .insert({ title, event_type, status: status || 'draft', date, end_date, start_time, end_time, location, description, link, notes, checklist })
      .select()
      .single();
    if (error) throw error;
    res.json({ event: data });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

app.put('/api/admin/events/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, event_type, status, date, end_date, start_time, end_time, location, description, link, notes, checklist } = req.body;
    const { data, error } = await supabaseDb.supabase
      .from('events')
      .update({ title, event_type, status, date, end_date, start_time, end_time, location, description, link, notes, checklist, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ event: data });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

app.delete('/api/admin/events/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { error } = await supabaseDb.supabase
      .from('events')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// ── Admin Settings (studio policy) ──────────────────────────────────────────
app.get('/api/settings/studio-policy', async (req, res) => {
  try {
    const { data, error } = await supabaseDb.supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'studio_policy')
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    res.json({ sections: data ? JSON.parse(data.setting_value) : null });
  } catch (error) {
    console.error('Error fetching studio policy:', error);
    res.status(500).json({ error: 'Failed to fetch studio policy' });
  }
});

app.get('/api/admin/settings/studio-policy', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseDb.supabase
      .from('admin_settings')
      .select('*')
      .eq('setting_key', 'studio_policy')
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    res.json({ sections: data ? JSON.parse(data.setting_value) : null });
  } catch (error) {
    console.error('Error fetching studio policy:', error);
    res.status(500).json({ error: 'Failed to fetch studio policy' });
  }
});

app.put('/api/admin/settings/studio-policy', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { sections } = req.body;
    if (!Array.isArray(sections)) {
      return res.status(400).json({ error: 'sections must be an array' });
    }

    const value = JSON.stringify(sections);
    const now = new Date().toISOString();

    // Upsert: try update first, then insert if not found
    const { data: existing } = await supabaseDb.supabase
      .from('admin_settings')
      .select('id')
      .eq('setting_key', 'studio_policy')
      .single();

    if (existing) {
      const { error } = await supabaseDb.supabase
        .from('admin_settings')
        .update({ setting_value: value, updated_at: now })
        .eq('setting_key', 'studio_policy');
      if (error) throw error;
    } else {
      const { error } = await supabaseDb.supabase
        .from('admin_settings')
        .insert({ setting_key: 'studio_policy', setting_value: value, description: 'Studio policy sections shown to students', updated_at: now });
      if (error) throw error;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving studio policy:', error);
    res.status(500).json({ error: 'Failed to save studio policy' });
  }
});

// ============================================
// INSTRUCTOR PROFILE & COMMUNITY ENDPOINTS
// ============================================

// GET /api/community - Public community directory with role filters
app.get('/api/community', async (req, res) => {
  try {
    const { role } = req.query;

    // Get all customers who are instructors OR have public pottery pieces
    let query = supabaseDb.supabase
      .from('customers')
      .select('id, first_name, last_name, role, bio, profile_image');

    if (role && role !== 'all') {
      query = query.eq('role', role);
    }

    const { data: customers, error } = await query;
    if (error) throw error;

    // Get public piece counts per customer
    const { data: pieceCounts, error: pieceError } = await supabaseDb.supabase
      .from('pottery_pieces')
      .select('customer_id')
      .eq('is_public', true);

    const pieceCountMap = {};
    if (pieceCounts) {
      pieceCounts.forEach(p => {
        pieceCountMap[p.customer_id] = (pieceCountMap[p.customer_id] || 0) + 1;
      });
    }

    // Get portfolio counts for instructors
    const { data: portfolioCounts, error: portfolioError } = await supabaseDb.supabase
      .from('instructor_portfolio')
      .select('customer_id');

    const portfolioCountMap = {};
    if (portfolioCounts) {
      portfolioCounts.forEach(p => {
        portfolioCountMap[p.customer_id] = (portfolioCountMap[p.customer_id] || 0) + 1;
      });
    }

    // Filter: show instructors always, others only if they have public pieces
    const members = customers
      .filter(c => c.role === 'instructor' || pieceCountMap[c.id] > 0)
      .map(c => ({
        id: c.id,
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'VES Student',
        role: c.role || 'student',
        bio: c.bio,
        profile_image: c.profile_image,
        piece_count: pieceCountMap[c.id] || 0,
        portfolio_count: portfolioCountMap[c.id] || 0,
      }));

    res.json({ members });
  } catch (error) {
    console.error('Error fetching community:', error);
    res.status(500).json({ error: 'Failed to fetch community' });
  }
});

// GET /api/instructors/:id/portfolio - Public instructor profile with portfolio
app.get('/api/instructors/:id/portfolio', async (req, res) => {
  try {
    const { id } = req.params;

    // Get instructor profile
    const { data: instructor, error: instError } = await supabaseDb.supabase
      .from('customers')
      .select('id, first_name, last_name, role, bio, profile_image')
      .eq('id', id)
      .single();

    if (instError) throw instError;

    // Get portfolio items
    const { data: portfolio, error: portError } = await supabaseDb.supabase
      .from('instructor_portfolio')
      .select('*')
      .eq('customer_id', id)
      .order('sort_order', { ascending: true });

    if (portError) throw portError;

    // Get public pottery pieces
    const { data: pieces, error: pieceError } = await supabaseDb.supabase
      .from('pottery_pieces')
      .select('id, title, images, clay_type, notes, date_completed')
      .eq('customer_id', id)
      .eq('is_public', true)
      .order('date_completed', { ascending: false });

    res.json({
      instructor: {
        id: instructor.id,
        name: `${instructor.first_name || ''} ${instructor.last_name || ''}`.trim(),
        role: instructor.role || 'student',
        bio: instructor.bio,
        profile_image: instructor.profile_image,
      },
      portfolio: portfolio || [],
      pieces: pieces || [],
    });
  } catch (error) {
    console.error('Error fetching instructor portfolio:', error);
    res.status(500).json({ error: 'Failed to fetch instructor portfolio' });
  }
});

// PUT /api/instructors/profile - Instructor updates own profile
app.put('/api/instructors/profile', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { bio } = req.body;

    const { error } = await supabaseDb.supabase
      .from('customers')
      .update({ bio })
      .eq('id', dbCustomerId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating instructor profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/instructors/profile/image - Upload profile image
app.post('/api/instructors/profile/image', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const result = await uploadImageToSupabase(
      req.file.buffer, req.file.originalname, req.file.mimetype, `profile-${dbCustomerId}`
    );

    const { error } = await supabaseDb.supabase
      .from('customers')
      .update({ profile_image: result.url })
      .eq('id', dbCustomerId);

    if (error) throw error;
    res.json({ url: result.url });
  } catch (error) {
    console.error('Error uploading profile image:', error);
    res.status(500).json({ error: 'Failed to upload profile image' });
  }
});

// POST /api/instructors/portfolio - Add portfolio item (image or video URL)
app.post('/api/instructors/portfolio', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { title, description, media_type, video_url } = req.body;

    let media_url = video_url || null;
    let media_path = null;

    if (media_type === 'image' && req.file) {
      const result = await uploadImageToSupabase(
        req.file.buffer, req.file.originalname, req.file.mimetype, `portfolio-${dbCustomerId}`
      );
      media_url = result.url;
      media_path = result.path;
    }

    if (!media_url) {
      return res.status(400).json({ error: 'No image file or video URL provided' });
    }

    // Get next sort order
    const { data: existing } = await supabaseDb.supabase
      .from('instructor_portfolio')
      .select('sort_order')
      .eq('customer_id', dbCustomerId)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextOrder = (existing?.[0]?.sort_order || 0) + 1;

    const { data, error } = await supabaseDb.supabase
      .from('instructor_portfolio')
      .insert({
        customer_id: dbCustomerId,
        title: title || null,
        description: description || null,
        media_type: media_type || 'image',
        media_url,
        media_path,
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error adding portfolio item:', error);
    res.status(500).json({ error: 'Failed to add portfolio item' });
  }
});

// DELETE /api/instructors/portfolio/:id - Remove portfolio item
app.delete('/api/instructors/portfolio/:id', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;
    const { id } = req.params;

    // Verify ownership
    const { data: item, error: fetchError } = await supabaseDb.supabase
      .from('instructor_portfolio')
      .select('*')
      .eq('id', id)
      .eq('customer_id', dbCustomerId)
      .single();

    if (fetchError || !item) {
      return res.status(404).json({ error: 'Portfolio item not found' });
    }

    // Delete from storage if it's an uploaded image
    if (item.media_path) {
      try {
        await deleteImageFromSupabase(item.media_path);
      } catch (e) {
        console.warn('Failed to delete portfolio image from storage:', e.message);
      }
    }

    const { error } = await supabaseDb.supabase
      .from('instructor_portfolio')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting portfolio item:', error);
    res.status(500).json({ error: 'Failed to delete portfolio item' });
  }
});

// GET /api/instructor/dashboard - Instructor's own dashboard data
app.get('/api/instructor/dashboard', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    // Get instructor profile
    const { data: instructor, error: instrError } = await supabaseDb.supabase
      .from('customers')
      .select('id, first_name, last_name, email, bio, profile_image, role')
      .eq('id', dbCustomerId)
      .single();

    if (instrError || !instructor || instructor.role !== 'instructor') {
      return res.status(403).json({ error: 'Instructor access required' });
    }

    const instructorName = `${instructor.first_name} ${instructor.last_name}`;
    const today = new Date().toISOString().split('T')[0];

    // Get upcoming classes taught by this instructor
    const { data: upcomingClasses } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .eq('instructor', instructorName)
      .gte('class_date', today)
      .order('class_date', { ascending: true })
      .limit(20);

    // Get recent classes (past 4 weeks)
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const { data: recentClasses } = await supabaseDb.supabase
      .from('class_instances')
      .select('*')
      .eq('instructor', instructorName)
      .lt('class_date', today)
      .gte('class_date', fourWeeksAgo.toISOString().split('T')[0])
      .order('class_date', { ascending: false })
      .limit(20);

    // Get bookings for upcoming classes with student info, booking type, enrollment
    const upcomingIds = (upcomingClasses || []).map(c => c.id);
    let studentsByClass = {};
    if (upcomingIds.length > 0) {
      const { data: bookings } = await supabaseDb.supabase
        .from('bookings')
        .select('id, class_instance_id, student_id, status, booking_type, is_makeup_class, attended, course_enrollment_id, customers:student_id(id, first_name, last_name, email, profile_image)')
        .in('class_instance_id', upcomingIds)
        .in('status', ['booked', 'completed', 'forfeited']);

      // Collect enrollment IDs for course info lookup
      const enrollmentIds = [...new Set((bookings || []).filter(b => b.course_enrollment_id).map(b => b.course_enrollment_id))];
      let enrollmentMap = {};
      if (enrollmentIds.length > 0) {
        const { data: enrollments } = await supabaseDb.supabase
          .from('course_enrollments')
          .select('id, course_identifier, course_type, class_credits_used, class_credits_allocated, number_of_weeks, weeks_completed, package_total_courses')
          .in('id', enrollmentIds);
        (enrollments || []).forEach(e => { enrollmentMap[e.id] = e; });
      }

      // Get course_purchase_count from customers table (admin-editable source of truth)
      const allStudentIds = [...new Set((bookings || []).filter(b => b.customers).map(b => b.customers.id))];
      let orderCountMap = {};
      let wheelPrefMap = {};
      if (allStudentIds.length > 0) {
        const { data: customerCounts } = await supabaseDb.supabase
          .from('customers')
          .select('id, course_purchase_count, wheel_preference')
          .in('id', allStudentIds);
        (customerCounts || []).forEach(c => {
          orderCountMap[c.id] = c.course_purchase_count || 0;
          if (c.wheel_preference) wheelPrefMap[c.id] = c.wheel_preference;
        });
      }

      (bookings || []).forEach(b => {
        if (!studentsByClass[b.class_instance_id]) {
          studentsByClass[b.class_instance_id] = [];
        }
        if (b.customers) {
          const enr = enrollmentMap[b.course_enrollment_id] || {};
          studentsByClass[b.class_instance_id].push({
            ...b.customers,
            bookingId: b.id,
            bookingStatus: b.status,
            bookingType: b.is_makeup_class ? 'makeup' : 'enrolled',
            attended: b.attended,
            courseIdentifier: enr.course_identifier || null,
            classesAttended: enr.weeks_completed || enr.class_credits_used || 0,
            totalClasses: enr.number_of_weeks || enr.class_credits_allocated || 6,
            orderCount: orderCountMap[b.customers.id] || 0,
            wheelPreference: wheelPrefMap[b.customers.id] || null,
            isWt3Course: enr.package_total_courses === 3 && ((enr.course_identifier || '').toUpperCase().startsWith('WT') || (enr.course_type || '').toLowerCase().includes('wheelthrowing')),
          });
        }
      });
    }

    // Also get bookings for recent classes to show attendance counts
    const recentIds = (recentClasses || []).map(c => c.id);
    let recentStudentsByClass = {};
    if (recentIds.length > 0) {
      const { data: recentBookings } = await supabaseDb.supabase
        .from('bookings')
        .select('id, class_instance_id, student_id, status, booking_type, is_makeup_class, attended, course_enrollment_id, customers:student_id(id, first_name, last_name)')
        .in('class_instance_id', recentIds)
        .in('status', ['booked', 'attended', 'completed', 'forfeited']);

      (recentBookings || []).forEach(b => {
        if (!recentStudentsByClass[b.class_instance_id]) {
          recentStudentsByClass[b.class_instance_id] = [];
        }
        if (b.customers) {
          recentStudentsByClass[b.class_instance_id].push({
            ...b.customers,
            bookingId: b.id,
            bookingStatus: b.status,
            bookingType: b.is_makeup_class ? 'makeup' : 'enrolled',
            attended: b.attended,
          });
        }
      });
    }

    // Get portfolio
    const { data: portfolio } = await supabaseDb.supabase
      .from('instructor_portfolio')
      .select('*')
      .eq('instructor_id', dbCustomerId)
      .order('created_at', { ascending: false });

    res.json({
      instructor: {
        name: instructorName,
        firstName: instructor.first_name,
        bio: instructor.bio,
        profileImage: instructor.profile_image
      },
      upcomingClasses: upcomingClasses || [],
      recentClasses: recentClasses || [],
      studentsByClass,
      recentStudentsByClass,
      portfolio: portfolio || []
    });
  } catch (error) {
    console.error('Error fetching instructor dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch instructor dashboard' });
  }
});

// POST /api/admin/instructors - Create a new instructor
app.post('/api/admin/instructors', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { first_name, last_name, email, bio } = req.body;

    if (!first_name || !email) {
      return res.status(400).json({ error: 'First name and email are required' });
    }

    // Check if customer already exists
    const { data: existing } = await supabaseDb.supabase
      .from('customers')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existing) {
      // Update existing customer to instructor role
      const { error } = await supabaseDb.supabase
        .from('customers')
        .update({ role: 'instructor', bio: bio || null, first_name, last_name: last_name || null })
        .eq('id', existing.id);
      if (error) throw error;
      return res.json({ success: true, id: existing.id, updated: true });
    }

    // Create new customer with instructor role
    const { data, error } = await supabaseDb.supabase
      .from('customers')
      .insert({
        first_name,
        last_name: last_name || null,
        email: email.toLowerCase().trim(),
        role: 'instructor',
        bio: bio || null,
        customer_type: 'student',
        shopify_customer_id: `instructor_${Date.now()}`,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, id: data.id, created: true });
  } catch (error) {
    console.error('Error creating instructor:', error);
    res.status(500).json({ error: 'Failed to create instructor' });
  }
});

// GET /api/admin/instructors/:id/teaching - Teaching data filtered from /api/admin/classes
// Reuses the exact same data source (class_instances + bookings) filtered by instructor name
app.get('/api/admin/instructors/:id/teaching', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: instructor, error: instrErr } = await supabaseDb.supabase
      .from('customers')
      .select('id, first_name, last_name')
      .eq('id', id)
      .single();

    if (instrErr || !instructor) {
      return res.status(404).json({ error: 'Instructor not found' });
    }

    const instructorName = `${instructor.first_name} ${instructor.last_name}`;

    // Use the EXACT same query as /api/admin/classes
    const { data: allClassInstances, error: classesError } = await supabaseDb.supabase
      .from('class_instances')
      .select('id, class_type, class_date, start_time, end_time, instructor, room, max_capacity, current_enrollment, class_title, class_description, status')
      .gte('class_date', '2026-01-01')
      .order('class_date', { ascending: true });

    if (classesError) throw classesError;

    // Filter to this instructor's classes
    const instructorClasses = allClassInstances.filter(c => c.instructor === instructorName);

    // Group by base identifier (same logic as /api/admin/classes)
    const courseMap = new Map();
    instructorClasses.forEach(cls => {
      const fullIdentifier = cls.class_type;
      const lastDotIndex = fullIdentifier.lastIndexOf('.');
      const baseIdentifier = lastDotIndex > 0 ? fullIdentifier.substring(0, lastDotIndex) : fullIdentifier;
      if (!courseMap.has(baseIdentifier)) {
        courseMap.set(baseIdentifier, []);
      }
      courseMap.get(baseIdentifier).push({
        ...cls,
        courseIdentifier: fullIdentifier,
        baseCourseIdentifier: baseIdentifier,
      });
    });

    // Fetch bookings (same pagination approach as /api/admin/classes)
    let allBookings = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabaseDb.supabase
        .from('bookings')
        .select('class_instance_id, student_id, status')
        .in('status', ['booked', 'attended', 'completed'])
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;
      allBookings = allBookings.concat(data);
      hasMore = data.length === pageSize;
      page++;
    }

    const bookingCountsByClass = {};
    allBookings.forEach(b => {
      bookingCountsByClass[b.class_instance_id] = (bookingCountsByClass[b.class_instance_id] || 0) + 1;
    });

    // Build courses with booking counts + unique students (same as /api/admin/classes)
    const courses = Array.from(courseMap.entries()).map(([identifier, classes]) => {
      classes.sort((a, b) => new Date(a.class_date) - new Date(b.class_date));
      const uniqueStudents = new Set();
      classes.forEach(cls => {
        cls.bookingCount = bookingCountsByClass[cls.id] || 0;
        allBookings
          .filter(b => b.class_instance_id === cls.id)
          .forEach(b => uniqueStudents.add(b.student_id));
      });
      return { identifier, totalEnrollment: uniqueStudents.size, classes };
    });

    res.json({ courses });
  } catch (error) {
    console.error('Error fetching instructor teaching data:', error);
    res.status(500).json({ error: 'Failed to fetch teaching data' });
  }
});

// POST /api/admin/instructors/:id/profile-image - Admin uploads profile image for instructor
app.post('/api/admin/instructors/:id/profile-image', authenticateToken, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });

    const result = await uploadImageToSupabase(
      req.file.buffer, req.file.originalname, req.file.mimetype, `profile-${id}`
    );

    const { error } = await supabaseDb.supabase
      .from('customers')
      .update({ profile_image: result.url })
      .eq('id', id);

    if (error) throw error;
    res.json({ url: result.url });
  } catch (error) {
    console.error('Error uploading instructor profile image:', error);
    res.status(500).json({ error: 'Failed to upload profile image' });
  }
});

// PUT /api/admin/customers/:id/role - Admin sets user role
app.put('/api/admin/customers/:id/role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const { id } = req.params;

    if (!['student', 'member', 'instructor'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be student, member, or instructor.' });
    }

    const { error } = await supabaseDb.supabase
      .from('customers')
      .update({ role })
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating customer role:', error);
    res.status(500).json({ error: 'Failed to update customer role' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// STUDIO ACCESS BOOKING SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

const STUDIO_HOURS = {
  0: { open: '12:00', close: '19:00', label: '12pm – 7pm' },   // Sunday
  1: { open: '11:00', close: '18:00', label: '11am – 6pm' },   // Monday
  2: { open: '11:00', close: '18:00', label: '11am – 6pm' },   // Tuesday
  3: { open: '11:00', close: '18:00', label: '11am – 6pm' },   // Wednesday
  4: { open: '11:00', close: '18:00', label: '11am – 6pm' },   // Thursday
  5: { open: '12:00', close: '19:00', label: '12pm – 7pm' },   // Friday
  6: null,                                                       // Saturday — CLOSED
};
const STUDIO_ACCESS_RATE = 20; // $20/hr
const STUDIO_ACCESS_MIN_HOURS = 2;
const STUDIO_ACCESS_MAX_PER_DATE = 10;

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

async function checkStudioAccessEligibility(customerId) {
  // Check active/paused course enrollment
  const { data: enrollments } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('id, status')
    .eq('student_id', customerId)
    .in('status', ['active', 'paused']);
  if (enrollments && enrollments.length > 0) {
    return { eligible: true, reason: 'Active course enrollment' };
  }
  // Check active membership
  const hasMembership = await supabaseDb.hasActiveMembership(customerId);
  if (hasMembership) {
    return { eligible: true, reason: 'Active membership' };
  }
  // TODO: Check VES voucher holder
  return { eligible: false, reason: 'No active enrollment or membership. Studio access is available to current students and VES voucher holders.' };
}

async function getStudioAccessCountForDate(dateStr) {
  const { data, error } = await supabaseDb.supabase
    .from('studio_access_bookings')
    .select('id', { count: 'exact' })
    .eq('booking_date', dateStr)
    .neq('status', 'cancelled');
  if (error) return 0;
  return data ? data.length : 0;
}

// ── Student: Check availability ─────────────────────────────────────────────
app.get('/api/studio-access/availability', authenticateToken, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });

    const d = new Date(date + 'T12:00:00');
    const dayOfWeek = d.getDay();
    const hours = STUDIO_HOURS[dayOfWeek];

    if (!hours) {
      return res.json({ available: false, closed: true, reason: 'Studio is closed on Saturdays' });
    }

    const bookedCount = await getStudioAccessCountForDate(date);
    const spotsLeft = Math.max(0, STUDIO_ACCESS_MAX_PER_DATE - bookedCount);

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const isSameDay = date === today;

    res.json({
      available: spotsLeft > 0,
      closed: false,
      openTime: hours.open,
      closeTime: hours.close,
      hoursLabel: hours.label,
      bookedCount,
      spotsLeft,
      maxCapacity: STUDIO_ACCESS_MAX_PER_DATE,
      isSameDay,
      rate: STUDIO_ACCESS_RATE,
      minHours: STUDIO_ACCESS_MIN_HOURS,
    });
  } catch (error) {
    console.error('Error checking studio access availability:', error);
    res.status(500).json({ error: 'Failed to check availability' });
  }
});

// ── Student: My bookings ────────────────────────────────────────────────────
app.get('/api/studio-access/my-bookings', authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.dbCustomerId;
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabaseDb.supabase
      .from('studio_access_bookings')
      .select('*')
      .eq('customer_id', customerId)
      .neq('status', 'cancelled')
      .gte('booking_date', today)
      .order('booking_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw error;

    // Also fetch recent past bookings (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: pastData } = await supabaseDb.supabase
      .from('studio_access_bookings')
      .select('*')
      .eq('customer_id', customerId)
      .lt('booking_date', today)
      .gte('booking_date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('booking_date', { ascending: false })
      .limit(10);

    // Check studio access passes
    const passes = await getStudioAccessPasses(customerId);

    res.json({ upcoming: data || [], past: pastData || [], passes });
  } catch (error) {
    console.error('Error fetching studio access bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// ── Student: Book studio access ─────────────────────────────────────────────
app.post('/api/studio-access/book', authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.dbCustomerId;
    const { date, startTime, notes, usePass } = req.body;

    if (!date || !startTime) {
      return res.status(400).json({ error: 'Date and start time are required' });
    }

    // Check eligibility
    const eligibility = await checkStudioAccessEligibility(customerId);
    if (!eligibility.eligible) {
      return res.status(403).json({ error: eligibility.reason });
    }

    // If using a pass, verify they have remaining passes
    let isPassBooking = false;
    if (usePass) {
      const passes = await getStudioAccessPasses(customerId);
      if (passes.remaining <= 0) {
        return res.status(400).json({ error: 'No studio access passes remaining' });
      }
      isPassBooking = true;
    }

    // Validate date is not Saturday
    const d = new Date(date + 'T12:00:00');
    const dayOfWeek = d.getDay();
    const hoursConfig = STUDIO_HOURS[dayOfWeek];
    if (!hoursConfig) {
      return res.status(400).json({ error: 'Studio is closed on Saturdays' });
    }

    // Validate start time is within open hours
    if (startTime < hoursConfig.open || startTime >= hoursConfig.close) {
      return res.status(400).json({ error: `Studio hours are ${hoursConfig.label}` });
    }

    // Check capacity
    const bookedCount = await getStudioAccessCountForDate(date);
    if (bookedCount >= STUDIO_ACCESS_MAX_PER_DATE) {
      return res.status(400).json({ error: 'This date is fully booked' });
    }

    // Determine status: same-day bookings are pending
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const status = date === today ? 'pending' : 'booked';

    // Pass bookings: free, no hour restriction. Regular: min 2 hours, settled by admin.
    const hours = isPassBooking ? 0 : STUDIO_ACCESS_MIN_HOURS;
    const amount = isPassBooking ? 0 : hours * STUDIO_ACCESS_RATE;

    const { data, error } = await supabaseDb.supabase
      .from('studio_access_bookings')
      .insert([{
        customer_id: customerId,
        booking_date: date,
        start_time: startTime,
        end_time: null,
        hours,
        amount_sgd: amount,
        status,
        notes: isPassBooking ? `${notes || ''} [Studio Pass]`.trim() : (notes || null),
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ booking: data, message: status === 'pending' ? 'Booking submitted — awaiting confirmation' : 'Booking confirmed', passUsed: isPassBooking });
  } catch (error) {
    console.error('Error creating studio access booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// ── Student: Cancel own booking ─────────────────────────────────────────────
app.put('/api/studio-access/bookings/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.dbCustomerId;
    const { id } = req.params;

    // Fetch the booking
    const { data: booking, error: fetchError } = await supabaseDb.supabase
      .from('studio_access_bookings')
      .select('*')
      .eq('id', id)
      .eq('customer_id', customerId)
      .single();

    if (fetchError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Booking is already cancelled' });
    }

    if (booking.status === 'attended') {
      return res.status(400).json({ error: 'Cannot cancel an attended booking' });
    }

    // Enforce 2-hour cancellation window
    const bookingStart = new Date(`${booking.booking_date}T${booking.start_time}:00`);
    const now = new Date();
    const hoursUntilStart = (bookingStart - now) / (1000 * 60 * 60);

    if (hoursUntilStart < 2) {
      return res.status(400).json({ error: 'Cancellations must be made at least 2 hours before the start time' });
    }

    const { data, error } = await supabaseDb.supabase
      .from('studio_access_bookings')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ booking: data });
  } catch (error) {
    console.error('Error cancelling studio access booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

// ── Admin: List bookings ────────────────────────────────────────────────────
app.get('/api/admin/studio-access/bookings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });
    const { date, studentId } = req.query;

    let query = supabaseDb.supabase
      .from('studio_access_bookings')
      .select('*, customer:customers(id, first_name, last_name, email)')
      .order('booking_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (date) query = query.eq('booking_date', date);
    if (studentId) query = query.eq('customer_id', studentId);

    const { data, error } = await query;
    if (error) throw error;

    // Enrich with pass info for each unique customer
    const customerIds = [...new Set((data || []).map(b => b.customer_id))];
    const passMap = {};
    for (const cid of customerIds) {
      passMap[cid] = await getStudioAccessPasses(cid);
    }
    const enriched = (data || []).map(b => ({ ...b, passes: passMap[b.customer_id] || null }));

    res.json({ bookings: enriched });
  } catch (error) {
    console.error('Error fetching admin studio access bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// ── Admin: Student studio access history ────────────────────────────────────
app.get('/api/admin/students/:studentId/studio-access', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });
    const { studentId } = req.params;

    const { data, error } = await supabaseDb.supabase
      .from('studio_access_bookings')
      .select('*')
      .eq('customer_id', studentId)
      .order('booking_date', { ascending: false })
      .order('start_time', { ascending: false });

    if (error) throw error;

    const bookings = data || [];
    const totalSessions = bookings.filter(b => b.status === 'attended').length;
    const totalHours = bookings.filter(b => b.status === 'attended').reduce((sum, b) => sum + b.hours, 0);
    const totalSpent = bookings.filter(b => b.status === 'attended').reduce((sum, b) => sum + b.amount_sgd, 0);
    const pendingCount = bookings.filter(b => b.status === 'pending').length;

    res.json({
      bookings,
      summary: { totalSessions, totalHours, totalSpent, pendingCount, totalBookings: bookings.length },
    });
  } catch (error) {
    console.error('Error fetching student studio access:', error);
    res.status(500).json({ error: 'Failed to fetch studio access history' });
  }
});

// ── Admin: Create booking on behalf of student ──────────────────────────────
app.post('/api/admin/studio-access/bookings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });
    const { customerId, date, startTime, hours: reqHours, notes, adminNotes } = req.body;

    if (!customerId || !date || !startTime) {
      return res.status(400).json({ error: 'Customer ID, date, and start time are required' });
    }

    const hours = reqHours ? parseInt(reqHours, 10) : STUDIO_ACCESS_MIN_HOURS;

    if (hours < STUDIO_ACCESS_MIN_HOURS) {
      return res.status(400).json({ error: `Minimum ${STUDIO_ACCESS_MIN_HOURS} hours` });
    }

    const { data, error } = await supabaseDb.supabase
      .from('studio_access_bookings')
      .insert([{
        customer_id: customerId,
        booking_date: date,
        start_time: startTime,
        end_time: null,
        hours,
        amount_sgd: hours * STUDIO_ACCESS_RATE,
        status: 'booked',
        notes: notes || null,
        admin_notes: adminNotes || null,
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ booking: data });
  } catch (error) {
    console.error('Error creating admin studio access booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// ── Admin: Confirm pending booking ──────────────────────────────────────────
app.put('/api/admin/studio-access/bookings/:id/confirm', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });

    const { data, error } = await supabaseDb.supabase
      .from('studio_access_bookings')
      .update({ status: 'booked', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Pending booking not found' });
    res.json({ booking: data });
  } catch (error) {
    console.error('Error confirming studio access booking:', error);
    res.status(500).json({ error: 'Failed to confirm booking' });
  }
});

// ── Admin: Mark as attended (settles actual hours + amount) ─────────────────
app.put('/api/admin/studio-access/bookings/:id/attended', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });

    const { hours } = req.body || {};
    const actualHours = hours ? parseInt(hours, 10) : null;

    if (actualHours !== null && (actualHours < STUDIO_ACCESS_MIN_HOURS || isNaN(actualHours))) {
      return res.status(400).json({ error: `Minimum ${STUDIO_ACCESS_MIN_HOURS} hours` });
    }

    const updateFields = { status: 'attended', updated_at: new Date().toISOString() };
    if (actualHours) {
      updateFields.hours = actualHours;
      updateFields.amount_sgd = actualHours * STUDIO_ACCESS_RATE;
    }

    const { data, error } = await supabaseDb.supabase
      .from('studio_access_bookings')
      .update(updateFields)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Booking not found' });
    res.json({ booking: data });
  } catch (error) {
    console.error('Error marking studio access as attended:', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// ── Admin: Cancel booking ───────────────────────────────────────────────────
app.put('/api/admin/studio-access/bookings/:id/cancel', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });

    const { data, error } = await supabaseDb.supabase
      .from('studio_access_bookings')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Booking not found' });
    res.json({ booking: data });
  } catch (error) {
    console.error('Error cancelling studio access booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

// ── Admin: Hard delete booking ──────────────────────────────────────────────
app.delete('/api/admin/studio-access/bookings/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });

    const { error } = await supabaseDb.supabase
      .from('studio_access_bookings')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting studio access booking:', error);
    res.status(500).json({ error: 'Failed to delete booking' });
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
