/**
 * Supabase Database Adapter
 *
 * Bypasses Prisma connection issues by using direct Supabase SQL queries
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://fpdbfbxpthmaceuspcrf.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
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
      // Update existing customer
      const updates = {
        email: shopifyCustomer.email,
        first_name: shopifyCustomer.firstName,
        last_name: shopifyCustomer.lastName,
        last_synced_at: new Date().toISOString()
      };

      // Update course dates if we have them
      if (purchaseDate) {
        updates.course_purchase_date = purchaseDate;
      }
      if (expiryDate) {
        updates.course_expiry_date = expiryDate;
      }
      // Update course purchase count
      if (coursePurchaseCount > 0) {
        updates.course_purchase_count = coursePurchaseCount;
      }

      const updated = await updateCustomer(existingCustomer.id, updates);
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
        email
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
    .order('class_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(200);

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
      // Fetch waitlist count and makeup count in parallel
      const [waitlistResult, makeupResult] = await Promise.all([
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
          .eq('status', 'booked')
      ]);

      const waitlistCount = waitlistResult.count || 0;
      const makeupCount = makeupResult.count || 0;

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
        currentEnrollment: classInstance.current_enrollment,
        status: classInstance.status,
        cancellationReason: classInstance.cancellation_reason,
        createdAt: classInstance.created_at,
        updatedAt: classInstance.updated_at,
        waitlistCount: waitlistCount,
        makeupBookings: makeupCount,
        makeupSpotsAvailable: 2 - makeupCount,
        spotsAvailable: totalCapacity - classInstance.current_enrollment,
        regularSpotsAvailable: REGULAR_CAPACITY - classInstance.current_enrollment,
        isFull: classInstance.current_enrollment >= REGULAR_CAPACITY,  // Full for regular booking at 8
        isCompletelyFull: classInstance.current_enrollment >= totalCapacity  // Completely full at 10
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
async function getGlazes() {
  const { data, error } = await supabase
    .from('glazes')
    .select('*')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
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
      color: glazeData.color,
      cone: glazeData.cone,
      active: glazeData.active !== undefined ? glazeData.active : true
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
  if (updates.color !== undefined) dbUpdates.color = updates.color;
  if (updates.cone !== undefined) dbUpdates.cone = updates.cone;
  if (updates.active !== undefined) dbUpdates.active = updates.active;

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
 * Get student's bookings
 */
async function getStudentBookings(studentId) {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      class_instance:class_instances!bookings_class_instance_id_fkey (*)
    `)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
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
      status: enrollmentData.status || 'pending'
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Find course enrollments by cohort (same course type, start date, schedule)
 */
async function findCohortEnrollments(courseType, startDate, schedulePattern) {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('course_type', courseType)
    .eq('course_start_date', startDate)
    .eq('schedule_pattern', schedulePattern)
    .eq('status', 'pending');

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
  createMultipleBookings
};
