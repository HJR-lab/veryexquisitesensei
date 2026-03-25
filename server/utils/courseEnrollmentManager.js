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
  updateCustomer
} = require('./supabaseDb');

const MINIMUM_STUDENTS_THRESHOLD = 4;

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
    // Find or create student record
    const student = await findCustomerByEmail(order.customer.email);

    if (!student) {
      console.log(`⚠️  Customer ${order.customer.email} not found in database`);
      return {
        success: false,
        error: 'Customer not found in database'
      };
    }

    // Check for duplicate enrollment (same order + line item)
    const { data: existingEnrollment } = await supabase
      .from('course_enrollments')
      .select('id')
      .eq('shopify_order_id', order.id)
      .eq('shopify_line_item_id', lineItem.id)
      .maybeSingle();

    if (existingEnrollment) {
      console.log(`⏭️  Enrollment already exists for order ${order.id} / item ${lineItem.id}, skipping`);
      return { success: true, skipped: true, enrollment: existingEnrollment };
    }

    // Parse course information from Shopify product
    const courseInfo = parseCourseInfo(lineItem.title, lineItem.variantTitle);

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

    // Format dates for database (may be null for HB credit courses)
    const startDate = courseInfo.startDate ? courseInfo.startDate.toISOString().split('T')[0] : null;
    const endDate = courseInfo.endDate ? courseInfo.endDate.toISOString().split('T')[0] : null;

    // Calculate allocations first (needed for both enrollment and customer update)
    const defaultWeeks = courseInfo.courseType && courseInfo.courseType.toLowerCase().includes('handbuilding') ? 4 : 6;
    const weeksPerCourse = courseInfo.numberOfWeeks || defaultWeeks;
    // Classes from this purchase: base course weeks × packages + any extra flex classes
    const classesFromThisPurchase = (weeksPerCourse * coursesInPackage) + extraFlexClasses;
    // ADDITIVE: add to existing allocation (each purchase adds classes to the pool)
    const totalClassesAllocated = (student.classes_allocated || 0) + classesFromThisPurchase;
    const coursePurchaseIncrement = coursesInPackage;
    console.log(`📊 Allocation: ${student.classes_allocated || 0} existing + ${classesFromThisPurchase} new (${weeksPerCourse}×${coursesInPackage} + ${extraFlexClasses} flex) = ${totalClassesAllocated} total`);

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

    const enrollment = await createCourseEnrollment(enrollmentData);

    console.log(`✅ Created enrollment ${enrollment.id} for ${student.email} - ${courseInfo.courseType}`);

    await updateCustomer(student.id, {
      classes_allocated: totalClassesAllocated,
      course_purchase_count: (student.course_purchase_count || 0) + coursePurchaseIncrement
    });

    if (isPackage) {
      console.log(`📦 Package: Allocated ${totalClassesAllocated} classes (${weeksPerCourse} × ${coursesInPackage} courses), course count now ${(student.course_purchase_count || 0) + coursePurchaseIncrement}`);
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

      console.log(`🎨 Handbuilding enrollment: ${credits} credits allocated`);

      // Book into upcoming HB class instances for the student's chosen day
      let hbBookingsCreated = 0;
      if (courseInfo.schedulePattern) {
        const dayMap = { MONDAY: 'MON', TUESDAY: 'TUE', WEDNESDAY: 'WED', THURSDAY: 'THU', FRIDAY: 'FRI', SATURDAY: 'SAT', SUNDAY: 'SUN' };
        const dayCode = dayMap[courseInfo.schedulePattern.toUpperCase()] || '';

        if (dayCode) {
          // Find upcoming HB class instances for this day (e.g., HBMONNT_LT, HBSATEV_LT)
          const today = new Date().toISOString().split('T')[0];
          const { data: hbClasses } = await supabase
            .from('class_instances')
            .select('id, class_date, class_type')
            .ilike('class_type', `HB${dayCode}%`)
            .gte('class_date', today)
            .order('class_date', { ascending: true })
            .limit(credits);

          if (hbClasses && hbClasses.length > 0) {
            const bookingNow = new Date().toISOString();
            const hbBookings = hbClasses.map(ci => ({
              student_id: student.id,
              class_instance_id: ci.id,
              status: 'booked',
              booking_type: 'regular',
              course_enrollment_id: enrollment.id,
              booking_date: bookingNow,
              created_at: bookingNow,
              updated_at: bookingNow
            }));

            const created = await createMultipleBookings(hbBookings);
            hbBookingsCreated = created.length;

            console.log(`📅 Booked ${hbBookingsCreated} HB classes on ${courseInfo.schedulePattern}s`);
          } else {
            console.log(`⚠️  No upcoming HB class instances found for ${dayCode}`);
          }
        }
      }

      return {
        success: true,
        enrollment,
        isHandbuilding: true,
        creditsAllocated: credits,
        bookingsCreated: hbBookingsCreated,
        message: `${credits} class credits allocated, ${hbBookingsCreated} classes booked.`
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

    // Check if any cohort peer already has bookings
    const enrollmentWithBookings = cohortEnrollments.find(e => e.bookings_created_at);

    if (enrollmentWithBookings) {
      console.log(`✅ Cohort already has classes, adding student to existing classes`);
      const result = await addStudentToExistingCohort(newEnrollment, enrollmentWithBookings);

      // If this is the 4th student, activate the draft classes
      if (studentCount === MINIMUM_STUDENTS_THRESHOLD) {
        console.log(`🎉 Threshold met! Activating draft classes...`);
        await activateDraftClasses(enrollmentWithBookings);
      }

      return result;
    }

    // No peer has bookings — create new class instances for this cohort
    // Each cohort (course type + schedule + time) gets its own classes
    const classStatus = studentCount >= MINIMUM_STUDENTS_THRESHOLD ? 'active' : 'draft';

    if (classStatus === 'draft') {
      console.log(`📝 Creating DRAFT classes for ${studentCount} student(s) (waiting for ${MINIMUM_STUDENTS_THRESHOLD - studentCount} more to activate)`);
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

    const bookingsToCreate = classInstances.map(ci => ({
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
    thresholdMet: cohortEnrollments.length >= MINIMUM_STUDENTS_THRESHOLD,
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
      numberOfWeeks: firstEnrollment.number_of_weeks,
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

    // Create class instances in database
    console.log(`📅 Creating ${classInstanceObjects.length} ${classStatus.toUpperCase()} class instances...`);
    const createdClasses = await createClassInstances(classInstanceObjects);

    console.log(`✅ Created ${createdClasses.length} class instances`);

    // Create bookings for all students in the cohort
    const bookingsToCreate = [];

    const bookingNow = new Date().toISOString();
    for (const enrollment of cohortEnrollments) {
      for (const classInstance of createdClasses) {
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
    const createdBookings = await createMultipleBookings(bookingsToCreate);

    console.log(`✅ Created ${createdBookings.length} bookings`);

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
    const { data: sampleBooking } = await supabase
      .from('bookings')
      .select('class_instance_id, class_instances!bookings_class_instance_id_fkey(class_type)')
      .eq('course_enrollment_id', existingEnrollment.id)
      .limit(1)
      .single();

    if (!sampleBooking) {
      throw new Error('No existing bookings found for confirmed cohort');
    }

    // Extract base course identifier (e.g. WT0503NT_JL6 from WT0503NT_JL6.1)
    const classType = sampleBooking.class_instances?.class_type || '';
    const baseCourseId = classType.replace(/\.\d+$/, '');

    // Get ALL class instances matching this course (ensures we get .6 even if peer is missing it)
    const { data: allClassInstances } = await supabase
      .from('class_instances')
      .select('id')
      .ilike('class_type', `${baseCourseId}.%`)
      .order('class_date', { ascending: true });

    if (!allClassInstances || allClassInstances.length === 0) {
      throw new Error('No class instances found for course ' + baseCourseId);
    }

    const classInstanceIds = allClassInstances.map(ci => ci.id);

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
    const createdBookings = await createMultipleBookings(bookingsToCreate);

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

    return activatedCount;

  } catch (error) {
    console.error('Error activating draft classes:', error);
    throw error;
  }
}

module.exports = {
  processCoursePurchase,
  checkAndProcessThreshold,
  createClassesAndBookings,
  addStudentToExistingCohort,
  activateDraftClasses,
  linkStudentsToExistingClasses,
  findExistingClassInstances,
  getInstructorForCourse,
  normalizeTime,
  MINIMUM_STUDENTS_THRESHOLD
};
