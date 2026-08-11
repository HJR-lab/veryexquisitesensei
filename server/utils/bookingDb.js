/**
 * Class, booking & waitlist data access (plus enrollment-credit computation).
 *
 * Final domain module extracted from the monolithic supabaseDb.js. Owns the
 * `class_instances`, `bookings` and `waitlist` tables. supabaseDb.js is now a
 * thin compatibility barrel that re-exports these (and the other domain
 * modules) so existing `require('./supabaseDb').<fn>` call sites keep working.
 */

const { supabase } = require('./supabaseClient');

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

  if (error) throw error;
  if (!classes || classes.length === 0) return [];

  const classIds = classes.map(c => c.id);

  // Batch: get ALL booking counts and waitlist counts in 3 queries total (not per-class)
  const [bookingsResult, makeupResult, waitlistResult] = await Promise.all([
    supabase
      .from('bookings')
      .select('class_instance_id')
      .in('class_instance_id', classIds)
      .in('status', ['booked', 'attended']),
    supabase
      .from('bookings')
      .select('class_instance_id')
      .in('class_instance_id', classIds)
      .eq('booking_type', 'makeup')
      .eq('status', 'booked'),
    supabase
      .from('waitlist')
      .select('class_instance_id')
      .in('class_instance_id', classIds)
      .eq('claimed', false)
  ]);

  // Build count maps
  const bookingCounts = {};
  const makeupCounts = {};
  const waitlistCounts = {};
  (bookingsResult.data || []).forEach(b => { bookingCounts[b.class_instance_id] = (bookingCounts[b.class_instance_id] || 0) + 1; });
  (makeupResult.data || []).forEach(b => { makeupCounts[b.class_instance_id] = (makeupCounts[b.class_instance_id] || 0) + 1; });
  (waitlistResult.data || []).forEach(w => { waitlistCounts[w.class_instance_id] = (waitlistCounts[w.class_instance_id] || 0) + 1; });

  const REGULAR_CAPACITY = 8;

  return classes.map(classInstance => {
    const actualEnrollment = bookingCounts[classInstance.id] || 0;
    const makeupCount = makeupCounts[classInstance.id] || 0;
    const waitlistCount = waitlistCounts[classInstance.id] || 0;
    const totalCapacity = classInstance.max_capacity || 10;

    return {
      id: classInstance.id,
      templateId: classInstance.template_id,
      classDate: classInstance.class_date,
      startTime: classInstance.start_time,
      endTime: classInstance.end_time,
      classType: classInstance.class_type,
      classTitle: classInstance.class_title,
      classDescription: classInstance.class_description,
      instructor: classInstance.instructor,
      room: classInstance.room,
      maxCapacity: totalCapacity,
      regularCapacity: REGULAR_CAPACITY,
      currentEnrollment: actualEnrollment,
      status: classInstance.status,
      cancellationReason: classInstance.cancellation_reason,
      createdAt: classInstance.created_at,
      updatedAt: classInstance.updated_at,
      waitlistCount,
      makeupBookings: makeupCount,
      makeupSpotsAvailable: 2 - makeupCount,
      spotsAvailable: totalCapacity - actualEnrollment,
      regularSpotsAvailable: REGULAR_CAPACITY - actualEnrollment,
      isFull: actualEnrollment >= REGULAR_CAPACITY,
      isCompletelyFull: actualEnrollment >= totalCapacity
    };
  });
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

// The studio has 10 wheels total. A "timeslot" (class_date + start_time) can hold
// at most 10 booked students across ALL cohorts that share it — even when two
// concurrent courses run at the same time (internally split as Studio A / Studio B).
const STUDIO_WHEELS = 10;

// Normalize start_time for slot matching — the column has drifted between formats
// ("9:30am" vs "9:30 AM"), so compare case/space-insensitively.
function normalizeSlotTime(t) {
  return String(t || '').toLowerCase().replace(/\s+/g, '');
}

/**
 * Count booked students in a timeslot (class_date + start_time) across every
 * class_instance that shares it — this is the true "wheels in use" number.
 * Returns { count, instanceIds }.
 */
async function getSlotWheelUsage(classDate, startTime) {
  const { data: sameDay } = await supabase
    .from('class_instances')
    .select('id, start_time')
    .eq('class_date', classDate);

  const nt = normalizeSlotTime(startTime);
  const instanceIds = (sameDay || []).filter(c => normalizeSlotTime(c.start_time) === nt).map(c => c.id);
  if (!instanceIds.length) return { count: 0, instanceIds: [] };

  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .in('class_instance_id', instanceIds)
    .eq('status', 'booked');

  return { count: count || 0, instanceIds };
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
      .select('max_capacity, class_date, start_time')
      .eq('id', bookingData.classInstanceId)
      .single();

    const cap = cls?.max_capacity || 10;
    if (count >= cap) {
      const err = new Error(`Class is full (${count}/${cap})`);
      err.code = 'CLASS_FULL';
      throw err;
    }

    // Studio-wide 10-wheel cap across all cohorts sharing this timeslot.
    if (cls?.class_date && cls?.start_time) {
      const { count: wheels } = await getSlotWheelUsage(cls.class_date, cls.start_time);
      if (wheels >= STUDIO_WHEELS) {
        const err = new Error(`Studio is full — all ${STUDIO_WHEELS} wheels are booked for this timeslot (${wheels}/${STUDIO_WHEELS})`);
        err.code = 'CLASS_FULL';
        throw err;
      }
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

// Membership functions live in membershipDb.js (merged into module.exports below).

// Course enrollment functions live in enrollmentDb.js (merged into module.exports below).












// Notifications live in notificationDb.js (merged into module.exports below).







// ==================== Auto-Recycle ====================




/**
 * Total allocation to persist when a booking is turned back into a credit.
 *
 * class_credits_allocated is only populated for HB blocks and 10-class packages. On a plain
 * WT enrollment it is null and the real total lives in number_of_weeks — and every reader
 * (getEnrollmentCredits, anomalyProbe, Dashboard, AdminStudentDetail) resolves it as
 * `class_credits_allocated || number_of_weeks`. So writing a bare 1 here would clobber the
 * course length and make the student's whole course read as a single class.
 *
 * Converting a booking is entitlement-neutral: the total can only ever hold or grow.
 *
 * @param {{allocated:number, numberOfWeeks:number, committedBefore:number}} input
 *   committedBefore — attended + booked bookings, counted before the conversion.
 * @returns {number} allocation to store (always >= 1, so `allocated > 0` still means "credits live")
 */
function resolveCreditAllocation({ allocated = 0, numberOfWeeks = 0, committedBefore = 0 }) {
  return Math.max(allocated || 0, numberOfWeeks || 0, committedBefore || 0, 1);
}

/**
 * Compute enrollment credits from actual bookings (source of truth).
 * Never trust class_credits_used / class_credits_remaining columns — they go stale.
 *
 * @param {number} enrollmentId
 * @returns {{ allocated, attended, booked, committed, remaining }}
 */
// Booking statuses that consume a class credit.
//   attended / completed — taken
//   booked               — committed, not yet taken
//   forfeited / absent   — no-show; the class is burnt. An admin may return it on
//                          appeal, but that is an explicit action, never automatic.
// Deliberately excluded: 'cancelled' returns the credit, and 'rescheduled' is neutral
// because a replacement booking exists and is counted in its own right.
const CREDIT_CONSUMING_STATUSES = ['attended', 'completed', 'booked', 'forfeited', 'absent'];
const TAKEN_STATUSES = ['attended', 'completed'];
const BURNT_STATUSES = ['forfeited', 'absent'];

async function getEnrollmentCredits(enrollmentId) {
  const { data: enr } = await supabase
    .from('course_enrollments')
    .select('class_credits_allocated, course_type, number_of_weeks')
    .eq('id', enrollmentId)
    .single();

  if (!enr) return { allocated: 0, attended: 0, booked: 0, forfeited: 0, committed: 0, remaining: 0 };

  const isHB = (enr.course_type || '').toLowerCase().includes('handbuilding');
  const is10Class = (enr.number_of_weeks || 0) >= 10;
  const allocated = enr.class_credits_allocated || (isHB ? (enr.number_of_weeks || 4) : 0);

  // For 10-class packages, count ALL active bookings (WT core + flex of any type)
  // Flex credits can be used for WT makeups or HB classes
  if (is10Class) {
    const totalAlloc = enr.number_of_weeks || 10;

    const { data: allBookings } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('course_enrollment_id', enrollmentId)
      .in('status', CREDIT_CONSUMING_STATUSES);

    const attended = (allBookings || []).filter(b => TAKEN_STATUSES.includes(b.status)).length;
    const booked = (allBookings || []).filter(b => b.status === 'booked').length;
    const forfeited = (allBookings || []).filter(b => BURNT_STATUSES.includes(b.status)).length;
    const committed = attended + booked + forfeited;
    const remaining = Math.max(0, totalAlloc - committed);
    return { allocated: totalAlloc, attended, booked, forfeited, committed, remaining };
  }

  // HB and standard enrollments: count all bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('course_enrollment_id', enrollmentId)
    .in('status', CREDIT_CONSUMING_STATUSES);

  const attended = (bookings || []).filter(b => TAKEN_STATUSES.includes(b.status)).length;
  const booked = (bookings || []).filter(b => b.status === 'booked').length;
  const forfeited = (bookings || []).filter(b => BURNT_STATUSES.includes(b.status)).length;
  const committed = attended + booked + forfeited;
  const remaining = Math.max(0, allocated - committed);
  return { allocated, attended, booked, forfeited, committed, remaining };
}

module.exports = {
  getEnrollmentCredits,
  resolveCreditAllocation,
  getAvailableClasses,
  getClassInstanceById,
  updateClassEnrollment,
  getClassBookings,
  getBookingById,
  createBooking,
  getSlotWheelUsage,
  STUDIO_WHEELS,
  updateBooking,
  findBooking,
  getMakeupBookingCount,
  getStudentBookings,
  getStudentAttendance,
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
};
