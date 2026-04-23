/**
 * Supabase Database Adapter
 *
 * Bypasses Prisma connection issues by using direct Supabase SQL queries
 */

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Find customer by Shopify ID
 */
async function findCustomerByShopifyId(shopifyCustomerId) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('shopify_customer_id', shopifyCustomerId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
    throw error;
  }

  return data;
}

/**
 * Find customer by email
 */
async function findCustomerByEmail(email) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('email', email)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data;
}

/**
 * Create customer
 */
async function createCustomer(customerData) {
  const { data, error } = await supabase
    .from('customers')
    .insert([{
      shopify_customer_id: customerData.shopifyCustomerId,
      email: customerData.email,
      first_name: customerData.firstName,
      last_name: customerData.lastName,
      customer_type: customerData.customerType || 'student',
      classes_allocated: customerData.classesAllocated || 6,
      classes_used: customerData.classesUsed || 0,
      classes_forfeited: customerData.classesForfeited || 0,
      course_purchase_date: customerData.coursePurchaseDate || null,
      course_expiry_date: customerData.courseExpiryDate || null,
      course_purchase_count: customerData.coursePurchaseCount || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Update customer
 */
async function updateCustomer(id, updates) {
  const { data, error } = await supabase
    .from('customers')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Sync customer from Shopify (create or update)
 */
async function syncCustomer(shopifyCustomer, shopifyCustomerId, classStartDate = null, classEndDate = null, coursePurchaseCount = 0) {
  try {
    // Check if customer exists
    let existingCustomer = await findCustomerByShopifyId(shopifyCustomerId);

    // Format dates for database
    const purchaseDate = classStartDate ? classStartDate.toISOString().split('T')[0] : null;
    const expiryDate = classEndDate ? classEndDate.toISOString().split('T')[0] : null;

    if (existingCustomer) {
      // Update existing customer — preserve manual edits
      // name_locked: permanent flag set when admin manually edits name — survives syncs
      // Fallback: detect manual edit via updated_at > last_synced_at (one-time protection)
      const nameLocked = existingCustomer.name_locked === true;
      const wasManuallyEdited = !nameLocked && existingCustomer.updated_at && existingCustomer.last_synced_at &&
        new Date(existingCustomer.updated_at) > new Date(existingCustomer.last_synced_at);

      const updates = {
        email: shopifyCustomer.email,
        last_synced_at: new Date().toISOString()
      };

      if (!nameLocked && !wasManuallyEdited) {
        // No manual edits and not locked — safe to overwrite from Shopify
        updates.first_name = shopifyCustomer.firstName;
        updates.last_name = shopifyCustomer.lastName;
      }
      // else: name is locked or manually edited — preserve name

      // Update course dates if we have them
      if (purchaseDate) {
        updates.course_purchase_date = purchaseDate;
      }
      if (expiryDate) {
        updates.course_expiry_date = expiryDate;
      }
      // Update course purchase count — use max of Shopify count and actual non-cancelled enrollment rows
      if (coursePurchaseCount > 0) {
        // Count actual enrollments to include manual ones (exclude cancelled)
        const { data: enrollments } = await supabase
          .from('course_enrollments')
          .select('id')
          .eq('student_id', existingCustomer.id)
          .neq('status', 'cancelled');
        const enrollmentCount = (enrollments || []).length;
        updates.course_purchase_count = Math.max(coursePurchaseCount, enrollmentCount);
      }

      // Use direct update (NOT updateCustomer) to avoid bumping updated_at
      // This preserves the manual edit detection for next sync
      const { data: updated, error: updateErr } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', existingCustomer.id)
        .select()
        .single();
      if (updateErr) throw updateErr;
      return updated;
    } else {
      // Create new customer
      const created = await createCustomer({
        shopifyCustomerId: shopifyCustomerId,
        email: shopifyCustomer.email,
        firstName: shopifyCustomer.firstName,
        lastName: shopifyCustomer.lastName,
        customerType: 'student',
        coursePurchaseDate: purchaseDate,
        courseExpiryDate: expiryDate,
        coursePurchaseCount: coursePurchaseCount
      });
      return created;
    }
  } catch (error) {
    console.error('Error syncing customer:', error);
    throw error;
  }
}

/**
 * Get all customers
 */
async function getAllCustomers() {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('first_name', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Get public pottery pieces
 */
async function getPublicPotteryPieces() {
  const { data, error } = await supabase
    .from('pottery_pieces')
    .select(`
      *,
      customer:customers!pottery_pieces_customer_id_fkey (
        first_name,
        last_name
      )
    `)
    .eq('is_public', true)
    .order('featured', { ascending: false })
    .order('date_completed', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Get pottery pieces for a customer
 */
async function getPotteryPiecesByCustomerId(customerId) {
  const { data, error } = await supabase
    .from('pottery_pieces')
    .select('*')
    .eq('customer_id', customerId)
    .order('date_completed', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Get pottery piece by ID
 */
async function getPotteryPieceById(pieceId) {
  const { data, error } = await supabase
    .from('pottery_pieces')
    .select('*')
    .eq('id', pieceId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data;
}

/**
 * Get all pottery pieces (admin view)
 */
async function getAllPotteryPieces() {
  const { data, error } = await supabase
    .from('pottery_pieces')
    .select(`
      *,
      customer:customers!pottery_pieces_customer_id_fkey (
        id,
        first_name,
        last_name,
        email,
        initials
      )
    `)
    .order('date_completed', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Get available classes (all classes including past ones for course viewing)
 */
async function getAvailableClasses() {
  const { data: classes, error } = await supabase
    .from('class_instances')
    .select('*')
    .eq('status', 'active')
    .gte('class_date', '2026-01-01')
    .order('class_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(1000);

  if (error) {
    throw error;
  }

  // If no classes, return empty array quickly
  if (!classes || classes.length === 0) {
    return [];
  }

  // Get waitlist AND makeup booking counts for each class in ONE Promise.all loop
  const classesWithCounts = await Promise.all(
    classes.map(async (classInstance) => {
      // Fetch waitlist count, makeup count, and actual booking count in parallel
      const [waitlistResult, makeupResult, bookingCountResult] = await Promise.all([
        supabase
          .from('waitlist')
          .select('*', { count: 'exact', head: true })
          .eq('class_instance_id', classInstance.id)
          .eq('claimed', false),
        supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('class_instance_id', classInstance.id)
          .eq('booking_type', 'makeup')
          .eq('status', 'booked'),
        supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('class_instance_id', classInstance.id)
          .in('status', ['booked', 'attended'])
      ]);

      const waitlistCount = waitlistResult.count || 0;
      const makeupCount = makeupResult.count || 0;
      const actualEnrollment = bookingCountResult.count || 0;

      // Regular capacity is 8, total capacity (with makeup spots) is stored in max_capacity (10)
      const REGULAR_CAPACITY = 8;
      const totalCapacity = classInstance.max_capacity || 10;

      // Convert snake_case to camelCase for frontend
      return {
        id: classInstance.id,
        templateId: classInstance.template_id,
        classDate: classInstance.class_date,
        startTime: classInstance.start_time,
        endTime: classInstance.end_time,
        classType: classInstance.class_type,
        instructor: classInstance.instructor,
        room: classInstance.room,
        maxCapacity: totalCapacity,
        regularCapacity: REGULAR_CAPACITY,
        currentEnrollment: actualEnrollment,
        status: classInstance.status,
        cancellationReason: classInstance.cancellation_reason,
        createdAt: classInstance.created_at,
        updatedAt: classInstance.updated_at,
        waitlistCount: waitlistCount,
        makeupBookings: makeupCount,
        makeupSpotsAvailable: 2 - makeupCount,
        spotsAvailable: totalCapacity - actualEnrollment,
        regularSpotsAvailable: REGULAR_CAPACITY - actualEnrollment,
        isFull: actualEnrollment >= REGULAR_CAPACITY,  // Full for regular booking at 8
        isCompletelyFull: actualEnrollment >= totalCapacity  // Completely full at 10
      };
    })
  );

  return classesWithCounts;
}

/**
 * Create pottery piece
 */
async function createPotteryPiece(pieceData) {
  const { data, error } = await supabase
    .from('pottery_pieces')
    .insert([{
      customer_id: pieceData.customerId,
      title: pieceData.title,
      date_completed: pieceData.dateCompleted,
      notes: pieceData.notes,
      clay_type: pieceData.clayType,
      glazes: pieceData.glazes,
      original_weight: pieceData.originalWeight,
      final_weight: pieceData.finalWeight,
      height: pieceData.height,
      width: pieceData.width,
      length: pieceData.length,
      images: pieceData.images,
      tags: pieceData.tags,
      is_public: pieceData.isPublic,
      featured: pieceData.featured
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update pottery piece
 */
async function updatePotteryPiece(pieceId, pieceData) {
  const updateData = {
    updated_at: new Date().toISOString()
  };

  if (pieceData.title !== undefined) updateData.title = pieceData.title;
  if (pieceData.dateCompleted !== undefined) updateData.date_completed = pieceData.dateCompleted;
  if (pieceData.notes !== undefined) updateData.notes = pieceData.notes;
  if (pieceData.clayType !== undefined) updateData.clay_type = pieceData.clayType;
  if (pieceData.glazes !== undefined) updateData.glazes = pieceData.glazes;
  if (pieceData.originalWeight !== undefined) updateData.original_weight = pieceData.originalWeight;
  if (pieceData.finalWeight !== undefined) updateData.final_weight = pieceData.finalWeight;
  if (pieceData.height !== undefined) updateData.height = pieceData.height;
  if (pieceData.width !== undefined) updateData.width = pieceData.width;
  if (pieceData.length !== undefined) updateData.length = pieceData.length;
  if (pieceData.images !== undefined) updateData.images = pieceData.images;
  if (pieceData.tags !== undefined) updateData.tags = pieceData.tags;
  if (pieceData.isPublic !== undefined) updateData.is_public = pieceData.isPublic;
  if (pieceData.featured !== undefined) updateData.featured = pieceData.featured;
  if (pieceData.courseEnrollmentId !== undefined) updateData.course_enrollment_id = pieceData.courseEnrollmentId;

  const { data, error } = await supabase
    .from('pottery_pieces')
    .update(updateData)
    .eq('id', pieceId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete pottery piece
 */
async function deletePotteryPiece(pieceId) {
  const { error } = await supabase
    .from('pottery_pieces')
    .delete()
    .eq('id', pieceId);

  if (error) throw error;
  return { success: true };
}

/**
 * Get clay types
 */
async function getClayTypes() {
  const { data, error } = await supabase
    .from('clay_types')
    .select('*')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get glazes
 */
async function getGlazes(includeInactive = false) {
  let query = supabase
    .from('glazes')
    .select('*')
    .order('name', { ascending: true });

  if (!includeInactive) {
    query = query.eq('active', true);
  }

  const { data, error } = await query;
  if (error) throw error;
  // Map color_hex to color for frontend compatibility
  return (data || []).map(g => ({ ...g, color: g.color_hex }));
}

/**
 * Create clay type
 */
async function createClayType(clayTypeData) {
  const { data, error } = await supabase
    .from('clay_types')
    .insert([{
      name: clayTypeData.name,
      description: clayTypeData.description,
      active: clayTypeData.active !== undefined ? clayTypeData.active : true
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update clay type
 */
async function updateClayType(clayTypeId, updates) {
  const dbUpdates = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.active !== undefined) dbUpdates.active = updates.active;

  const { data, error } = await supabase
    .from('clay_types')
    .update(dbUpdates)
    .eq('id', clayTypeId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete clay type
 */
async function deleteClayType(clayTypeId) {
  const { error } = await supabase
    .from('clay_types')
    .delete()
    .eq('id', clayTypeId);

  if (error) throw error;
  return { success: true };
}

/**
 * Create glaze
 */
async function createGlaze(glazeData) {
  const { data, error } = await supabase
    .from('glazes')
    .insert([{
      name: glazeData.name,
      description: glazeData.description,
      color_hex: glazeData.color || null,
      cone: glazeData.cone,
      active: glazeData.active !== undefined ? glazeData.active : true,
      glaze_type: glazeData.glaze_type || 'glaze',
      stock_status: glazeData.stock_status || 'in_stock',
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update glaze
 */
async function updateGlaze(glazeId, updates) {
  const dbUpdates = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.color !== undefined) dbUpdates.color_hex = updates.color;
  if (updates.cone !== undefined) dbUpdates.cone = updates.cone;
  if (updates.active !== undefined) dbUpdates.active = updates.active;
  if (updates.glaze_type !== undefined) dbUpdates.glaze_type = updates.glaze_type;
  if (updates.stock_status !== undefined) dbUpdates.stock_status = updates.stock_status;

  const { data, error } = await supabase
    .from('glazes')
    .update(dbUpdates)
    .eq('id', glazeId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete glaze
 */
async function deleteGlaze(glazeId) {
  const { error } = await supabase
    .from('glazes')
    .delete()
    .eq('id', glazeId);

  if (error) throw error;
  return { success: true };
}

/**
 * Get bookings for a class
 */
async function getClassBookings(classInstanceId) {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      student:customers!bookings_student_id_fkey (
        id,
        first_name,
        last_name,
        email
      )
    `)
    .eq('class_instance_id', classInstanceId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Format for frontend
  return (data || []).map(booking => ({
    id: booking.id,
    status: booking.status,
    advanceNoticeGiven: booking.advance_notice_given,
    attended: booking.attended,
    attendanceMarkedAt: booking.attendance_marked_at,
    attendanceNotes: booking.attendance_notes,
    student: {
      id: booking.student.id,
      name: `${booking.student.first_name || ''} ${booking.student.last_name || ''}`.trim(),
      email: booking.student.email
    }
  }));
}

/**
 * Get a single booking by ID
 */
async function getBookingById(bookingId) {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      student:customers!bookings_student_id_fkey (
        id,
        classes_forfeited
      )
    `)
    .eq('id', bookingId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Update booking
 */
async function updateBooking(bookingId, updates) {
  const dbUpdates = {};
  if (updates.attended !== undefined) dbUpdates.attended = updates.attended;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.markedByAdminId !== undefined) dbUpdates.marked_by_admin_id = updates.markedByAdminId;
  if (updates.attendanceMarkedAt !== undefined) dbUpdates.attendance_marked_at = updates.attendanceMarkedAt;
  if (updates.attendanceNotes !== undefined) dbUpdates.attendance_notes = updates.attendanceNotes;
  if (updates.advanceNoticeGiven !== undefined) dbUpdates.advance_notice_given = updates.advanceNoticeGiven;

  const { data, error } = await supabase
    .from('bookings')
    .update(dbUpdates)
    .eq('id', bookingId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Increment customer's forfeited classes count
 */
async function incrementClassesForfeited(customerId) {
  const { data: customer } = await supabase
    .from('customers')
    .select('classes_forfeited')
    .eq('id', customerId)
    .single();

  const { data, error } = await supabase
    .from('customers')
    .update({ classes_forfeited: (customer?.classes_forfeited || 0) + 1 })
    .eq('id', customerId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get customer by ID
 */
async function getCustomerById(customerId) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get attendance history for a student
 */
async function getStudentAttendance(studentId) {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      class_instance:class_instances!bookings_class_instance_id_fkey (
        class_date,
        start_time,
        end_time,
        class_type,
        instructor
      )
    `)
    .eq('student_id', studentId)
    .in('status', ['completed', 'forfeited'])
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get student's bookings for their current active courses only
 * Shows ALL bookings (including past attended classes) from active enrollments
 * Filters out bookings from old/completed courses
 */
async function getStudentBookings(studentId) {
  // Get bookings with class instance and enrollment details
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      class_instance:class_instances!bookings_class_instance_id_fkey (*),
      course_enrollment:course_enrollments!bookings_course_enrollment_id_fkey (
        status,
        course_start_date,
        course_end_date
      )
    `)
    .eq('student_id', studentId)
    .order('class_instance(class_date)', { ascending: true });

  if (error) throw error;

  // Filter to show bookings from ONLY active or paused enrollments
  // This ensures students only see their current course, not completed past courses
  // Completed courses are shown in Course History instead
  // Check which enrollments have at least one active class (course is confirmed/running)
  const enrollmentHasActiveClass = {};
  (data || []).forEach(booking => {
    if (booking.course_enrollment_id && booking.class_instance?.status === 'active') {
      enrollmentHasActiveClass[booking.course_enrollment_id] = true;
    }
  });

  const activeBookings = (data || []).filter(booking => {
    // Exclude bookings for draft class instances ONLY if the entire course is still draft
    // If other classes in the same enrollment are active, the course is running
    if (booking.class_instance?.status === 'draft' && !enrollmentHasActiveClass[booking.course_enrollment_id]) return false;

    // Include bookings without an enrollment (legacy data/standalone bookings)
    if (!booking.course_enrollment) return true;

    // Only include bookings from active or paused enrollments
    // Do NOT include completed enrollments
    return ['active', 'paused'].includes(booking.course_enrollment.status);
  });

  return activeBookings;
}

/**
 * Get class instance by ID
 */
async function getClassInstanceById(classInstanceId) {
  const { data, error } = await supabase
    .from('class_instances')
    .select('*')
    .eq('id', classInstanceId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Create booking
 */
async function createBooking(bookingData) {
  // Hard cap: never exceed max_capacity (default 10) for any class
  if (bookingData.classInstanceId) {
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('class_instance_id', bookingData.classInstanceId)
      .eq('status', 'booked');

    const { data: cls } = await supabase
      .from('class_instances')
      .select('max_capacity')
      .eq('id', bookingData.classInstanceId)
      .single();

    const cap = cls?.max_capacity || 10;
    if (count >= cap) {
      const err = new Error(`Class is full (${count}/${cap})`);
      err.code = 'CLASS_FULL';
      throw err;
    }
  }

  const insertData = {
    student_id: bookingData.studentId,
    class_instance_id: bookingData.classInstanceId,
    status: bookingData.status || 'booked',
    booking_type: bookingData.bookingType || 'regular',
    course_enrollment_id: bookingData.courseEnrollmentId || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Add optional reschedule fields if provided
  if (bookingData.isGlazingReschedule !== undefined) {
    insertData.is_glazing_reschedule = bookingData.isGlazingReschedule;
  }
  if (bookingData.originalClassInstanceId !== undefined) {
    insertData.original_class_instance_id = bookingData.originalClassInstanceId;
  }
  if (bookingData.rescheduledFromDate !== undefined) {
    insertData.rescheduled_from_date = bookingData.rescheduledFromDate;
  }
  if (bookingData.rescheduleFeePaid !== undefined) {
    insertData.reschedule_fee_paid = bookingData.rescheduleFeePaid;
  }
  if (bookingData.rescheduleSource !== undefined) {
    insertData.reschedule_source = bookingData.rescheduleSource;
  }

  const { data, error} = await supabase
    .from('bookings')
    .insert([insertData])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update class instance enrollment
 */
async function updateClassEnrollment(classInstanceId, increment) {
  const classInstance = await getClassInstanceById(classInstanceId);
  const newEnrollment = (classInstance.current_enrollment || 0) + increment;

  const { data, error } = await supabase
    .from('class_instances')
    .update({ current_enrollment: newEnrollment })
    .eq('id', classInstanceId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Find existing booking
 */
async function findBooking(studentId, classInstanceId, status = 'booked') {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('student_id', studentId)
    .eq('class_instance_id', classInstanceId)
    .eq('status', status)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Count make-up bookings for a class
 */
async function getMakeupBookingCount(classInstanceId) {
  const { count, error } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('class_instance_id', classInstanceId)
    .eq('booking_type', 'makeup')
    .eq('status', 'booked');

  if (error) throw error;
  return count || 0;
}

/**
 * Get waitlist for a class
 */
async function getClassWaitlist(classInstanceId) {
  const { data, error } = await supabase
    .from('waitlist')
    .select(`
      *,
      student:customers!waitlist_student_id_fkey (
        id,
        first_name,
        last_name,
        email
      )
    `)
    .eq('class_instance_id', classInstanceId)
    .eq('claimed', false)
    .order('position', { ascending: true });

  if (error) throw error;

  return (data || []).map(entry => ({
    id: entry.id,
    position: entry.position,
    joinedAt: entry.joined_at,
    spotOfferedAt: entry.spot_offered_at,
    expiresAt: entry.expires_at,
    student: {
      id: entry.student.id,
      name: `${entry.student.first_name || ''} ${entry.student.last_name || ''}`.trim(),
      email: entry.student.email
    }
  }));
}

/**
 * Find waitlist entry
 */
async function findWaitlistEntry(studentId, classInstanceId) {
  const { data, error } = await supabase
    .from('waitlist')
    .select('*')
    .eq('student_id', studentId)
    .eq('class_instance_id', classInstanceId)
    .eq('claimed', false)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get max waitlist position for a class
 */
async function getMaxWaitlistPosition(classInstanceId) {
  const { data, error } = await supabase
    .from('waitlist')
    .select('position')
    .eq('class_instance_id', classInstanceId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  return data?.position || 0;
}

/**
 * Create waitlist entry
 */
async function createWaitlistEntry(entryData) {
  const { data, error } = await supabase
    .from('waitlist')
    .insert([{
      student_id: entryData.studentId,
      class_instance_id: entryData.classInstanceId,
      position: entryData.position,
      joined_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete waitlist entry
 */
async function deleteWaitlistEntry(waitlistId) {
  const { error } = await supabase
    .from('waitlist')
    .delete()
    .eq('id', waitlistId);

  if (error) throw error;
}

/**
 * Update waitlist positions after removal
 */
async function updateWaitlistPositions(classInstanceId, removedPosition) {
  // Get all entries after the removed position
  const { data: entries } = await supabase
    .from('waitlist')
    .select('id, position')
    .eq('class_instance_id', classInstanceId)
    .eq('claimed', false)
    .gt('position', removedPosition);

  // Update each one
  if (entries && entries.length > 0) {
    for (const entry of entries) {
      await supabase
        .from('waitlist')
        .update({ position: entry.position - 1 })
        .eq('id', entry.id);
    }
  }
}

/**
 * Get student's waitlist entries
 */
async function getStudentWaitlistEntries(studentId) {
  const { data, error } = await supabase
    .from('waitlist')
    .select(`
      *,
      class_instance:class_instances!waitlist_class_instance_id_fkey (*)
    `)
    .eq('student_id', studentId)
    .eq('claimed', false)
    .order('joined_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get next person in waitlist
 */
async function getNextInWaitlist(classInstanceId) {
  const { data, error } = await supabase
    .from('waitlist')
    .select(`
      *,
      student:customers!waitlist_student_id_fkey (
        first_name,
        last_name,
        email
      ),
      class_instance:class_instances!waitlist_class_instance_id_fkey (*)
    `)
    .eq('class_instance_id', classInstanceId)
    .eq('claimed', false)
    .is('spot_offered_at', null)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Update waitlist entry
 */
async function updateWaitlistEntry(waitlistId, updates) {
  const dbUpdates = {};
  if (updates.spotOfferedAt !== undefined) dbUpdates.spot_offered_at = updates.spotOfferedAt;
  if (updates.notificationSentAt !== undefined) dbUpdates.notification_sent_at = updates.notificationSentAt;
  if (updates.expiresAt !== undefined) dbUpdates.expires_at = updates.expiresAt;
  if (updates.claimed !== undefined) dbUpdates.claimed = updates.claimed;
  if (updates.claimedAt !== undefined) dbUpdates.claimed_at = updates.claimedAt;

  const { data, error } = await supabase
    .from('waitlist')
    .update(dbUpdates)
    .eq('id', waitlistId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get waitlist entry by ID
 */
async function getWaitlistEntryById(waitlistId) {
  const { data, error } = await supabase
    .from('waitlist')
    .select(`
      *,
      class_instance:class_instances!waitlist_class_instance_id_fkey (*)
    `)
    .eq('id', waitlistId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get expired waitlist offers
 */
async function getExpiredWaitlistOffers() {
  const { data, error } = await supabase
    .from('waitlist')
    .select(`
      *,
      student:customers!waitlist_student_id_fkey (
        first_name,
        last_name,
        email
      ),
      class_instance:class_instances!waitlist_class_instance_id_fkey (*)
    `)
    .eq('claimed', false)
    .not('spot_offered_at', 'is', null)
    .lte('expires_at', new Date().toISOString());

  if (error) throw error;
  return data || [];
}

/**
 * Get active membership for a customer
 */
async function getActiveMembership(customerId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('*')
    .eq('customer_id', customerId)
    .eq('status', 'active')
    .gte('end_date', new Date().toISOString().split('T')[0])
    .order('end_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get all memberships for a customer
 */
async function getCustomerMemberships(customerId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Create membership
 */
async function createMembership(membershipData) {
  const { data, error } = await supabase
    .from('memberships')
    .insert([{
      customer_id: membershipData.customerId,
      membership_type: membershipData.membershipType,
      status: membershipData.status || 'active',
      start_date: membershipData.startDate,
      end_date: membershipData.endDate,
      shopify_subscription_id: membershipData.shopifySubscriptionId || null,
      perks: membershipData.perks || null
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get all memberships (admin)
 */
async function getAllMemberships() {
  const { data, error } = await supabase
    .from('memberships')
    .select(`
      *,
      customer:customers!memberships_customer_id_fkey (
        id,
        first_name,
        last_name,
        email
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Update membership
 */
async function updateMembership(membershipId, updates) {
  const dbUpdates = {};
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.membershipType !== undefined) dbUpdates.membership_type = updates.membershipType;
  if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
  if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
  if (updates.perks !== undefined) dbUpdates.perks = updates.perks;

  const { data, error } = await supabase
    .from('memberships')
    .update(dbUpdates)
    .eq('id', membershipId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete membership
 */
async function deleteMembership(membershipId) {
  const { error } = await supabase
    .from('memberships')
    .delete()
    .eq('id', membershipId);

  if (error) throw error;
  return { success: true };
}

/**
 * Cancel membership
 */
async function cancelMembership(membershipId) {
  return updateMembership(membershipId, { status: 'cancelled' });
}

/**
 * Check if customer has active membership
 */
async function hasActiveMembership(customerId) {
  const membership = await getActiveMembership(customerId);
  return !!membership;
}

/**
 * Course Enrollment Functions (for automatic booking creation)
 */

/**
 * Create course enrollment
 */
async function createCourseEnrollment(enrollmentData) {
  const { data, error } = await supabase
    .from('course_enrollments')
    .insert([{
      student_id: enrollmentData.studentId,
      shopify_order_id: enrollmentData.shopifyOrderId,
      shopify_line_item_id: enrollmentData.shopifyLineItemId,
      course_title: enrollmentData.courseTitle,
      course_variant_title: enrollmentData.courseVariantTitle,
      course_type: enrollmentData.courseType,
      schedule_pattern: enrollmentData.schedulePattern,
      number_of_weeks: enrollmentData.numberOfWeeks,
      course_start_date: enrollmentData.courseStartDate,
      course_end_date: enrollmentData.courseEndDate,
      class_time: enrollmentData.classTime,
      instructor: enrollmentData.instructor,
      room: enrollmentData.room,
      status: enrollmentData.status || 'pending',
      ...(enrollmentData.packageTotalCourses && { package_total_courses: enrollmentData.packageTotalCourses }),
      ...(enrollmentData.packageTotalClasses && { package_total_classes: enrollmentData.packageTotalClasses }),
      ...(enrollmentData.packageCoursesRemaining != null && { package_courses_remaining: enrollmentData.packageCoursesRemaining })
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Find course enrollments by cohort (same course type, start date, schedule, and time)
 */
async function findCohortEnrollments(courseType, startDate, schedulePattern, classTime) {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('course_type', courseType)
    .eq('course_start_date', startDate)
    .eq('schedule_pattern', schedulePattern)
    .eq('class_time', classTime)
    .eq('status', 'active');

  if (error) throw error;
  return data || [];
}

/**
 * Update course enrollment status
 */
async function updateCourseEnrollment(enrollmentId, updates) {
  const dbUpdates = {
    updated_at: new Date().toISOString()
  };

  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.pendingStudentCount !== undefined) dbUpdates.pending_student_count = updates.pendingStudentCount;
  if (updates.thresholdMetAt !== undefined) dbUpdates.threshold_met_at = updates.thresholdMetAt;
  if (updates.bookingsCreatedAt !== undefined) dbUpdates.bookings_created_at = updates.bookingsCreatedAt;
  if (updates.course_identifier !== undefined) dbUpdates.course_identifier = updates.course_identifier;

  // HB credit fields
  if (updates.class_credits_allocated !== undefined) dbUpdates.class_credits_allocated = updates.class_credits_allocated;
  if (updates.class_credits_used !== undefined) dbUpdates.class_credits_used = updates.class_credits_used;
  if (updates.class_credits_remaining !== undefined) dbUpdates.class_credits_remaining = updates.class_credits_remaining;
  if (updates.glazing_class_used !== undefined) dbUpdates.glazing_class_used = updates.glazing_class_used;

  // Flexible credits (10-class packages)
  if (updates.flexible_credits_allocated !== undefined) dbUpdates.flexible_credits_allocated = updates.flexible_credits_allocated;
  if (updates.flexible_credits_used !== undefined) dbUpdates.flexible_credits_used = updates.flexible_credits_used;
  if (updates.flexible_credits_remaining !== undefined) dbUpdates.flexible_credits_remaining = updates.flexible_credits_remaining;

  // Package fields
  if (updates.packageTotalCourses !== undefined) dbUpdates.package_total_courses = updates.packageTotalCourses;
  if (updates.packageTotalClasses !== undefined) dbUpdates.package_total_classes = updates.packageTotalClasses;
  if (updates.packageCoursesRemaining !== undefined) dbUpdates.package_courses_remaining = updates.packageCoursesRemaining;

  const { data, error } = await supabase
    .from('course_enrollments')
    .update(dbUpdates)
    .eq('id', enrollmentId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Create multiple class instances
 */
async function createClassInstances(classInstancesArray) {
  const { data, error} = await supabase
    .from('class_instances')
    .insert(classInstancesArray)
    .select();

  if (error) throw error;
  return data;
}

/**
 * Create multiple bookings
 */
async function createMultipleBookings(bookingsArray) {
  // Add timestamps to all bookings
  const now = new Date().toISOString();
  const bookingsWithTimestamps = bookingsArray.map(booking => ({
    ...booking,
    created_at: now,
    updated_at: now
  }));

  const { data, error } = await supabase
    .from('bookings')
    .insert(bookingsWithTimestamps)
    .select();

  if (error) throw error;
  return data;
}

/**
 * Sync customer_type based on active memberships and enrollments
 * Sets: 'member' (membership only), 'student & member' (both), 'student' (no membership)
 */
async function syncCustomerTypeFromMemberships() {
  const today = new Date().toISOString().split('T')[0];
  let updated = 0;

  // Get all active memberships (status=active, end_date >= today)
  const { data: activeMemberships, error: memErr } = await supabase
    .from('memberships')
    .select('customer_id')
    .eq('status', 'active')
    .gte('end_date', today);

  if (memErr) {
    console.error('Error fetching active memberships:', memErr);
    return 0;
  }

  const memberCustomerIds = [...new Set((activeMemberships || []).map(m => m.customer_id))];

  if (memberCustomerIds.length > 0) {
    // Check which members also have active course enrollments
    const { data: activeEnrollments } = await supabase
      .from('course_enrollments')
      .select('student_id')
      .in('student_id', memberCustomerIds)
      .in('status', ['active', 'pending']);

    const enrolledIds = new Set((activeEnrollments || []).map(e => e.student_id));

    for (const customerId of memberCustomerIds) {
      const newType = enrolledIds.has(customerId) ? 'student & member' : 'member';
      // Use direct update to avoid bumping updated_at
      const { error: upErr } = await supabase
        .from('customers')
        .update({ customer_type: newType })
        .eq('id', customerId)
        .neq('customer_type', newType);
      if (!upErr) updated++;
    }
  }

  // Reset expired members back to 'student' (those with member/student & member but no active membership)
  const { data: memberCustomers } = await supabase
    .from('customers')
    .select('id')
    .in('customer_type', ['member', 'student & member']);

  if (memberCustomers && memberCustomers.length > 0) {
    const expiredIds = (memberCustomers || [])
      .filter(c => !memberCustomerIds.includes(c.id))
      .map(c => c.id);

    if (expiredIds.length > 0) {
      const { error: resetErr } = await supabase
        .from('customers')
        .update({ customer_type: 'student' })
        .in('id', expiredIds);
      if (!resetErr) updated += expiredIds.length;
    }
  }

  console.log(`🏷️  Customer type sync: ${memberCustomerIds.length} active members, ${updated} customers updated`);
  return updated;
}

/**
 * Update customer_type for a single customer after membership CRUD
 */
async function updateSingleCustomerType(customerId) {
  const today = new Date().toISOString().split('T')[0];

  const { data: activeMembership } = await supabase
    .from('memberships')
    .select('id')
    .eq('customer_id', customerId)
    .eq('status', 'active')
    .gte('end_date', today)
    .limit(1)
    .maybeSingle();

  if (activeMembership) {
    // Has active membership — check enrollments
    const { data: activeEnrollment } = await supabase
      .from('course_enrollments')
      .select('id')
      .eq('student_id', customerId)
      .in('status', ['active', 'pending'])
      .limit(1)
      .maybeSingle();

    const newType = activeEnrollment ? 'student & member' : 'member';
    await supabase
      .from('customers')
      .update({ customer_type: newType })
      .eq('id', customerId);
  } else {
    // No active membership — reset to student
    await supabase
      .from('customers')
      .update({ customer_type: 'student' })
      .eq('id', customerId)
      .in('customer_type', ['member', 'student & member']);
  }
}

// ==================== Piece Batches ====================

async function createPieceBatch({ courseEnrollmentId, customerId, pieceCount, initials, notes, photoUrls }) {
  const { data, error } = await supabase
    .from('piece_batches')
    .insert({
      course_enrollment_id: courseEnrollmentId || null,
      customer_id: customerId,
      piece_count: pieceCount,
      initials: initials,
      notes: notes || null,
      photo_urls: photoUrls || [],
      status: 'logged',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getPieceBatchesByCustomerId(customerId) {
  const { data, error } = await supabase
    .from('piece_batches')
    .select('*, course_enrollments(course_type, course_title, course_variant_title, course_identifier)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function getPieceBatchById(batchId) {
  const { data, error } = await supabase
    .from('piece_batches')
    .select('*, customers(id, first_name, last_name, email), course_enrollments(course_type, course_title, course_variant_title, course_identifier)')
    .eq('id', batchId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function getAllActivePieceBatches() {
  const { data, error } = await supabase
    .from('piece_batches')
    .select('*, customers(id, first_name, last_name, email), course_enrollments(course_type, course_title, course_variant_title, course_identifier)')
    .not('status', 'in', '("collected","shipped","recycled")')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function updatePieceBatchStatus(batchId, status, extraFields = {}) {
  const updateData = { status, updated_at: new Date().toISOString(), ...extraFields };

  if (status === 'ready') {
    const readyAt = new Date().toISOString();
    updateData.ready_at = readyAt;
    const holdExpires = new Date();
    holdExpires.setDate(holdExpires.getDate() + 60);
    updateData.hold_expires_at = holdExpires.toISOString();
  }

  if (status === 'collected' || status === 'shipped' || status === 'recycled') {
    updateData.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('piece_batches')
    .update(updateData)
    .eq('id', batchId)
    .select('*, customers(id, first_name, last_name, email), course_enrollments(course_type, course_title, course_variant_title, course_identifier)')
    .single();

  if (error) throw error;
  return data;
}

async function updatePieceBatch(batchId, updates) {
  const { data, error } = await supabase
    .from('piece_batches')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', batchId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function searchPieceBatchesByInitials(initials) {
  const { data, error } = await supabase
    .from('piece_batches')
    .select('*, customers(id, first_name, last_name, email), course_enrollments(course_type, course_title, course_variant_title, course_identifier)')
    .ilike('initials', `%${initials}%`)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// ==================== Notifications ====================

async function createNotification({ customerId, type, title, message, data: notifData }) {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      customer_id: customerId,
      type,
      title,
      message,
      data: notifData || {},
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getNotificationsByCustomerId(customerId, { unreadOnly = false } = {}) {
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (unreadOnly) {
    query = query.eq('read', false);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function markNotificationRead(notificationId, customerId) {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .eq('customer_id', customerId)
    .select()
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function markAllNotificationsRead(customerId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('customer_id', customerId)
    .eq('read', false);

  if (error) throw error;
  return true;
}

async function getUnreadNotificationCount(customerId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('read', false);

  if (error) throw error;
  return count || 0;
}

async function getReadyBatchesNeedingReminder() {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const cutoff = fourteenDaysAgo.toISOString();

  const { data, error } = await supabase
    .from('piece_batches')
    .select('*, customers(id, first_name, last_name, email), course_enrollments(course_type, course_title, course_variant_title)')
    .in('status', ['ready', 'collecting', 'delivering'])
    .or(`last_reminder_at.is.null,last_reminder_at.lt.${cutoff}`)
    .not('ready_at', 'is', null);

  if (error) throw error;

  const now = new Date();
  return (data || []).filter(batch => {
    const readyAt = new Date(batch.ready_at);
    const daysSinceReady = Math.floor((now - readyAt) / (1000 * 60 * 60 * 24));
    return daysSinceReady >= 14;
  });
}

// ==================== Firing Runs ====================

async function createFiringRun({ firingType, notes, batchIds }) {
  // Create the firing run
  const { data: run, error: runError } = await supabase
    .from('firing_runs')
    .insert({
      firing_type: firingType,
      notes: notes || null,
      status: 'loading',
    })
    .select()
    .single();

  if (runError) throw runError;

  // Link batches to the run
  const links = batchIds.map(batchId => ({
    firing_run_id: run.id,
    piece_batch_id: batchId,
  }));

  const { error: linkError } = await supabase
    .from('firing_run_batches')
    .insert(links);

  if (linkError) throw linkError;

  return run;
}

async function getFiringRuns({ status, limit = 20 } = {}) {
  let query = supabase
    .from('firing_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function getFiringRunById(runId) {
  const { data: run, error: runError } = await supabase
    .from('firing_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (runError) throw runError;

  const { data: links, error: linkError } = await supabase
    .from('firing_run_batches')
    .select('piece_batch_id')
    .eq('firing_run_id', runId);

  if (linkError) throw linkError;

  // Fetch the actual batches with customer/enrollment info
  const batchIds = (links || []).map(l => l.piece_batch_id);
  if (batchIds.length === 0) return { ...run, batches: [] };

  const { data: batches, error: batchError } = await supabase
    .from('piece_batches')
    .select('*, customers(id, first_name, last_name, email), course_enrollments(course_type, course_title, course_variant_title, course_identifier)')
    .in('id', batchIds);

  if (batchError) throw batchError;

  return { ...run, batches: batches || [] };
}

async function completeFiringRun(runId) {
  const { data, error } = await supabase
    .from('firing_runs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', runId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ==================== Auto-Recycle ====================

async function getExpiredPieceBatches() {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('piece_batches')
    .select('*, customers(id, first_name, last_name, email), course_enrollments(course_type, course_title, course_variant_title, course_identifier)')
    .in('status', ['ready', 'collecting', 'delivering'])
    .lt('hold_expires_at', now)
    .not('hold_expires_at', 'is', null);

  if (error) throw error;
  return data || [];
}

// ==================== Gallery Admin ====================

async function searchPotteryPiecesByInitials(initials) {
  // Join through customers to match initials
  const { data: customers, error: custError } = await supabase
    .from('customers')
    .select('id')
    .ilike('initials', `%${initials}%`);

  if (custError) throw custError;
  if (!customers || customers.length === 0) return [];

  const customerIds = customers.map(c => c.id);

  const { data, error } = await supabase
    .from('pottery_pieces')
    .select(`
      *,
      customer:customers!pottery_pieces_customer_id_fkey (
        id, first_name, last_name, email, initials
      )
    `)
    .in('customer_id', customerIds)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Compute enrollment credits from actual bookings (source of truth).
 * Never trust class_credits_used / class_credits_remaining columns — they go stale.
 *
 * @param {number} enrollmentId
 * @returns {{ allocated, attended, booked, committed, remaining }}
 */
async function getEnrollmentCredits(enrollmentId) {
  const { data: enr } = await supabase
    .from('course_enrollments')
    .select('class_credits_allocated, course_type, number_of_weeks')
    .eq('id', enrollmentId)
    .single();

  if (!enr) return { allocated: 0, attended: 0, booked: 0, committed: 0, remaining: 0 };

  const isHB = (enr.course_type || '').toLowerCase().includes('handbuilding');
  const is10Class = enr.number_of_weeks === 10;
  const allocated = enr.class_credits_allocated || (isHB ? (enr.number_of_weeks || 4) : 0);

  // For 10-class packages, only count HB/flex bookings (not the 6 WT core classes)
  let statusFilter;
  if (is10Class) {
    // Count flex bookings: HB classes only
    const { count: attendedCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('course_enrollment_id', enrollmentId)
      .in('status', ['attended', 'completed'])
      .filter('class_instance_id', 'in', `(SELECT id FROM class_instances WHERE class_type LIKE 'HB%')`);

    // Supabase doesn't support subquery in .filter, so query differently
    const { data: allBookings } = await supabase
      .from('bookings')
      .select('id, status, class_instances!bookings_class_instance_id_fkey(class_type)')
      .eq('course_enrollment_id', enrollmentId)
      .in('status', ['attended', 'completed', 'booked']);

    const hbBookings = (allBookings || []).filter(b => (b.class_instances?.class_type || '').toUpperCase().startsWith('HB'));
    const attended = hbBookings.filter(b => b.status === 'attended' || b.status === 'completed').length;
    const booked = hbBookings.filter(b => b.status === 'booked').length;
    const committed = attended + booked;
    const remaining = Math.max(0, allocated - committed);
    return { allocated, attended, booked, committed, remaining };
  }

  // HB and standard enrollments: count all bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('course_enrollment_id', enrollmentId)
    .in('status', ['attended', 'completed', 'booked']);

  const attended = (bookings || []).filter(b => b.status === 'attended' || b.status === 'completed').length;
  const booked = (bookings || []).filter(b => b.status === 'booked').length;
  const committed = attended + booked;
  const remaining = Math.max(0, allocated - committed);
  return { allocated, attended, booked, committed, remaining };
}

module.exports = {
  supabase,
  // Customer functions
  findCustomerByShopifyId,
  findCustomerByEmail,
  createCustomer,
  updateCustomer,
  syncCustomer,
  getAllCustomers,
  getCustomerById,
  incrementClassesForfeited,
  // Pottery piece functions
  getPublicPotteryPieces,
  getPotteryPiecesByCustomerId,
  getPotteryPieceById,
  getAllPotteryPieces,
  createPotteryPiece,
  updatePotteryPiece,
  deletePotteryPiece,
  // Reference data
  getClayTypes,
  getGlazes,
  createClayType,
  updateClayType,
  deleteClayType,
  createGlaze,
  updateGlaze,
  deleteGlaze,
  // Credit computation
  getEnrollmentCredits,
  // Class functions
  getAvailableClasses,
  getClassInstanceById,
  updateClassEnrollment,
  // Booking functions
  getClassBookings,
  getBookingById,
  createBooking,
  updateBooking,
  findBooking,
  getMakeupBookingCount,
  getStudentBookings,
  getStudentAttendance,
  // Waitlist functions
  getClassWaitlist,
  findWaitlistEntry,
  getMaxWaitlistPosition,
  createWaitlistEntry,
  deleteWaitlistEntry,
  updateWaitlistPositions,
  getStudentWaitlistEntries,
  getNextInWaitlist,
  updateWaitlistEntry,
  getWaitlistEntryById,
  getExpiredWaitlistOffers,
  // Membership functions
  getActiveMembership,
  getCustomerMemberships,
  getAllMemberships,
  createMembership,
  updateMembership,
  deleteMembership,
  cancelMembership,
  hasActiveMembership,
  // Course enrollment functions
  createCourseEnrollment,
  findCohortEnrollments,
  updateCourseEnrollment,
  createClassInstances,
  createMultipleBookings,
  // Customer type sync
  syncCustomerTypeFromMemberships,
  updateSingleCustomerType,
  // Piece batch functions
  createPieceBatch,
  getPieceBatchesByCustomerId,
  getPieceBatchById,
  getAllActivePieceBatches,
  updatePieceBatchStatus,
  updatePieceBatch,
  searchPieceBatchesByInitials,
  getReadyBatchesNeedingReminder,
  // Notification functions
  createNotification,
  getNotificationsByCustomerId,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
  // Firing run functions
  createFiringRun,
  getFiringRuns,
  getFiringRunById,
  completeFiringRun,
  // Auto-recycle
  getExpiredPieceBatches,
  // Gallery admin
  searchPotteryPiecesByInitials,
};
