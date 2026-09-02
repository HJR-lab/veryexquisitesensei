/**
 * Course Enrollment Manager
 * Handles automatic class instance and booking creation when 4+ students purchase the same course
 */

const { parseCourseInfo, generateCohortId, createClassInstances: generateClassInstanceObjects } = require('./courseScheduler');
const {
  supabase,
  createCourseEnrollment,
  findCohortEnrollments,
  updateCourseEnrollment,
  createClassInstances,
  createMultipleBookings,
  findCustomerByEmail,
  findCustomerByShopifyId,
  createDuplicatePaxCustomer,
  updateCustomer
} = require('./supabaseDb');
const courseConfig = require('./courseConfig');
const { roomCapacity } = require('../config/capacity');
const { toYmd, isWeekday, ymdFromInstant } = require('./sgtDate');

const MINIMUM_STUDENTS_THRESHOLD = 4; // legacy export kept for backward compatibility

function getMinStudentsThreshold(courseTypeKey) {
  try {
    const config = courseConfig.getConfig(courseTypeKey);
    return config ? config.min_students_to_activate : 4;
  } catch (e) {
    return 4; // fallback if config not loaded
  }
}

// Threshold only applies to Wheelthrowing courses
const COURSES_WITH_THRESHOLD = ['Wheelthrowing', 'Wheelthrowing Beginner', 'Wheelthrowing Intermediate', 'Wheelthrowing Advanced'];

// Instructor mappings
const INSTRUCTORS = {
  DILLON_LIN: { code: 'DL', name: 'Dillon Lin' },
  JOYCE_LIM: { code: 'JL', name: 'Joyce Lim' },
  LYNETTE_TING: { code: 'LT', name: 'Lynette Ting' }
};

// Get instructor for course type and schedule
function getInstructorForCourse(courseType, schedulePattern) {
  if (courseType && courseType.toLowerCase().includes('handbuilding')) {
    return INSTRUCTORS.LYNETTE_TING; // Handbuilding taught by LT
  }
  // Weekends (Saturday/Sunday) are taught by Dillon Lin
  if (schedulePattern && ['SATURDAY', 'SUNDAY'].includes(schedulePattern.toUpperCase())) {
    return INSTRUCTORS.DILLON_LIN;
  }
  // Weekdays default to Joyce Lim
  return INSTRUCTORS.JOYCE_LIM;
}

/**
 * Process a course purchase from Shopify order
 * @param {Object} order - Shopify order object
 * @param {Object} lineItem - Shopify line item (course product)
 * @returns {Promise<Object>} Result object with enrollment and any created bookings
 */
async function processCoursePurchase(order, lineItem) {
  try {
    // Resolve the student. Email first, then the Shopify customer ID.
    //
    // The ID fallback exists because email_locked permanently pins a local row's
    // email to the admin's value, so a customer who later changes their email in
    // Shopify (or checks out under a second Shopify customer record) no longer
    // matches on email at all — and every future order for them was silently
    // dropped. shopify_customer_id is the stable link; email is not.
    //
    // Extra-pax spots are deliberately excluded: their synthetic "+dup@" email is
    // the ONLY thing that distinguishes them, and they share the purchaser's
    // Shopify customer ID. Falling back on ID there would collapse every extra
    // spot onto the purchaser.
    let student = await findCustomerByEmail(order.customer.email);

    if (!student && order.customer.shopifyCustomerId && !order.customer.isExtraPax) {
      student = await findCustomerByShopifyId(order.customer.shopifyCustomerId);
      if (student) {
        console.log(`🔗 ${order.customer.email} matched no local row; resolved by Shopify customer ID ${order.customer.shopifyCustomerId} → customer ${student.id} (${student.email})`);
      }
    }

    if (!student) {
      console.log(`⚠️  Customer ${order.customer.email} not found in database (shopify id ${order.customer.shopifyCustomerId || 'n/a'})`);
      return {
        success: false,
        error: 'Customer not found in database'
      };
    }

    // Check for duplicate enrollment (same order + line item)
    const { data: existingEnrollment } = await supabase
      .from('course_enrollments')
      .select('id, student_id, manual_student_override')
      .eq('shopify_order_id', order.id)
      .eq('shopify_line_item_id', lineItem.id)
      .maybeSingle();

    if (existingEnrollment) {
      if (existingEnrollment.manual_student_override) {
        console.log(`🔒 Enrollment ${existingEnrollment.id} has manual_student_override=true (student_id=${existingEnrollment.student_id}); leaving as-is.`);
      } else {
        console.log(`⏭️  Enrollment already exists for order ${order.id} / item ${lineItem.id}, skipping`);
      }
      return { success: true, skipped: true, enrollment: existingEnrollment };
    }

    // Parse course information from Shopify product
    const courseInfo = parseCourseInfo(lineItem.title, lineItem.variantTitle, order.createdAt || order.created_at);

    // Skip if the course end date is in the past (old order from a previous year)
    if (courseInfo.endDate && courseInfo.endDate < new Date()) {
      console.log(`⏭️  Skipping old course — end date ${ymdFromInstant(courseInfo.endDate)} is in the past (order ${order.id})`);
      return { success: true, skipped: true, reason: 'course_ended' };
    }

    // Secondary dedup: check if student already has an enrollment with the same start date
    // (catches old manually-imported enrollments that lack shopify_order_id).
    //
    // The key must be built the same way course_start_date is written, below —
    // ymdFromInstant, not toISOString(). parseCourseInfo returns SGT midnight,
    // which is 16:00 UTC the day before, so toISOString() asked for the previous
    // day and this guard almost never matched the row it was meant to catch.
    if (courseInfo.startDate) {
      const startStr = ymdFromInstant(courseInfo.startDate);
      const { data: dateMatch } = await supabase
        .from('course_enrollments')
        .select('id, status, course_title')
        .eq('student_id', student.id)
        .eq('course_start_date', startStr)
        .in('status', ['active', 'completed'])
        .limit(1)
        .maybeSingle();

      if (dateMatch) {
        console.log(`⏭️  Student ${student.email} already has enrollment ${dateMatch.id} (${dateMatch.status}) starting ${startStr}, skipping order ${order.id}`);
        return { success: true, skipped: true, reason: 'duplicate_by_date' };
      }
    }

    // Detect course package type from title
    // Type 1: "3 Course Package" → 3×6 = 18 classes
    // Type 2: "6 Weeks + 4 Flexible Classes" or "10 Classes" → 10 classes
    // Type 3: Regular "6 Weeks" → 6 classes
    const packageMatch = lineItem.title.match(/(\d+)\s*Course\s*Package/i);
    const flexMatch = lineItem.title.match(/(\d+)\s*Flexible\s*Class/i);
    const tenClassMatch = lineItem.title.match(/(\d+)\s*Classes/i);

    let coursesInPackage = packageMatch ? parseInt(packageMatch[1]) : 1;
    let isPackage = coursesInPackage > 1;
    let extraFlexClasses = 0;

    if (flexMatch) {
      // "6 Weeks + 4 Flexible Classes" type
      extraFlexClasses = parseInt(flexMatch[1]);
      isPackage = true;
      console.log(`📦 Detected ${extraFlexClasses} flexible classes in order`);
    } else if (!packageMatch && tenClassMatch && parseInt(tenClassMatch[1]) >= 10) {
      // "10 Classes • NO EXPIRY" type (not a multi-course package, but a class pool)
      extraFlexClasses = parseInt(tenClassMatch[1]) - (courseInfo.numberOfWeeks || 6);
      isPackage = true;
      console.log(`📦 Detected ${tenClassMatch[1]}-class pool in order`);
    }

    if (isPackage && packageMatch) {
      console.log(`📦 Detected ${coursesInPackage}-course package in order`);
    }

    // Validate required fields
    // HB credit-based courses don't require startDate (students self-schedule later)
    const isHandbuilding = courseInfo.courseType && courseInfo.courseType.toLowerCase().includes('handbuilding');

    if (!courseInfo.courseType) {
      console.log(`⚠️  No course type detected for ${lineItem.title}`);
      return { success: false, error: 'No course type detected', courseInfo };
    }

    if (!isHandbuilding && (!courseInfo.startDate || !courseInfo.schedulePattern)) {
      console.log(`⚠️  Incomplete course info for ${lineItem.title} (missing start date or schedule)`);
      return { success: false, error: 'Incomplete course information', courseInfo };
    }

    // Format dates for database (may be null for HB credit courses).
    //
    // NOT toISOString(). parseCourseInfo builds these as SGT midnight, and SGT
    // midnight is 16:00 UTC the DAY BEFORE — so toISOString().split('T')[0]
    // stored every cohort one day early, in every timezone. That single line
    // is why 6 of 8 upcoming cohorts carried a course_start_date on the wrong
    // weekday. ymdFromInstant reads the Singapore calendar date instead.
    const startDate = courseInfo.startDate ? ymdFromInstant(courseInfo.startDate) : null;
    const endDate = courseInfo.endDate ? ymdFromInstant(courseInfo.endDate) : null;

    // Calculate allocations first (needed for both enrollment and customer update)
    const defaultWeeks = courseInfo.courseType && courseInfo.courseType.toLowerCase().includes('handbuilding') ? 4 : 6;
    const weeksPerCourse = courseInfo.numberOfWeeks || defaultWeeks;
    // Classes from this purchase: base course weeks × packages + any extra flex classes
    const classesFromThisPurchase = (weeksPerCourse * coursesInPackage) + extraFlexClasses;
    const coursePurchaseIncrement = coursesInPackage;
    console.log(`📊 This purchase: ${classesFromThisPurchase} classes (${weeksPerCourse}×${coursesInPackage} + ${extraFlexClasses} flex) — recorded on the enrollment, not on the customer`);

    // Create course enrollment record
    // For flex/pool packages, store total classes as numberOfWeeks so remaining calc works
    const enrollmentWeeks = extraFlexClasses > 0 ? classesFromThisPurchase : courseInfo.numberOfWeeks;

    const enrollmentData = {
      studentId: student.id,
      shopifyOrderId: order.id,
      shopifyLineItemId: lineItem.id,
      courseTitle: lineItem.title,
      courseVariantTitle: lineItem.variantTitle,
      courseType: courseInfo.courseType,
      schedulePattern: courseInfo.schedulePattern,
      numberOfWeeks: enrollmentWeeks,
      courseStartDate: startDate,
      courseEndDate: endDate,
      classTime: courseInfo.classTime,
      instructor: courseInfo.instructor,
      room: courseInfo.room,
      status: 'active'
    };

    // Add package information if this is a multi-course package
    if (isPackage) {
      enrollmentData.packageTotalCourses = coursesInPackage > 1 ? coursesInPackage : null;
      enrollmentData.packageTotalClasses = classesFromThisPurchase; // Classes from THIS purchase only
      enrollmentData.packageCoursesRemaining = coursesInPackage > 1 ? coursesInPackage - 1 : null;
      console.log(`📦 Package enrollment: ${classesFromThisPurchase} classes from this purchase`);
    }

    // For 10-class packages (6 WT + 4 flex), set flex credits at creation time
    if (extraFlexClasses > 0 && !isHandbuilding) {
      enrollmentData.totalWeeks = weeksPerCourse; // base WT course weeks (6)
      enrollmentData.classCreditsAllocated = extraFlexClasses; // flex credits (4)
      enrollmentData.classCreditsUsed = 0;
      enrollmentData.classCreditsRemaining = extraFlexClasses;
      console.log(`🎯 10-class package: ${weeksPerCourse} base WT weeks + ${extraFlexClasses} flex credits allocated at creation`);
    }

    const enrollment = await createCourseEnrollment(enrollmentData);

    console.log(`✅ Created enrollment ${enrollment.id} for ${student.email} - ${courseInfo.courseType}`);

    // customers.classes_allocated is deliberately no longer written. It was
    // additive on every purchase and never decremented, so it became a lifetime
    // running total that overstated what students were owed — one reached 34 —
    // and it granted classes nobody bought because booking eligibility read it
    // first. The allocation lives on the enrollment, where it can be spent,
    // closed and audited; getStudentAllocation reads it back.
    await updateCustomer(student.id, {
      course_purchase_count: (student.course_purchase_count || 0) + coursePurchaseIncrement
    });

    if (isPackage) {
      console.log(`📦 Package: ${classesFromThisPurchase} classes (${weeksPerCourse} × ${coursesInPackage} courses), course count now ${(student.course_purchase_count || 0) + coursePurchaseIncrement}`);
    }

    // Handbuilding courses use credit system with auto-booking into chosen day
    if (courseInfo.courseType && courseInfo.courseType.toLowerCase().includes('handbuilding')) {
      const credits = courseInfo.numberOfWeeks || 4; // 4 or 8 class credits

      // Update enrollment with credit allocation
      await updateCourseEnrollment(enrollment.id, {
        status: 'active',
        class_credits_allocated: credits,
        class_credits_used: 0,
        class_credits_remaining: credits,
        glazing_class_used: false
      });

      console.log(`🎨 Handbuilding enrollment: ${credits} credits allocated (student self-books)`);

      return {
        success: true,
        enrollment,
        isHandbuilding: true,
        creditsAllocated: credits,
        bookingsCreated: 0,
        message: `${credits} class credits allocated. Student will book their own classes.`
      };
    }

    // For Wheelthrowing: Check if threshold is met for this cohort
    const result = await checkAndProcessThreshold(enrollment);

    return {
      success: true,
      enrollment,
      ...result
    };

  } catch (error) {
    console.error('Error processing course purchase:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Enroll all "pax" (spots) for a course line item, honoring quantity.
 * A quantity of 2 means the customer bought 2 spots (e.g. for a partner/friend),
 * so we create one enrollment per spot — NOT a single enrollment. Extra spots get
 * their own duplicate customer record (email +dup alias) so each person has their
 * own account/portfolio, mirroring the multi-pax logic used by the main order sync.
 *
 * Idempotent: extra-pax customers are created only if missing, and processCoursePurchase
 * dedupes each spot by (shopify_order_id, shopify_line_item_id) — the per-pax id suffix
 * keeps the spots distinct so re-syncing does not collapse them back into one.
 *
 * @param {Object} params
 * @param {Object} params.order - Order object (as passed to processCoursePurchase)
 * @param {Object} params.lineItem - Line item object (as passed to processCoursePurchase)
 * @param {Object} params.customer - { email, firstName, lastName } for the buyer
 * @param {number} params.quantity - Purchased quantity (number of spots)
 * @returns {Promise<Array>} Array of per-spot results from processCoursePurchase
 */
async function enrollAllPax({ order, lineItem, customer, quantity }) {
  const paxCount = Math.max(1, quantity || 1);
  if (paxCount > 1) {
    console.log(`👥 ${paxCount}-pax order detected for ${customer.email} - ${lineItem.title}`);
  }

  const results = [];
  const extraPaxPlaceholders = [];
  for (let paxIndex = 0; paxIndex < paxCount; paxIndex++) {
    const isExtraPax = paxIndex > 0;
    const paxSuffix = isExtraPax ? `-${paxIndex + 1}` : '';
    const paxEmail = isExtraPax
      ? customer.email.replace('@', `+dup${paxIndex > 1 ? paxIndex : ''}@`)
      : customer.email;

    if (isExtraPax) {
      // Create a duplicate customer record for the extra spot (own account/portfolio).
      // Surfaces failures instead of swallowing them (see createDuplicatePaxCustomer).
      try {
        const placeholder = await createDuplicatePaxCustomer({
          baseEmail: customer.email,
          paxEmail,
          firstName: customer.firstName || '',
          lastName: `${customer.lastName || ''} (${paxIndex + 1})`,
          paxIndex
        });
        extraPaxPlaceholders.push(placeholder);
      } catch (err) {
        console.error(`❌ Could not create extra-pax customer ${paxEmail}:`, err.message);
        results.push({ success: false, error: err.message, paxEmail });
        continue; // skip this spot; do not lose the whole order
      }
    }

    const paxOrder = {
      ...order,
      customer: {
        ...order.customer,
        email: paxEmail,
        // Must be set explicitly, not inherited from the spread: it suppresses the
        // Shopify-ID fallback in processCoursePurchase, which would otherwise
        // collapse every extra spot onto the purchaser's row.
        isExtraPax,
        first_name: isExtraPax ? (customer.firstName || '') : order.customer.first_name,
        last_name: isExtraPax ? `${customer.lastName || ''} (${paxIndex + 1})` : order.customer.last_name
      }
    };
    const paxLineItem = { ...lineItem, id: `${lineItem.id}${paxSuffix}` };

    console.log(`🎓 Processing pax ${paxIndex + 1}/${paxCount}: ${paxEmail} - ${lineItem.title}`);
    results.push(await processCoursePurchase(paxOrder, paxLineItem));
  }

  // One details-request email for the whole order covering every extra spot
  // (idempotent inside — re-syncs never re-email the purchaser).
  if (extraPaxPlaceholders.length > 0) {
    const { createStudentDetailsRequests } = require('./studentDetailsRequest');
    createStudentDetailsRequests({
      placeholders: extraPaxPlaceholders,
      purchaserEmail: customer.email,
      purchaserFirstName: customer.firstName || '',
      courseTitle: lineItem.title,
      orderId: order.id,
    }).catch(err => console.error('[StudentDetails] request failed:', err.message));
  }

  return results;
}

/**
 * Check cohort status and create/update classes automatically
 * @param {Object} newEnrollment - The newly created course enrollment
 * @returns {Promise<Object>} Result object with created class instances and bookings
 */
async function checkAndProcessThreshold(newEnrollment) {
  try {
    // Find all enrollments in the same cohort (uses normalized time matching)
    const cohortEnrollments = await findCohortEnrollmentsFlexible(
      newEnrollment.course_type,
      newEnrollment.course_start_date,
      newEnrollment.schedule_pattern,
      newEnrollment.class_time
    );

    const studentCount = cohortEnrollments.length;

    console.log(`📊 Cohort ${newEnrollment.course_type} (${newEnrollment.schedule_pattern}s ${newEnrollment.class_time} starting ${newEnrollment.course_start_date}): ${studentCount} students`);

    // Update pending student count for all enrollments in cohort
    for (const enrollment of cohortEnrollments) {
      await updateCourseEnrollment(enrollment.id, {
        pendingStudentCount: studentCount
      });
    }

    // Check if any cohort peer already has bookings we can copy.
    //
    // A peer only qualifies if the classes it is actually booked into belong to
    // THIS cohort — same weekday, same start date. A peer can be sitting in a
    // different cohort's classes (an admin moves someone to another day, which
    // rewrites their course_identifier but leaves their cohort key alone), and
    // copying that peer books every later buyer into the wrong cohort. That is
    // exactly how three Thursday 10 Sep students ended up in the Tuesday 8 Sep
    // classes. bookings_created_at is not proof on its own — it is stamped even
    // when the booking insert failed and the peer holds no bookings at all.
    const enrollmentWithBookings = await findCopyablePeer(newEnrollment, cohortEnrollments);

    if (enrollmentWithBookings) {
      console.log(`✅ Cohort already has classes, adding student to existing classes`);
      const result = await addStudentToExistingCohort(newEnrollment, enrollmentWithBookings);

      // If this is the threshold student, activate the draft classes
      const minThreshold = getMinStudentsThreshold(null);
      if (studentCount === minThreshold) {
        console.log(`🎉 Threshold met! Activating draft classes...`);
        await activateDraftClasses(enrollmentWithBookings);
      }

      return result;
    }

    // No peer has bookings — create new class instances for this cohort
    // Each cohort (course type + schedule + time) gets its own classes
    const cohortMinThreshold = getMinStudentsThreshold(null);
    const classStatus = studentCount >= cohortMinThreshold ? 'active' : 'draft';

    if (classStatus === 'draft') {
      console.log(`📝 Creating DRAFT classes for ${studentCount} student(s) (waiting for ${cohortMinThreshold - studentCount} more to activate)`);
    } else {
      console.log(`🎉 Creating ACTIVE classes for ${studentCount} students (threshold met!)`);
    }

    return await createClassesAndBookings(cohortEnrollments, classStatus);

  } catch (error) {
    console.error('Error checking threshold:', error);
    throw error;
  }
}

/**
 * Normalize time string for comparison (lowercase, no spaces)
 */
function normalizeTime(t) {
  return (t || '').toLowerCase().replace(/\s+/g, '');
}

/**
 * The base course identifier an enrollment is ACTUALLY booked into, read from
 * its bookings rather than from its course_identifier column. Null when it
 * holds no bookings, whatever bookings_created_at claims.
 */
async function bookedCourseBase(enrollmentId) {
  const { data } = await supabase
    .from('bookings')
    .select('class_instances!bookings_class_instance_id_fkey(class_type)')
    .eq('course_enrollment_id', enrollmentId)
    .limit(1);

  const classType = data?.[0]?.class_instances?.class_type || '';
  return classType ? classType.replace(/\.\d+$/, '') : null;
}

/**
 * The cohort peer whose bookings are safe to copy for a new enrollment.
 *
 * Membership of a cohort is decided by the enrollment's key (start date +
 * schedule + time), but the classes get copied from a peer's BOOKINGS, and the
 * two can disagree: move a student to another day and their bookings leave the
 * cohort while their key stays behind. So a peer only qualifies when the
 * classes it sits in start on this cohort's start date and fall on its weekday.
 *
 * Returns null when no peer qualifies — the caller then builds this cohort's own
 * classes instead of inheriting somebody else's.
 */
async function findCopyablePeer(newEnrollment, cohortEnrollments) {
  const wantStart = toYmd(newEnrollment.course_start_date);
  const wantDay = String(newEnrollment.schedule_pattern || '').toUpperCase().replace(/S$/, '');

  for (const peer of cohortEnrollments) {
    if (!peer.bookings_created_at) continue;

    const base = await bookedCourseBase(peer.id);
    if (!base) {
      console.warn(`[Cohort] Peer ${peer.id} is stamped as booked but holds no bookings — not copying it`);
      continue;
    }

    const { data: firstClass } = await supabase
      .from('class_instances')
      .select('class_date')
      .ilike('class_type', `${base}.%`)
      .order('class_date', { ascending: true })
      .limit(1);

    const firstDate = toYmd(firstClass?.[0]?.class_date);
    const startsRight = !wantStart || firstDate === wantStart;
    const fallsRight = !wantDay || isWeekday(firstDate, wantDay);

    if (!firstDate || !startsRight || !fallsRight) {
      console.warn(`[Cohort] Peer ${peer.id} is booked into ${base} starting ${firstDate} — not this cohort (${wantDay} ${wantStart}). Not copying it.`);
      continue;
    }

    return peer;
  }

  return null;
}

/**
 * Find cohort enrollments with flexible time matching
 * Handles format differences like "1:00 PM" vs "1:00pm"
 */
async function findCohortEnrollmentsFlexible(courseType, startDate, schedulePattern, classTime) {
  // First try exact match
  const exact = await findCohortEnrollments(courseType, startDate, schedulePattern, classTime);
  if (exact.length > 0) return exact;

  // Fallback: query by course_type + start_date + schedule, then filter by normalized time
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('course_type', courseType)
    .eq('course_start_date', startDate)
    .eq('schedule_pattern', schedulePattern)
    .eq('status', 'active');

  if (error) throw error;

  const normTarget = normalizeTime(classTime);
  return (data || []).filter(e => normalizeTime(e.class_time) === normTarget);
}

/**
 * Find existing class instances in DB that match an enrollment's schedule
 */
async function findExistingClassInstances(enrollment) {
  const day = (enrollment.schedule_pattern || '').toUpperCase().replace(/S$/, '');
  const dayNum = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 }[day];

  if (dayNum === undefined) return [];

  const startDate = enrollment.course_start_date;
  const endDate = enrollment.course_end_date;

  // Query class instances in the date range
  let query = supabase.from('class_instances')
    .select('id, class_date, class_type, start_time, status')
    .ilike('class_type', 'WT%')
    .order('class_date');

  if (startDate) query = query.gte('class_date', startDate);
  if (endDate) {
    // Add 2-day buffer to end date to account for timezone conversion issues
    // (e.g., "10 Apr" SGT stored as "2026-04-09" UTC can miss the last class on Apr 10)
    const bufferedEnd = new Date(endDate);
    bufferedEnd.setDate(bufferedEnd.getDate() + 2);
    const bufferedEndStr = bufferedEnd.toISOString().split('T')[0];
    query = query.lte('class_date', bufferedEndStr);
  }

  const { data: allClasses } = await query;

  // Filter by day of week
  const dayMatches = (allClasses || []).filter(c => {
    const d = new Date(c.class_date);
    return d.getDay() === dayNum;
  });

  if (dayMatches.length === 0) return [];

  // Normalize enrollment time for matching
  const enrollTimeNorm = normalizeTime((enrollment.class_time || '').split('-')[0].split('–')[0]);

  // Filter by matching start time
  const timeMatches = dayMatches.filter(c => {
    const classTimeNorm = normalizeTime(c.start_time);
    return classTimeNorm === enrollTimeNorm;
  });

  // Only return classes that match the enrollment's time slot
  // No fallback to day-only matching — wrong time = wrong class
  return timeMatches;
}

/**
 * Link all cohort students to existing class instances (create bookings)
 */
async function linkStudentsToExistingClasses(cohortEnrollments, classInstances) {
  const now = new Date().toISOString();
  let totalBookings = 0;

  for (const enrollment of cohortEnrollments) {
    // Skip if already has bookings
    if (enrollment.bookings_created_at) continue;

    // Filter out classes that are already full. roomCapacity() is the same cap
    // the booking gate applies, so a 6-week WT's weeks 4 and 5 correctly show
    // their eleventh place here rather than turning a paid-up signup away.
    const availableInstances = [];
    for (const ci of classInstances) {
      const cap = roomCapacity(ci);
      const { count } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('class_instance_id', ci.id)
        .eq('status', 'booked');
      if (count < cap) {
        availableInstances.push(ci);
      } else {
        console.warn(`[Enrollment] Skipping class ${ci.id} (${ci.class_type}) — full (${count}/${cap})`);
      }
    }

    const bookingsToCreate = availableInstances.map(ci => ({
      student_id: enrollment.student_id,
      class_instance_id: ci.id,
      status: 'booked',
      booking_type: 'regular',
      course_enrollment_id: enrollment.id,
      booking_date: now,
      created_at: now,
      updated_at: now
    }));

    const { data: created, error } = await supabase
      .from('bookings')
      .insert(bookingsToCreate)
      .select();

    if (error) {
      console.error(`Error creating bookings for enrollment ${enrollment.id}:`, error.message);
      continue;
    }

    totalBookings += (created || []).length;

    await updateCourseEnrollment(enrollment.id, {
      status: 'active',
      bookingsCreatedAt: now
    });

    console.log(`✅ Created ${(created || []).length} bookings for student ${enrollment.student_id}`);
  }

  return {
    thresholdMet: cohortEnrollments.length >= getMinStudentsThreshold(null),
    linkedToExisting: true,
    bookingsCreated: totalBookings,
    studentsEnrolled: cohortEnrollments.length,
    classInstances: classInstances
  };
}

/**
 * Create class instances and bookings for all students in a cohort
 * @param {Array} cohortEnrollments - All enrollments in the cohort
 * @param {String} classStatus - Status of classes: 'draft' or 'active' (default: 'active')
 * @returns {Promise<Object>} Created class instances and bookings
 */
async function createClassesAndBookings(cohortEnrollments, classStatus = 'active') {
  try {
    // Get course info from the first enrollment
    const firstEnrollment = cohortEnrollments[0];

    // Parse course info to generate class dates
    const courseInfo = {
      courseType: firstEnrollment.course_type,
      startDate: new Date(firstEnrollment.course_start_date),
      endDate: firstEnrollment.course_end_date ? new Date(firstEnrollment.course_end_date) : null,
      schedulePattern: firstEnrollment.schedule_pattern,
      // WT cohort length is the base course block (total_weeks, e.g. 6), NOT the
      // package total. For a "10 Classes" package number_of_weeks=10 but total_weeks=6
      // (+4 flex credits booked separately) — using number_of_weeks here would both
      // over-schedule the cohort and mislabel it as WT..._DL10.x instead of _DL6.x.
      numberOfWeeks: firstEnrollment.total_weeks || firstEnrollment.number_of_weeks,
      classTime: firstEnrollment.class_time,
      instructor: firstEnrollment.instructor,
      room: firstEnrollment.room
    };

    // Get appropriate instructor for this course type and schedule
    const instructor = getInstructorForCourse(firstEnrollment.course_type, firstEnrollment.schedule_pattern);

    // Intermediate courses use Studio B, others use Studio A
    const isIntermediate = (firstEnrollment.course_type || '').toLowerCase().includes('intermediate');
    const defaultRoom = isIntermediate ? 'Studio B' : 'Studio A';

    // Generate class instance objects
    const classInstanceObjects = generateClassInstanceObjects(courseInfo, {
      instructorName: firstEnrollment.instructor || instructor.name,
      instructorCode: instructor.code,
      room: firstEnrollment.room || defaultRoom,
      maxCapacity: 10,
      startTime: courseInfo.classTime ? courseInfo.classTime.split(' - ')[0] : '7:00 PM',
      endTime: courseInfo.classTime ? courseInfo.classTime.split(' - ')[1] : '9:30 PM'
    });

    // Set current enrollment count and status
    classInstanceObjects.forEach(instance => {
      instance.current_enrollment = cohortEnrollments.length;
      instance.status = classStatus; // Set draft or active status
    });

    // Reuse this cohort's classes if they already exist. They do whenever an
    // earlier student in the same slot created them, and (date, time, room) is
    // unique — so blindly inserting would throw and leave the enrollment with no
    // bookings at all. Only the missing weeks get created.
    const { data: alreadyThere } = await supabase
      .from('class_instances')
      .select('id, class_date, class_type, start_time, room, status')
      .in('class_date', classInstanceObjects.map(o => o.class_date))
      .eq('start_time', classInstanceObjects[0].start_time)
      .eq('room', classInstanceObjects[0].room);

    const existingByDate = new Map((alreadyThere || []).map(ci => [toYmd(ci.class_date), ci]));
    const missing = classInstanceObjects.filter(o => !existingByDate.has(o.class_date));

    if (existingByDate.size > 0) {
      console.log(`♻️  ${existingByDate.size} class instance(s) for this cohort already exist — reusing them`);
    }

    console.log(`📅 Creating ${missing.length} ${classStatus.toUpperCase()} class instances...`);
    const freshClasses = missing.length > 0 ? await createClassInstances(missing) : [];

    // Keep the cohort in week order however the weeks were sourced.
    const createdClasses = classInstanceObjects
      .map(o => existingByDate.get(o.class_date) || freshClasses.find(c => toYmd(c.class_date) === o.class_date))
      .filter(Boolean);

    console.log(`✅ Cohort has ${createdClasses.length} class instances (${freshClasses.length} new)`);

    // Create bookings for all students in the cohort, skipping any week a
    // student is already booked into.
    const bookingsToCreate = [];
    const { data: heldBookings } = await supabase
      .from('bookings')
      .select('student_id, class_instance_id')
      .in('student_id', cohortEnrollments.map(e => e.student_id))
      .in('class_instance_id', createdClasses.map(c => c.id))
      .eq('status', 'booked');
    const alreadyHeld = new Set((heldBookings || []).map(b => `${b.student_id}:${b.class_instance_id}`));

    const bookingNow = new Date().toISOString();
    for (const enrollment of cohortEnrollments) {
      for (const classInstance of createdClasses) {
        if (alreadyHeld.has(`${enrollment.student_id}:${classInstance.id}`)) continue;
        bookingsToCreate.push({
          student_id: enrollment.student_id,
          class_instance_id: classInstance.id,
          status: 'booked',
          booking_type: 'regular',
          course_enrollment_id: enrollment.id,
          booking_date: bookingNow,
          created_at: bookingNow,
          updated_at: bookingNow
        });
      }
    }

    console.log(`📚 Creating ${bookingsToCreate.length} bookings for ${cohortEnrollments.length} students...`);
    const createdBookings = bookingsToCreate.length > 0
      ? await createMultipleBookings(bookingsToCreate)
      : [];

    console.log(`✅ Created ${createdBookings.length} bookings`);

    // Sync new class instances to Google Calendar (fire-and-forget)
    try {
      const calendarSync = require('./calendarSync');
      createdClasses.forEach(c => calendarSync.syncClassInstance(c.id).catch(() => {}));
    } catch (e) { /* ignore */ }

    // Derive course_identifier from created class instances
    const baseCourseId = createdClasses.length > 0
      ? (createdClasses[0].class_type || '').replace(/\.\d+$/, '')
      : null;

    // Update all enrollments with booking timestamps and course_identifier
    const now = new Date().toISOString();
    for (const enrollment of cohortEnrollments) {
      const updateData = {
        status: 'active',
        thresholdMetAt: now,
        bookingsCreatedAt: now
      };
      if (baseCourseId) updateData.course_identifier = baseCourseId;
      await updateCourseEnrollment(enrollment.id, updateData);
    }

    return {
      thresholdMet: true,
      classInstancesCreated: createdClasses.length,
      bookingsCreated: createdBookings.length,
      studentsEnrolled: cohortEnrollments.length,
      classInstances: createdClasses,
      bookings: createdBookings
    };

  } catch (error) {
    console.error('Error creating classes and bookings:', error);
    throw error;
  }
}

/**
 * Add a new student to an existing confirmed cohort
 * @param {Object} newEnrollment - The new enrollment
 * @param {Object} existingEnrollment - An existing confirmed enrollment from the same cohort
 * @returns {Promise<Object>} Created bookings for the new student
 */
async function addStudentToExistingCohort(newEnrollment, existingEnrollment) {
  try {
    // Find all class instances for this cohort by looking up class instances directly
    // (not from peer bookings, which can be incomplete due to race conditions)
    const { supabase } = require('./supabaseDb');

    // First get one booking to find the course identifier pattern
    // Base course identifier (e.g. WT0503NT_JL6 from WT0503NT_JL6.1), read from
    // the peer's bookings — where the peer actually sits, not where its
    // course_identifier says it should.
    const baseCourseId = await bookedCourseBase(existingEnrollment.id);

    if (!baseCourseId) {
      throw new Error('No existing bookings found for confirmed cohort');
    }

    // Get ALL class instances matching this course (ensures we get .6 even if peer is missing it)
    const { data: allClassInstances } = await supabase
      .from('class_instances')
      .select('id')
      .ilike('class_type', `${baseCourseId}.%`)
      .order('class_date', { ascending: true });

    if (!allClassInstances || allClassInstances.length === 0) {
      throw new Error('No class instances found for course ' + baseCourseId);
    }

    // Never book a class the student already holds — this path is re-entered by
    // the admin threshold re-check, and a plain insert would hand them a second
    // row for every week.
    const { data: heldBookings } = await supabase
      .from('bookings')
      .select('class_instance_id')
      .eq('student_id', newEnrollment.student_id)
      .eq('status', 'booked');
    const alreadyHeld = new Set((heldBookings || []).map(b => b.class_instance_id));

    const classInstanceIds = allClassInstances
      .map(ci => ci.id)
      .filter(id => !alreadyHeld.has(id));

    // Create bookings for the new student
    const addNow = new Date().toISOString();
    const bookingsToCreate = classInstanceIds.map(classInstanceId => ({
      student_id: newEnrollment.student_id,
      class_instance_id: classInstanceId,
      status: 'booked',
      booking_type: 'regular',
      course_enrollment_id: newEnrollment.id,
      booking_date: addNow,
      created_at: addNow,
      updated_at: addNow
    }));

    console.log(`📚 Adding ${bookingsToCreate.length} bookings for new student...`);
    const createdBookings = bookingsToCreate.length > 0
      ? await createMultipleBookings(bookingsToCreate)
      : [];

    // Increment enrollment count for all class instances
    for (const classInstanceId of classInstanceIds) {
      const { updateClassEnrollment } = require('./supabaseDb');
      await updateClassEnrollment(classInstanceId, 1);
    }

    // Update enrollment with booking timestamp and course_identifier
    const enrollUpdate = {
      status: 'active',
      bookingsCreatedAt: new Date().toISOString()
    };
    if (baseCourseId) enrollUpdate.course_identifier = baseCourseId;
    await updateCourseEnrollment(newEnrollment.id, enrollUpdate);

    console.log(`✅ Added student to existing cohort with ${createdBookings.length} bookings (${baseCourseId})`);

    // Sync affected class instances to Google Calendar (fire-and-forget)
    try {
      const calendarSync = require('./calendarSync');
      classInstanceIds.forEach(id => calendarSync.syncClassInstance(id).catch(() => {}));
    } catch (e) { /* ignore */ }

    return {
      thresholdMet: true,
      addedToExistingCohort: true,
      bookingsCreated: createdBookings.length,
      bookings: createdBookings
    };

  } catch (error) {
    console.error('Error adding student to existing cohort:', error);
    throw error;
  }
}

/**
 * Activate draft classes when threshold is met
 * @param {Object} enrollment - Any enrollment in the cohort
 * @returns {Promise<Number>} Number of classes activated
 */
async function activateDraftClasses(enrollment) {
  try {
    const { supabase } = require('./supabaseDb');

    // Find all class instances for this cohort
    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('class_instance_id')
      .eq('course_enrollment_id', enrollment.id);

    if (!existingBookings || existingBookings.length === 0) {
      console.log('⚠️  No bookings found to activate');
      return 0;
    }

    const classInstanceIds = [...new Set(existingBookings.map(b => b.class_instance_id))];

    // Update all draft classes to active
    const { data: updatedClasses, error } = await supabase
      .from('class_instances')
      .update({ status: 'active' })
      .in('id', classInstanceIds)
      .eq('status', 'draft')
      .select();

    if (error) {
      console.error('Error activating draft classes:', error);
      throw error;
    }

    const activatedCount = updatedClasses ? updatedClasses.length : 0;
    console.log(`✅ Activated ${activatedCount} draft classes to ACTIVE status`);

    // Award deferred VES Credits to all returning students in this cohort
    try {
      const { isReturningStudent, earnCredits, getCreditBalance } = require('./creditManager');
      const { sendEmail } = require('./emailService');

      // Find all enrollments in this cohort
      const { data: cohortBookings } = await supabase
        .from('bookings')
        .select('course_enrollment_id, student_id')
        .in('class_instance_id', classInstanceIds);

      const enrollmentIds = [...new Set((cohortBookings || []).map(b => b.course_enrollment_id).filter(Boolean))];
      const { data: cohortEnrollments } = await supabase
        .from('course_enrollments')
        .select('id, student_id, course_title, course_type')
        .in('id', enrollmentIds);

      for (const enr of (cohortEnrollments || [])) {
        try {
          const returning = await isReturningStudent(enr.student_id);
          if (!returning) continue;

          // Check if credit was already awarded for this enrollment
          const { data: existingCredit } = await supabase
            .from('credit_transactions')
            .select('id')
            .eq('customer_id', enr.student_id)
            .eq('source', 'course_purchase')
            .eq('reference_id', enr.id.toString())
            .maybeSingle();

          if (existingCredit) continue;

          await earnCredits({
            customerId: enr.student_id,
            amount: 20,
            source: 'course_purchase',
            referenceId: enr.id.toString(),
            description: `Ves is 10 — $20 credit for ${enr.course_title || enr.course_type || 'course'}`,
          });
          console.log(`💰 Awarded deferred $20 VES Credit to student ${enr.student_id} (course confirmed)`);

          // Send credit earned email (credits category may be paused)
          const { data: student } = await supabase.from('customers').select('email, first_name').eq('id', enr.student_id).single();
          const { isEmailCategoryPaused } = require('./emailService');
          if (student?.email && isEmailCategoryPaused('credits')) {
            console.log(`[Credits] Email paused — skipping deferred credit email to ${student.email}`);
          } else if (student?.email) {
            try {
              const { generate: generateCreditEarned } = require('../email-templates/credits-earned');
              const newBalance = await getCreditBalance(enr.student_id);
              const { subject, html } = generateCreditEarned({
                firstName: student.first_name,
                amountEarned: 20,
                courseName: enr.course_title || enr.course_type || 'your course',
                newBalance,
              });
              await sendEmail({ to: student.email, subject, html });
            } catch (emailErr) {
              console.error(`[Credits] Failed to send credit email to ${student.email}:`, emailErr);
            }
          }
        } catch (creditErr) {
          console.error(`[Credits] Failed to award deferred credit to student ${enr.student_id}:`, creditErr);
        }
      }
    } catch (err) {
      console.error('[Credits] Failed to process deferred credits on activation:', err);
    }

    return activatedCount;

  } catch (error) {
    console.error('Error activating draft classes:', error);
    throw error;
  }
}

module.exports = {
  processCoursePurchase,
  enrollAllPax,
  checkAndProcessThreshold,
  createClassesAndBookings,
  addStudentToExistingCohort,
  activateDraftClasses,
  linkStudentsToExistingClasses,
  findExistingClassInstances,
  getInstructorForCourse,
  normalizeTime,
  findCopyablePeer,
  bookedCourseBase,
  MINIMUM_STUDENTS_THRESHOLD
};
