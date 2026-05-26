const supabaseDb = require('../utils/supabaseDb');
const { getStudioAccessPasses } = require('../utils/studioAccess');

// One-time migration: add login tracking columns if they don't exist
(async () => {
  try {
    await supabaseDb.supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS login_count integer DEFAULT 0;
      `
    });
  } catch (err) {
    // rpc may not exist — try a direct query approach as fallback
    // Columns may already exist; ignore errors silently
  }
})();

// In-memory auth cache (60s TTL) - avoids 3 DB queries per page load
const authCache = new Map();
const AUTH_CACHE_TTL = 60 * 1000; // 60 seconds

function getCachedAuth(key) {
  const entry = authCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > AUTH_CACHE_TTL) {
    authCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedAuth(key, data) {
  authCache.set(key, { data, timestamp: Date.now() });
}

function invalidateAuthCache(key) {
  if (key) authCache.delete(key);
  else authCache.clear();
}

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler, getShopifyClient }) {

// ============================================
// On-demand Shopify order sync for new students
// ============================================
async function syncShopifyOrdersForCustomer(customer) {
  try {
    const client = getShopifyClient();
    if (!client) return;

    const email = customer.email;
    console.log(`🔄 On-demand order sync for ${email}`);

    const emailQuery = `email:${email.replace(/["\\]/g, '')}`;
    const query = `
      query getOrders($query: String!) {
        orders(first: 10, query: $query, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              customer {
                id
                email
                firstName
                lastName
              }
              lineItems(first: 20) {
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
          }
        }
      }
    `;

    const response = await client.query({ data: { query, variables: { query: emailQuery } } });
    const orders = response?.body?.data?.orders?.edges || [];

    if (orders.length === 0) return;

    const { processCoursePurchase } = require('../utils/courseEnrollmentManager');

    for (const { node: orderNode } of orders) {
      // Skip orders older than 6 months — prevents old courses from creating future enrollments
      const orderCreatedAt = orderNode.createdAt ? new Date(orderNode.createdAt) : null;
      if (orderCreatedAt && orderCreatedAt < new Date(Date.now() - 180 * 86400000)) {
        console.log(`⏭️  Skipping old order ${orderNode.id} from ${orderCreatedAt.toISOString().slice(0, 10)}`);
        continue;
      }

      const lineItems = orderNode.lineItems?.edges || [];
      for (const { node: item } of lineItems) {
        const title = (item.title || '').toLowerCase();
        if (title.includes('wheelthrowing') || title.includes('handbuilding') || title.includes('pottery course')) {
          // Extract numeric ID from Shopify GID
          const orderId = orderNode.id.replace('gid://shopify/Order/', '');
          const lineItemId = item.id.replace('gid://shopify/LineItem/', '');

          const order = {
            id: orderId,
            createdAt: orderNode.createdAt,
            customer: {
              email: customer.email,
              first_name: customer.first_name,
              last_name: customer.last_name,
            }
          };
          const lineItem = {
            id: lineItemId,
            title: item.title,
            variantTitle: item.variantTitle || '',
          };

          const result = await processCoursePurchase(order, lineItem);
          if (result.success && !result.skipped) {
            console.log(`✅ On-demand enrollment created for ${email}: ${item.title}`);
          }
        }
      }
    }
  } catch (err) {
    console.error('On-demand order sync failed:', err.message);
    // Don't block login
  }
}

// ============================================
// AUTH ENDPOINTS
// ============================================

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    // Check cache first (keyed by dbCustomerId + impersonation state)
    const cacheKey = `${dbCustomerId}:${req.user.isImpersonating || false}`;
    const cached = getCachedAuth(cacheKey);
    if (cached) {
      // Login tracking even on cache hit — fire-and-forget, non-blocking
      // Skip admin (info@ves.sg) and impersonation sessions
      if (!req.user.isImpersonating && !req.user.isAdmin) {
        const lastLogin = cached.user?.lastLoginAt ? new Date(cached.user.lastLoginAt) : null;
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (!lastLogin || lastLogin < oneHourAgo) {
          supabaseDb.supabase
            .from('customers')
            .select('last_login_at, login_count')
            .eq('id', dbCustomerId)
            .single()
            .then(({ data: fresh }) => {
              if (!fresh) return;
              const freshLogin = fresh.last_login_at ? new Date(fresh.last_login_at) : null;
              if (!freshLogin || freshLogin < oneHourAgo) {
                const now = new Date();
                supabaseDb.supabase
                  .from('customers')
                  .update({ last_login_at: now.toISOString(), login_count: (fresh.login_count || 0) + 1 })
                  .eq('id', dbCustomerId)
                  .then(() => {})
                  .catch(err => console.error('Login tracking error (cached):', err));
              }
            })
            .catch(() => {});
        }
      }
      return res.json(cached);
    }

    // Fetch customer, membership, and enrollment info all in parallel
    const [customerRes, hasMembership, activeEnrollmentRes] = await Promise.all([
      supabaseDb.supabase
        .from('customers')
        .select('*')
        .eq('id', dbCustomerId)
        .single(),
      supabaseDb.hasActiveMembership(dbCustomerId),
      supabaseDb.supabase
        .from('course_enrollments')
        .select('id')
        .eq('student_id', dbCustomerId)
        .in('status', ['active', 'pending'])
        .limit(1)
    ]);

    const { data: customer, error } = customerRes;

    if (error || !customer) {
      // Fallback to JWT data if database fetch fails
      return res.json({ user: req.user });
    }

    let hasActiveEnrollments = (activeEnrollmentRes.data || []).length > 0;

    // If no enrollments found, try on-demand Shopify order sync
    // This catches the case where the student signed in before the webhook arrived
    if (!hasActiveEnrollments && customer && !req.user.isAdmin) {
      await syncShopifyOrdersForCustomer(customer);
      // Re-check enrollments after sync
      const { data: recheckEnrollments } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('id')
        .eq('student_id', dbCustomerId)
        .in('status', ['active', 'pending'])
        .limit(1);
      hasActiveEnrollments = (recheckEnrollments || []).length > 0;
    }

    // Login tracking — fire-and-forget, non-blocking (1-hour deduplication)
    // Do NOT track impersonation sessions or admin (info@ves.sg)
    if (!req.user.isImpersonating && !req.user.isAdmin) {
      const now = new Date();
      const lastLogin = customer.last_login_at ? new Date(customer.last_login_at) : null;
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      if (!lastLogin || lastLogin < oneHourAgo) {
        supabaseDb.supabase
          .from('customers')
          .update({
            last_login_at: now.toISOString(),
            login_count: (customer.login_count || 0) + 1
          })
          .eq('id', dbCustomerId)
          .then(() => {})
          .catch(err => console.error('Login tracking error:', err));
      }
    }

    // Return user data with snake_case fields mapped to camelCase for frontend
    const response = {
      user: {
        customerId: customer.shopify_customer_id,
        dbCustomerId: customer.id,
        email: customer.email,
        firstName: customer.first_name,
        lastName: customer.last_name,
        mobile: customer.mobile || '',
        dateOfBirth: customer.date_of_birth,
        profilePicture: customer.profile_image,
        coursePurchaseCount: customer.course_purchase_count || 0,
        classesAllocated: customer.classes_allocated || 0,
        classesUsed: customer.classes_used || 0,
        role: customer.role || 'student',
        isAdmin: req.user.isAdmin || false,
        isImpersonating: req.user.isImpersonating || false,
        impersonatedBy: req.user.impersonatedBy,
        hasMembership,
        hasActiveEnrollments,
        customerType: customer.customer_type || 'student',
        policiesAcceptedAt: customer.policies_accepted_at || null,
        lastLoginAt: customer.last_login_at || null,
        loginCount: customer.login_count || 0,
      }
    };

    setCachedAuth(cacheKey, response);
    res.json(response);
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.json({ user: req.user });
  }
});

// Accept studio policies
app.post('/api/user/accept-policies', authenticateToken, async (req, res) => {
  try {
    const { dbCustomerId } = req.user;

    const { error } = await supabaseDb.supabase
      .from('customers')
      .update({ policies_accepted_at: new Date().toISOString() })
      .eq('id', dbCustomerId);

    if (error) throw error;

    // Invalidate auth cache so next /me call returns updated value
    invalidateAuthCache();

    res.json({ success: true });
  } catch (error) {
    console.error('Error accepting policies:', error);
    res.status(500).json({ error: 'Failed to accept policies' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  // Invalidate all auth caches on logout
  invalidateAuthCache();
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

  const updateData = {
    first_name: firstName,
    last_name: lastName,
    email: email,
    mobile: mobile || null,
    date_of_birth: dateOfBirth || null,
    updated_at: new Date().toISOString()
  };

  if (profilePicture !== undefined) {
    updateData.profile_image = profilePicture || null;
  }

  const { data: updatedCustomer, error } = await supabaseDb.supabase
    .from('customers')
    .update(updateData)
    .eq('id', dbCustomerId)
    .select()
    .single();

  if (error) {
    console.error('[PUT /api/auth/profile] supabase update failed', {
      dbCustomerId,
      email: req.user?.email,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return res.status(500).json({
      error: error.message ? `Failed to update profile: ${error.message}` : 'Failed to update profile',
      code: error.code,
    });
  }

  // Invalidate auth cache since profile data changed
  invalidateAuthCache(`${dbCustomerId}:false`);
  invalidateAuthCache(`${dbCustomerId}:true`);

  res.json({
    user: {
      customerId: req.user.customerId,
      dbCustomerId: dbCustomerId,
      email: updatedCustomer.email,
      firstName: updatedCustomer.first_name,
      lastName: updatedCustomer.last_name,
      mobile: updatedCustomer.mobile || '',
      dateOfBirth: updatedCustomer.date_of_birth,
      profilePicture: updatedCustomer.profile_image
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
  // Invalidate auth cache for the impersonated user and admin
  if (req.user.dbCustomerId) {
    invalidateAuthCache(`${req.user.dbCustomerId}:true`);
    invalidateAuthCache(`${req.user.dbCustomerId}:false`);
  }
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
      const classDate = b.class_instance.class_date.split(/[T ]/)[0];
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
        room,
        status
      )
    `)
    .eq('student_id', dbCustomerId)
    .in('status', ['booked', 'attended', 'completed', 'rescheduled', 'absent', 'forfeited'])
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

  // Helper: get current time in Singapore timezone
  const getSGTNow = () => {
    const now = new Date();
    const sgt = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
    return sgt;
  };

  // Helper: check if a class has ended (accounts for end_time on today's classes)
  const isClassOver = (booking) => {
    const now = getSGTNow();
    const ci = booking.class_instances;
    const classDate = new Date(ci.class_date);
    classDate.setHours(0, 0, 0, 0);
    const todayMidnight = new Date(now);
    todayMidnight.setHours(0, 0, 0, 0);

    if (classDate < todayMidnight) return true;
    if (classDate > todayMidnight) return false;

    // Today's class: check end_time
    if (ci.end_time) {
      const match = ci.end_time.trim().toLowerCase().match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
      if (match) {
        let h = parseInt(match[1], 10);
        const mins = parseInt(match[2] || '0', 10);
        const ampm = match[3];
        if (ampm === 'pm' && h !== 12) h += 12;
        if (ampm === 'am' && h === 12) h = 0;
        return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= mins);
      }
    }
    return false; // Today but no end_time parsed, treat as not over
  };

  // Helper function to determine enrollment status
  const getEnrollmentStatus = (enrollment, bookingsForEnrollment) => {
    if (!bookingsForEnrollment || bookingsForEnrollment.length === 0) {
      return 'pending'; // No bookings yet = pending schedule
    }

    const now = new Date();
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    // Check if all classes are over (including today's finished ones)
    const allOver = bookingsForEnrollment.every(b => isClassOver(b));
    // Don't mark as completed if student still has flex credits to use (e.g. 10-class packages)
    if (allOver && !(enrollment.class_credits_remaining > 0)) return 'completed';
    if (allOver && enrollment.class_credits_remaining > 0) return 'active';

    // Check if all classes are in the future (none started)
    const noneStarted = bookingsForEnrollment.every(b => {
      const d = new Date(b.class_instances.class_date);
      d.setHours(0, 0, 0, 0);
      return d > todayMidnight;
    });

    // Special logic for package courses
    if (enrollment.package_total_courses && enrollment.package_total_courses > 1) {
      if (noneStarted) return 'upcoming';
      const futureCount = bookingsForEnrollment.filter(b => !isClassOver(b)).length;
      if (futureCount >= bookingsForEnrollment.length / 2) return 'upcoming';
    }

    if (noneStarted) return 'upcoming';

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

    const isWTCourse = (enrollment.course_type || '').toLowerCase().includes('wheelthrowing');
    // Check if ALL associated class instances are still in draft (not yet activated)
    // If any class is already active, the course is confirmed and running
    const hasActiveClasses = bookingsForEnrollment.some(b => b.class_instances?.status === 'active');
    const hasDraftClasses = isWTCourse && !hasActiveClasses && (
      (bookingsForEnrollment.length > 0 && bookingsForEnrollment.every(b => b.class_instances?.status === 'draft')) ||
      (bookingsForEnrollment.length === 0 && enrollment.pending_student_count != null && enrollment.pending_student_count < 4)
    );
    const isPendingThreshold = hasDraftClasses;

    const enrollmentWithBookings = {
      ...enrollment,
      bookings: bookingsForEnrollment,
      computedStatus: status,
      pendingThreshold: isPendingThreshold,
      currentStudents: enrollment.pending_student_count || 0,
      requiredStudents: 4,
    };

    // Check if this is part of a package
    if (enrollment.package_total_courses) {
      if (!packageInfo) {
        packageInfo = {
          totalCourses: enrollment.package_total_courses,
          totalClasses: enrollment.package_total_classes,
          coursesRemaining: enrollment.package_courses_remaining || 0,
          currentCourse: enrollment.package_total_courses - (enrollment.package_courses_remaining || 0),
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

  // HB enrollments (for HB booking section and glazing detection)
  const hbEnrollmentsList = enrollments.filter(e =>
    (e.course_type || '').toLowerCase().includes('handbuilding')
  );
  const hbEnrollments = await Promise.all(hbEnrollmentsList.map(async e => {
    const credits = await supabaseDb.getEnrollmentCredits(e.id);
    return {
      id: e.id,
      courseTitle: e.course_title,
      courseType: e.course_type,
      creditsAllocated: credits.allocated,
      creditsUsed: credits.attended,
      creditsRemaining: credits.remaining,
      creditsBooked: credits.booked,
      status: e.status,
      courseStartDate: e.course_start_date,
      courseEndDate: e.course_end_date,
      numberOfWeeks: e.number_of_weeks
    };
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
