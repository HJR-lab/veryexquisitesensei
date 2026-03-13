const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const supabaseDb = require('../utils/supabaseDb');

const JWT_SECRET = process.env.JWT_SECRET;

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler, getStudioAccessPasses }) {

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

app.post('/api/auth/login', authLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  console.log('🔐 Login attempt');

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
    console.log('✅ Admin login successful');
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

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('✅ Student login successful');

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
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
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
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
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

}));

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
app.post('/api/auth/impersonate/:email', authenticateToken, asyncHandler(async (req, res) => {
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

  res.cookie('token', impersonationToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 1 * 24 * 60 * 60 * 1000, // 1 day (matches impersonation token expiry)
    path: '/',
  });

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

}));

// Stop impersonation — re-issues a fresh admin token
app.post('/api/auth/stop-impersonation', authenticateToken, asyncHandler(async (req, res) => {
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

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });

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

}));

// Get current student's data (for student dashboard)
app.get('/api/students/me', authenticateToken, asyncHandler(async (req, res) => {
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
}));

// Get structured dashboard data for student (enrollments grouped by status)
app.get('/api/students/me/dashboard', authenticateToken, asyncHandler(async (req, res) => {
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
}));

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  });
  res.json({ success: true });
});

// Update user profile
app.put('/api/auth/profile', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { firstName, lastName, email, mobile, dateOfBirth, profilePicture } = req.body;

  // Validate required fields
  if (!firstName || !lastName || !email) {
    return res.status(400).json({ error: 'First name, last name, and email are required' });
  }

  // Check if email is already taken by another user
  if (email !== req.user.email) {
    const { data: existingUser } = await supabaseDb.supabase
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

  const { data: updatedCustomer, error } = await supabaseDb.supabase
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
}));

// Change password
app.post('/api/auth/change-password', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new passwords are required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  // Get current password hash from database
  const { data: customer, error: fetchError } = await supabaseDb.supabase
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
  const newPasswordHash = await bcrypt.hash(newPassword, 12);

  // Update password in database
  const { error: updateError } = await supabaseDb.supabase
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
}));

// ============================================
// EMAIL VERIFICATION ENDPOINTS (Student First-Time Login)
// ============================================

// Request email verification (send 6-digit PIN)
app.post('/api/auth/request-verification', pinLimiter, asyncHandler(async (req, res) => {
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

}));

// Verify PIN code
app.post('/api/auth/verify-pin', pinLimiter, asyncHandler(async (req, res) => {
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

}));

// Set initial password (after email verification)
app.post('/api/auth/set-initial-password', pinLimiter, asyncHandler(async (req, res) => {
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
  const passwordHash = await bcrypt.hash(newPassword, 12);

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
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
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

}));

};
