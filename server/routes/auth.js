const supabaseDb = require('../utils/supabaseDb');
const { getStudioAccessPasses } = require('../utils/studioAccess');

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler }) {

// ============================================
// AUTH ENDPOINTS
// ============================================

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

app.post('/api/auth/logout', (req, res) => {
  // Clear old JWT cookie from pre-migration sessions
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  });
  // Clear impersonation cookie if present
  res.clearCookie('ves_impersonate', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    signed: true,
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

  res.json({
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

// Admin impersonation endpoint
app.post('/api/auth/impersonate/:email', authenticateToken, asyncHandler(async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const studentEmail = decodeURIComponent(req.params.email);

  const { data: student, error } = await supabaseDb.supabase
    .from('customers')
    .select('*')
    .eq('email', studentEmail)
    .single();

  if (error || !student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  // Impersonation now uses X-Impersonate-Id header (set by frontend in localStorage)
  // No cookie needed — cross-origin cookies are blocked by modern browsers
  res.json({
    success: true,
    student: {
      id: student.shopify_customer_id,
      dbId: student.id,
      email: student.email,
      firstName: student.first_name,
      lastName: student.last_name
    }
  });
}));

// Stop impersonation — clear cookie and return admin user data
app.post('/api/auth/stop-impersonation', authenticateToken, asyncHandler(async (req, res) => {
  // Clear the impersonation cookie
  res.clearCookie('ves_impersonate', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
    signed: true,
  });

  // Look up admin to return fresh admin user data
  const adminEmail = req.user.impersonatedBy || req.user.email;
  const { data: admin, error } = await supabaseDb.supabase
    .from('customers')
    .select('*')
    .eq('email', adminEmail)
    .single();

  if (error || !admin) {
    return res.status(500).json({ error: 'Admin account not found' });
  }

  const [hasMembership, activeEnrollmentRes] = await Promise.all([
    supabaseDb.hasActiveMembership(admin.id),
    supabaseDb.supabase
      .from('course_enrollments')
      .select('id')
      .eq('student_id', admin.id)
      .in('status', ['active', 'pending'])
      .limit(1)
  ]);
  const hasActiveEnrollments = (activeEnrollmentRes.data || []).length > 0;

  res.json({
    success: true,
    user: {
      customerId: admin.shopify_customer_id,
      dbCustomerId: admin.id,
      email: admin.email,
      firstName: admin.first_name,
      lastName: admin.last_name,
      isAdmin: true,
      isImpersonating: false,
      impersonatedBy: null,
      role: admin.role || 'admin',
      hasMembership,
      hasActiveEnrollments,
      customerType: admin.customer_type || 'admin'
    }
  });
}));

// ============================================
// STUDENT ENDPOINTS
// ============================================

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

};
