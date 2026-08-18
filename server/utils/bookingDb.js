/**
 * Class, booking & waitlist data access (plus enrollment-credit computation).
 *
 * Final domain module extracted from the monolithic supabaseDb.js. Owns the
 * `class_instances`, `bookings` and `waitlist` tables. supabaseDb.js is now a
 * thin compatibility barrel that re-exports these (and the other domain
 * modules) so existing `require('./supabaseDb').<fn>` call sites keep working.
 */

const { supabase } = require('./supabaseClient');
const { glazingSubCap } = require('./glazing');
const { STUDIO_WHEELS, roomCapacity, makeupSeats, wheelCapFor } = require('../config/capacity');

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
    const totalCapacity = roomCapacity(classInstance);
    const makeupCapacity = makeupSeats(classInstance);

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
      makeupCapacity,
      makeupSpotsAvailable: makeupCapacity - makeupCount,
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
 * Find a live, unused capacity grant for this exact student in this exact class.
 *
 * A grant is bound to one student and one instance on purpose: it lets an admin
 * seat a named person over the cap without opening the seat to whoever refreshes
 * the booking page next.
 */
async function findCapacityOverride(classInstanceId, studentId) {
  if (!classInstanceId || !studentId) return null;

  const { data, error } = await supabase
    .from('capacity_overrides')
    .select('*')
    .eq('class_instance_id', classInstanceId)
    .eq('student_id', studentId)
    .is('revoked_at', null)
    .is('consumed_at', null)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    // A missing table (feature not migrated yet) must not break booking.
    console.error('capacity_overrides lookup failed:', error.message);
    return null;
  }
  return data || null;
}

/**
 * Mark a grant as spent. If the student later moves away from the class the
 * grant stays spent — a fresh one has to be granted rather than the extra seat
 * quietly staying open.
 */
async function consumeCapacityOverride(overrideId, bookingId) {
  if (!overrideId) return;
  const { error } = await supabase
    .from('capacity_overrides')
    .update({ consumed_booking_id: bookingId || null, consumed_at: new Date().toISOString() })
    .eq('id', overrideId)
    .is('consumed_at', null);
  if (error) console.error('Failed to consume capacity override:', error.message);
}

/**
 * Consumed grants for a class instance — what makes a roster reading 11/10
 * legible instead of looking like a counting bug.
 */
async function getInstanceCapacityOverrides(classInstanceId) {
  const { data, error } = await supabase
    .from('capacity_overrides')
    .select('*, customers!capacity_overrides_student_id_fkey(id, first_name, last_name)')
    .eq('class_instance_id', classInstanceId)
    .is('revoked_at', null)
    .order('created_at');
  if (error) {
    console.error('capacity_overrides list failed:', error.message);
    return [];
  }
  return data || [];
}

/**
 * The single seat gate. Counts actual booked rows (never the cached
 * current_enrollment, which drifts) against the instance cap, and — where the
 * caller already enforced it — against the studio-wide wheel cap.
 *
 * Only if a gate would reject does it look for a grant, so the common path
 * costs one extra query only when the class is genuinely full.
 *
 * @param {object} classInstance  needs id, max_capacity, and (for wheels) class_date + start_time
 * @param {number} studentId      whose seat this is
 * @param {object} opts           { checkWheels } — pass true only where the caller already checked wheels
 * @returns {{allowed: boolean, reason: string|null, counts: object, override: object|null}}
 */
async function checkSeatAvailability(classInstance, studentId, opts = {}) {
  const { checkWheels = false, asGlazing = false } = opts;
  const cap = roomCapacity(classInstance);
  // Weeks 4 and 5 of a 6-week WT are allowed one over the general ceiling; every
  // other class reads the plain STUDIO_WHEELS number.
  const wheelCap = wheelCapFor(classInstance);

  const { count: bookedCount } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('class_instance_id', classInstance.id)
    .eq('status', 'booked');

  const booked = bookedCount || 0;
  let wheels = null;
  if (checkWheels && classInstance.class_date && classInstance.start_time) {
    ({ count: wheels } = await getSlotWheelUsage(classInstance.class_date, classInstance.start_time));
  }

  // Third gate, for a class marked as glazing: the class keeps its own capacity
  // (HB is 8) but only a slice of those seats may be glazing students, so the
  // session still serves ordinary handbuilding bookings. Counted only when this
  // booking would itself consume a glazing seat — a regular booker is bound by
  // max_capacity alone, exactly as before.
  const subCap = glazingSubCap(classInstance);
  let glazingBooked = null;
  if (asGlazing && subCap !== null) {
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('class_instance_id', classInstance.id)
      .eq('status', 'booked')
      .eq('counts_as_glazing', true);
    glazingBooked = count || 0;
  }

  const counts = { booked, cap, wheels, studioWheels: wheelCap, glazingBooked, glazingCap: subCap };
  const classFull   = booked >= cap;
  const studioFull  = wheels !== null && wheels >= wheelCap;
  const glazingFull = glazingBooked !== null && glazingBooked >= subCap;

  if (!classFull && !studioFull && !glazingFull) {
    return { allowed: true, reason: null, counts, override: null };
  }

  const override = await findCapacityOverride(classInstance.id, studentId);
  if (override) {
    return { allowed: true, reason: null, counts, override };
  }

  const reason = classFull ? 'CLASS_FULL' : studioFull ? 'STUDIO_FULL' : 'GLAZING_FULL';
  return { allowed: false, reason, counts, override: null };
}

/**
 * Create booking
 */
async function createBooking(bookingData) {
  // Hard cap: never exceed max_capacity (default 10) for any class, and never
  // exceed the studio-wide wheel count. An admin-granted capacity_overrides row
  // for this exact student is the only way past either.
  let grantedOverride = null;

  if (bookingData.classInstanceId) {
    const { data: cls } = await supabase
      .from('class_instances')
      .select('id, max_capacity, class_date, start_time, class_type, is_glazing, glazing_capacity')
      .eq('id', bookingData.classInstanceId)
      .single();

    const seat = await checkSeatAvailability(
      { ...(cls || {}), id: bookingData.classInstanceId },
      bookingData.studentId,
      { checkWheels: true, asGlazing: bookingData.countsAsGlazing === true }
    );

    if (!seat.allowed) {
      let err;
      if (seat.reason === 'STUDIO_FULL') {
        err = new Error(`Studio is full — all ${seat.counts.studioWheels} places are taken for this timeslot (${seat.counts.wheels}/${seat.counts.studioWheels})`);
      } else if (seat.reason === 'GLAZING_FULL') {
        err = new Error(`This class already has its ${seat.counts.glazingCap} glazing places taken (${seat.counts.glazingBooked}/${seat.counts.glazingCap}). The class itself still has room for regular bookings.`);
      } else {
        err = new Error(`Class is full (${seat.counts.booked}/${seat.counts.cap})`);
      }
      err.code = seat.reason === 'GLAZING_FULL' ? 'GLAZING_FULL' : 'CLASS_FULL';
      throw err;
    }
    grantedOverride = seat.override;
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

  // Marks this booking as the one that consumed the student's glazing class.
  // Distinct from is_glazing_reschedule, which records that a reschedule was
  // waived because it moved a glazing class.
  if (bookingData.countsAsGlazing !== undefined) {
    insertData.counts_as_glazing = bookingData.countsAsGlazing === true;
  }

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

  if (grantedOverride) {
    await consumeCapacityOverride(grantedOverride.id, data.id);
    console.log(`⚠️  Capacity override ${grantedOverride.id} used: student ${bookingData.studentId} seated over cap in class ${bookingData.classInstanceId} — ${grantedOverride.reason}`);
  }

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

/**
 * What one enrollment entitles a student to, in classes.
 *
 * Mirrors how getEnrollmentCredits decides an allocation, and is separate from
 * it on purpose: getEnrollmentCredits reports `allocated: 0` for a standard WT
 * enrollment because WT weeks are not credit-tracked, and `remaining` depends on
 * that. Changing it would silently move booking eligibility. This function
 * answers the different question the admin screens ask — "how many classes does
 * this course come with" — without touching that.
 *
 *   10-class packages: number_of_weeks (10). class_credits_allocated holds the
 *   flex portion (4) and is NOT the total.
 *   Everything else: the class_credits_allocated override if set, else weeks.
 */
function enrollmentEntitlement(enr) {
  if (!enr) return 0;
  const weeks = enr.number_of_weeks || 0;
  if (weeks >= 10) return weeks;
  return enr.class_credits_allocated || weeks || 0;
}

/**
 * A student's allocation across every open enrollment.
 *
 * THE ONE DEFINITION, replacing three ad-hoc recomputations that had quietly
 * grown up around customers.classes_allocated — auth.js and admin.js each
 * summed number_of_weeks over active enrollments in-memory before responding,
 * and a third site preferred enrollment totals "because the column can be
 * lifetime/legacy and causes inflated values (e.g. 18)". Each was subtly
 * different, and none honoured class_credits_allocated overrides or closures.
 *
 * The column itself is not read. It was written additively on every purchase
 * and never decremented, so it is a lifetime running total, meaningless for
 * anyone who bought twice (one student reached 34).
 */
async function getStudentAllocation(customerId) {
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('id, course_type, number_of_weeks, class_credits_allocated, credits_closed_at, status')
    .eq('student_id', customerId)
    .in('status', ['active', 'completed']);

  let allocated = 0, committed = 0, remaining = 0;
  for (const e of enrollments || []) {
    if (e.credits_closed_at) continue;
    const credits = await getEnrollmentCredits(e.id);
    allocated += enrollmentEntitlement(e);
    committed += credits.committed;
    remaining += credits.remaining;
  }
  return { allocated, committed, remaining };
}

/**
 * What a student may actually book, according to the bookings ledger.
 *
 * THE ONE ANSWER to "does this person have a class credit". Booking eligibility
 * used to read customers.classes_allocated first and only consult the ledger if
 * that came out <= 0. That column defaulted to 6 on every customer record ever
 * created, so 444 students could book 2,703 classes nobody paid for, and the
 * booking screen told them so in writing. See scripts/clear-phantom-class-
 * allocations.js, which cleaned the data in 2026 but could not fix the code path.
 *
 * classes_allocated is deliberately NOT consulted here, not even as a fallback:
 * a default is not a purchase, and the ledger is the only proof of entitlement.
 *
 * A student with no enrollment row at all gets remaining 0 and reason
 * 'no-enrollment'. That case is real but ambiguous — the order-sync gap leaves
 * genuinely-paid customers without an enrollment — so callers should say so
 * plainly rather than claim the credits were used up.
 *
 * @param {number} customerId
 * @returns {Promise<{remaining:number, enrollment:object|null, reason:string}>}
 */
async function getBookableCredits(customerId) {
  const { data: candidates } = await supabase
    .from('course_enrollments')
    // 'completed' is included deliberately: a 10-class package keeps its flex
    // classes after the 6-week cohort ends, and the student must still be able
    // to book them.
    .select('id, course_type, course_identifier, number_of_weeks, class_credits_allocated, credits_closed_at, status')
    .eq('student_id', customerId)
    .in('status', ['active', 'completed']);

  if (!candidates || candidates.length === 0) {
    return { remaining: 0, enrollment: null, reason: 'no-enrollment' };
  }

  const withCredits = [];
  for (const e of candidates) {
    // A block an admin has deliberately closed wins over whatever the ledger computes.
    if (e.credits_closed_at) continue;
    const credits = await getEnrollmentCredits(e.id);
    if (credits.remaining > 0) {
      withCredits.push({ ...e, computedRemaining: credits.remaining, computedCommitted: credits.committed });
    }
  }

  if (withCredits.length === 0) {
    return { remaining: 0, enrollment: null, reason: 'no-credits' };
  }

  // Prefer a 10-class package so flex credits are spent before anything else.
  const enrollment = withCredits.find(e =>
    e.number_of_weeks >= 10 || (e.course_type || '').includes('10 Classes')
  ) || withCredits[0];

  return {
    remaining: withCredits.reduce((sum, e) => sum + e.computedRemaining, 0),
    enrollment,
    reason: 'ok',
  };
}

/**
 * Recompute an enrollment's stored credit cache from the bookings ledger.
 *
 * THE ONLY SANCTIONED WRITER of class_credits_used / class_credits_remaining
 * after an enrollment exists. Call it once, after the booking rows have been
 * written. Every credit-affecting route used to do its own arithmetic — +1
 * here, -1 there, computedCommitted + 1 somewhere else — and the 09/08/26
 * credit review found that every failure came from the counter and the ledger
 * being edited independently.
 *
 * WHAT `used` MEANS — settled here, deliberately, because it previously meant
 * two different things (admin.js wrote attended-only, classes.js wrote
 * committed). It is COMMITTED: attended + booked + forfeited. That is the only
 * definition under which the identity holds:
 *
 *     allocated = used + remaining
 *
 * which is what makes `remaining` mean anything. Callers that specifically
 * want attendance should read getEnrollmentCredits().attended, not this column.
 *
 * NOT WRITTEN, on purpose:
 *   - class_credits_allocated. It is an override: for a standard WT enrollment
 *     the real total lives in number_of_weeks and getEnrollmentCredits reports
 *     allocated 0, so writing that back would clobber the fallback and shrink
 *     the course. See project_credits_allocated_override.
 *   - `used` on a closed block. That counter is history; the block is shut and
 *     rewriting it would destroy the record of what was consumed.
 *
 * @param {number} enrollmentId
 * @returns {object|null} the computed credits, or null if the enrollment is gone
 */
async function syncStoredCredits(enrollmentId) {
  if (!enrollmentId) return null;

  const { data: enr } = await supabase
    .from('course_enrollments')
    .select('id, credits_closed_at')
    .eq('id', enrollmentId)
    .single();

  if (!enr) return null;

  const credits = await getEnrollmentCredits(enrollmentId);

  // A closed block advertises nothing, whatever the ledger computes from its
  // historical bookings — the gates read credits_closed_at, but ~40 display
  // paths still read this number.
  const update = {
    class_credits_remaining: enr.credits_closed_at ? 0 : credits.remaining,
    updated_at: new Date().toISOString(),
  };
  if (!enr.credits_closed_at) update.class_credits_used = credits.committed;

  const { error } = await supabase
    .from('course_enrollments')
    .update(update)
    .eq('id', enrollmentId);

  if (error) {
    // Never fail the caller's booking over a cache write — the ledger is the
    // truth and verify-credit-columns.js will catch a stale cache.
    console.error(`[credits] failed to sync stored cache for enrollment ${enrollmentId}:`, error.message);
  }

  return credits;
}

/**
 * Which enrollment should a booking be charged to?
 *
 * getEnrollmentCredits counts by course_enrollment_id, so a booking with no
 * link consumes nothing: the class is booked, the seat is taken, and the credit
 * is never spent. Getting this wrong hands out free classes, so both booking
 * paths (student-facing and admin) resolve it the same way here.
 *
 * Order matters:
 *   1. The student's own cohort, matched on the course identifier. Someone
 *      booking week 6 of WT1107PM_DL6 who holds an enrollment in
 *      WT1107PM_DL6 is not making up a class — that IS their class, and no
 *      other candidate should win.
 *   2. Otherwise a genuine makeup: charge whichever open enrollment still has
 *      credits, preferring a 10-class package, whose flex classes exist to be
 *      spent exactly this way.
 *
 * Returns null when there is no credit-bearing enrollment. That is legitimate —
 * a cross-course makeup covered by the legacy per-customer allocation has
 * nothing to link to — so callers must not invent a link.
 *
 * Regression origin: this used to look only for a 10-class package, so a
 * 6-week WT student whose legacy counter still read positive got a null link
 * and a free class (Sanjana Vijay, booking 29649, 09/08/26).
 */
async function resolveBookingEnrollment(studentId, classInstance) {
  if (!studentId) return null;

  const { data: candidates } = await supabase
    .from('course_enrollments')
    .select('id, course_identifier, course_type, number_of_weeks, status, credits_closed_at, created_at')
    .eq('student_id', studentId)
    .in('status', ['active', 'paused', 'upcoming', 'completed'])
    .order('created_at', { ascending: false });

  const open = (candidates || []).filter(e => !e.credits_closed_at);
  if (!open.length) return null;

  // "WT1107PM_DL6.6" -> "WT1107PM_DL6"
  const baseOf = (identifier) => (identifier || '').split('.')[0];
  const classBase = baseOf(classInstance?.class_type);

  if (classBase) {
    const ownCohort = open.find(e => e.course_identifier && baseOf(e.course_identifier) === classBase);
    if (ownCohort) return ownCohort.id;
  }

  const withCredits = [];
  for (const e of open) {
    const credits = await getEnrollmentCredits(e.id);
    if (credits.remaining > 0) withCredits.push(e);
  }

  if (withCredits.length) {
    const pkg = withCredits.find(e =>
      (e.number_of_weeks || 0) >= 10 || (e.course_type || '').includes('10 Classes'));
    return (pkg || withCredits[0]).id;
  }

  // Nothing has credits left, but the student clearly belongs to a course of
  // this type. Attribute it anyway: an over-committed enrollment is visible and
  // countable (remaining floors at 0), whereas an unlinked booking is invisible
  // and free. Attributing to a plausible enrollment always beats orphaning.
  const prefix = (classBase || '').substring(0, 2);   // "WT" or "HB"
  if (prefix) {
    const sameType = open.find(e => (e.course_identifier || '').startsWith(prefix));
    if (sameType) return sameType.id;
  }

  return null;
}

module.exports = {
  getBookableCredits,
  getStudentAllocation,
  enrollmentEntitlement,
  getEnrollmentCredits,
  syncStoredCredits,
  resolveBookingEnrollment,
  resolveCreditAllocation,
  getAvailableClasses,
  getClassInstanceById,
  updateClassEnrollment,
  getClassBookings,
  getBookingById,
  createBooking,
  getSlotWheelUsage,
  STUDIO_WHEELS,
  checkSeatAvailability,
  findCapacityOverride,
  consumeCapacityOverride,
  getInstanceCapacityOverrides,
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
