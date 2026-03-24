const supabaseDb = require('../utils/supabaseDb');
const { getStudioAccessPasses } = require('../utils/studioAccess');
const { uploadImageToSupabase, deleteImageFromSupabase } = require('../utils/imageUpload');

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler, upload }) {

// ── Events (public: upcoming/active only) ────────────────────────────────────
app.get('/api/events/upcoming', asyncHandler(async (req, res) => {
  const { data, error } = await supabaseDb.supabase
    .from('events')
    .select('id, title, event_type, status, date, end_date, start_time, end_time, location, description, link')
    .in('status', ['upcoming', 'active'])
    .order('date', { ascending: true });
  if (error) throw error;
  res.json({ events: data || [] });
}));

// ── Admin Events ─────────────────────────────────────────────────────────────
app.get('/api/admin/events', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { data, error } = await supabaseDb.supabase
    .from('events')
    .select('*')
    .order('date', { ascending: true, nullsFirst: false });
  if (error) throw error;
  res.json({ events: data || [] });
}));

app.post('/api/admin/events', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { title, event_type, status, date, end_date, start_time, end_time, location, description, link, notes, checklist } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const { data, error } = await supabaseDb.supabase
    .from('events')
    .insert({ title, event_type, status: status || 'draft', date, end_date, start_time, end_time, location, description, link, notes, checklist })
    .select()
    .single();
  if (error) throw error;
  res.json({ event: data });
}));

app.put('/api/admin/events/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { title, event_type, status, date, end_date, start_time, end_time, location, description, link, notes, checklist } = req.body;
  const { data, error } = await supabaseDb.supabase
    .from('events')
    .update({ title, event_type, status, date, end_date, start_time, end_time, location, description, link, notes, checklist, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) throw error;
  res.json({ event: data });
}));

app.delete('/api/admin/events/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { error } = await supabaseDb.supabase
    .from('events')
    .delete()
    .eq('id', req.params.id);
  if (error) throw error;
  res.json({ success: true });
}));

// ── Admin Settings (studio policy) ──────────────────────────────────────────
app.get('/api/settings/studio-policy', asyncHandler(async (req, res) => {
  const { data, error } = await supabaseDb.supabase
    .from('admin_settings')
    .select('setting_value')
    .eq('setting_key', 'studio_policy')
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  res.json({ sections: data ? JSON.parse(data.setting_value) : null });
}));

app.get('/api/admin/settings/studio-policy', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { data, error } = await supabaseDb.supabase
    .from('admin_settings')
    .select('*')
    .eq('setting_key', 'studio_policy')
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  res.json({ sections: data ? JSON.parse(data.setting_value) : null });
}));

app.put('/api/admin/settings/studio-policy', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
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
}));

// ============================================
// INSTRUCTOR PROFILE & COMMUNITY ENDPOINTS
// ============================================

// GET /api/community - Public community directory with role filters
app.get('/api/community', asyncHandler(async (req, res) => {
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
}));

// GET /api/instructors/:id/portfolio - Public instructor profile with portfolio
app.get('/api/instructors/:id/portfolio', asyncHandler(async (req, res) => {
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
}));

// PUT /api/instructors/profile - Instructor updates own profile
app.put('/api/instructors/profile', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { bio } = req.body;

  const { error } = await supabaseDb.supabase
    .from('customers')
    .update({ bio })
    .eq('id', dbCustomerId);

  if (error) throw error;
  res.json({ success: true });
}));

// POST /api/instructors/profile/image - Upload profile image
app.post('/api/instructors/profile/image', authenticateToken, upload.single('image'), asyncHandler(async (req, res) => {
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
}));

// POST /api/instructors/portfolio - Add portfolio item (image or video URL)
app.post('/api/instructors/portfolio', authenticateToken, upload.single('image'), asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { title, description, media_type, video_url } = req.body;

  const isValidVideoUrl = (url) => {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      const trusted = ['youtube.com', 'www.youtube.com', 'youtu.be', 'vimeo.com', 'www.vimeo.com'];
      return parsed.protocol === 'https:' && trusted.some(d => parsed.hostname === d);
    } catch { return false; }
  };
  let media_url = isValidVideoUrl(video_url) ? video_url : null;
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
}));

// DELETE /api/instructors/portfolio/:id - Remove portfolio item
app.delete('/api/instructors/portfolio/:id', authenticateToken, asyncHandler(async (req, res) => {
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
}));

// GET /api/instructor/dashboard - Instructor's own dashboard data
app.get('/api/instructor/dashboard', authenticateToken, asyncHandler(async (req, res) => {
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
}));

// POST /api/admin/instructors - Create a new instructor
app.post('/api/admin/instructors', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
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
}));

// GET /api/admin/instructors/:id/teaching - Teaching data filtered from /api/admin/classes
// Reuses the exact same data source (class_instances + bookings) filtered by instructor name
app.get('/api/admin/instructors/:id/teaching', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
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
}));

// POST /api/admin/instructors/:id/profile-image - Admin uploads profile image for instructor
app.post('/api/admin/instructors/:id/profile-image', authenticateToken, requireAdmin, upload.single('image'), asyncHandler(async (req, res) => {
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
}));

// PUT /api/admin/customers/:id/role - Admin sets user role
app.put('/api/admin/customers/:id/role', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
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
}));

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
app.get('/api/studio-access/availability', authenticateToken, asyncHandler(async (req, res) => {
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
}));

// ── Student: My bookings ────────────────────────────────────────────────────
app.get('/api/studio-access/my-bookings', authenticateToken, asyncHandler(async (req, res) => {
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
}));

// ── Student: Book studio access ─────────────────────────────────────────────
app.post('/api/studio-access/book', authenticateToken, asyncHandler(async (req, res) => {
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
}));

// ── Student: Cancel own booking ─────────────────────────────────────────────
app.put('/api/studio-access/bookings/:id/cancel', authenticateToken, asyncHandler(async (req, res) => {
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
}));

// ── Admin: List bookings ────────────────────────────────────────────────────
app.get('/api/admin/studio-access/bookings', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
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
}));

// ── Admin: Student studio access history ────────────────────────────────────
app.get('/api/admin/students/:studentId/studio-access', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
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
}));

// ── Admin: Create booking on behalf of student ──────────────────────────────
app.post('/api/admin/studio-access/bookings', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
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
}));

// ── Admin: Confirm pending booking ──────────────────────────────────────────
app.put('/api/admin/studio-access/bookings/:id/confirm', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
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
}));

// ── Admin: Mark as attended (settles actual hours + amount) ─────────────────
app.put('/api/admin/studio-access/bookings/:id/attended', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
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
}));

// ── Admin: Cancel booking ───────────────────────────────────────────────────
app.put('/api/admin/studio-access/bookings/:id/cancel', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
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
}));

// ── Admin: Hard delete booking ──────────────────────────────────────────────
app.delete('/api/admin/studio-access/bookings/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });

  const { error } = await supabaseDb.supabase
    .from('studio_access_bookings')
    .delete()
    .eq('id', req.params.id);

  if (error) throw error;
  res.json({ success: true });
}));
};
