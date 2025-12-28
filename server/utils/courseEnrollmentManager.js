/**
 * Course Enrollment Manager
 * Handles automatic class instance and booking creation when 4+ students purchase the same course
 */

const { parseCourseInfo, generateCohortId, createClassInstances: generateClassInstanceObjects } = require('./courseScheduler');
const {
  createCourseEnrollment,
  findCohortEnrollments,
  updateCourseEnrollment,
  createClassInstances,
  createMultipleBookings,
  findCustomerByEmail
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

// Get instructor for course type
function getInstructorForCourse(courseType) {
  if (courseType && courseType.toLowerCase().includes('handbuilding')) {
    return INSTRUCTORS.LYNETTE_TING; // Handbuilding taught by LT
  }
  // Default to Joyce Lim for wheelthrowing (can also be DL)
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

    // Parse course information from Shopify product
    const courseInfo = parseCourseInfo(lineItem.title, lineItem.variantTitle);

    // Validate that we have required fields
    if (!courseInfo.courseType || !courseInfo.startDate || !courseInfo.schedulePattern) {
      console.log(`⚠️  Incomplete course info for ${lineItem.title}`);
      return {
        success: false,
        error: 'Incomplete course information',
        courseInfo
      };
    }

    // Format dates for database
    const startDate = courseInfo.startDate.toISOString().split('T')[0];
    const endDate = courseInfo.endDate ? courseInfo.endDate.toISOString().split('T')[0] : null;

    // Create course enrollment record
    const enrollment = await createCourseEnrollment({
      studentId: student.id,
      shopifyOrderId: order.id,
      shopifyLineItemId: lineItem.id,
      courseTitle: lineItem.title,
      courseVariantTitle: lineItem.variantTitle,
      courseType: courseInfo.courseType,
      schedulePattern: courseInfo.schedulePattern,
      numberOfWeeks: courseInfo.numberOfWeeks,
      courseStartDate: startDate,
      courseEndDate: endDate,
      classTime: courseInfo.classTime,
      instructor: courseInfo.instructor,
      room: courseInfo.room,
      status: 'active'
    });

    console.log(`✅ Created enrollment ${enrollment.id} for ${student.email} - ${courseInfo.courseType}`);

    // Handbuilding courses use credit system (no auto-booking)
    if (courseInfo.courseType && courseInfo.courseType.toLowerCase().includes('handbuilding')) {
      const credits = courseInfo.numberOfWeeks || 4; // 4 or 8 class credits

      // Update enrollment with credit allocation
      await updateCourseEnrollment(enrollment.id, {
        status: 'active'
        // Note: The following fields require schema migration (see migrations/add-credit-system.sql):
        // class_credits_allocated: credits,
        // class_credits_used: 0,
        // class_credits_remaining: credits,
        // glazing_class_used: false
      });

      console.log(`🎨 Handbuilding enrollment: ${credits} credits allocated (student will self-register for classes)`);

      return {
        success: true,
        enrollment,
        isHandbuilding: true,
        creditsAllocated: credits,
        message: `${credits} class credits allocated. Student can self-register for Wednesday HB classes.`
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
 * Check if the 4-student threshold is met and process automatic booking creation
 * @param {Object} newEnrollment - The newly created course enrollment
 * @returns {Promise<Object>} Result object with created class instances and bookings
 */
async function checkAndProcessThreshold(newEnrollment) {
  try {
    // Find all enrollments in the same cohort
    const cohortEnrollments = await findCohortEnrollments(
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

    // Check if threshold applies to this course type
    const requiresThreshold = COURSES_WITH_THRESHOLD.some(type =>
      newEnrollment.course_type && newEnrollment.course_type.includes(type)
    );

    // For Handbuilding: create classes immediately (no threshold)
    // For Wheelthrowing: wait for 4 students
    const shouldCreateClasses = !requiresThreshold || (studentCount >= MINIMUM_STUDENTS_THRESHOLD);

    if (shouldCreateClasses) {
      // Check if bookings already created for this cohort
      const hasExistingClasses = cohortEnrollments.some(e => e.bookings_created_at);

      if (hasExistingClasses) {
        console.log(`✅ Cohort already has classes, adding student to existing classes`);
        return await addStudentToExistingCohort(newEnrollment, cohortEnrollments[0]);
      }

      if (requiresThreshold) {
        console.log(`🎉 Wheelthrowing threshold met! Creating class instances and bookings for ${studentCount} students`);
      } else {
        console.log(`🎉 Handbuilding course! Creating class instances and bookings immediately for ${studentCount} student(s)`);
      }
      return await createClassesAndBookings(cohortEnrollments);
    } else {
      console.log(`⏳ Wheelthrowing course waiting for more students... (${studentCount}/${MINIMUM_STUDENTS_THRESHOLD})`);
      return {
        thresholdMet: false,
        requiresThreshold: true,
        studentCount,
        studentsNeeded: MINIMUM_STUDENTS_THRESHOLD - studentCount
      };
    }

  } catch (error) {
    console.error('Error checking threshold:', error);
    throw error;
  }
}

/**
 * Create class instances and bookings for all students in a cohort
 * @param {Array} cohortEnrollments - All enrollments in the cohort
 * @returns {Promise<Object>} Created class instances and bookings
 */
async function createClassesAndBookings(cohortEnrollments) {
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

    // Get appropriate instructor for this course type
    const instructor = getInstructorForCourse(firstEnrollment.course_type);

    // Generate class instance objects
    const classInstanceObjects = generateClassInstanceObjects(courseInfo, {
      instructorName: firstEnrollment.instructor || instructor.name,
      instructorCode: instructor.code,
      room: firstEnrollment.room || 'Studio A',
      maxCapacity: 10,
      startTime: courseInfo.classTime ? courseInfo.classTime.split(' - ')[0] : '7:00 PM',
      endTime: courseInfo.classTime ? courseInfo.classTime.split(' - ')[1] : '9:30 PM'
    });

    // Set current enrollment count
    classInstanceObjects.forEach(instance => {
      instance.current_enrollment = cohortEnrollments.length;
    });

    // Create class instances in database
    console.log(`📅 Creating ${classInstanceObjects.length} class instances...`);
    const createdClasses = await createClassInstances(classInstanceObjects);

    console.log(`✅ Created ${createdClasses.length} class instances`);

    // Create bookings for all students in the cohort
    const bookingsToCreate = [];

    for (const enrollment of cohortEnrollments) {
      for (const classInstance of createdClasses) {
        bookingsToCreate.push({
          student_id: enrollment.student_id,
          class_instance_id: classInstance.id,
          status: 'booked',
          booking_type: 'regular',
          course_enrollment_id: enrollment.id,
          booking_date: new Date().toISOString()
        });
      }
    }

    console.log(`📚 Creating ${bookingsToCreate.length} bookings for ${cohortEnrollments.length} students...`);
    const createdBookings = await createMultipleBookings(bookingsToCreate);

    console.log(`✅ Created ${createdBookings.length} bookings`);

    // Update all enrollments with booking timestamps
    const now = new Date().toISOString();
    for (const enrollment of cohortEnrollments) {
      await updateCourseEnrollment(enrollment.id, {
        status: 'active',
        thresholdMetAt: now,
        bookingsCreatedAt: now
      });
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
    // Find all class instances for this cohort by looking up bookings from existing enrollment
    const { supabase } = require('./supabaseDb');

    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('class_instance_id')
      .eq('course_enrollment_id', existingEnrollment.id);

    if (!existingBookings || existingBookings.length === 0) {
      throw new Error('No existing bookings found for confirmed cohort');
    }

    const classInstanceIds = existingBookings.map(b => b.class_instance_id);

    // Create bookings for the new student
    const bookingsToCreate = classInstanceIds.map(classInstanceId => ({
      student_id: newEnrollment.student_id,
      class_instance_id: classInstanceId,
      status: 'booked',
      booking_type: 'regular',
      course_enrollment_id: newEnrollment.id,
      booking_date: new Date().toISOString()
    }));

    console.log(`📚 Adding ${bookingsToCreate.length} bookings for new student...`);
    const createdBookings = await createMultipleBookings(bookingsToCreate);

    // Increment enrollment count for all class instances
    for (const classInstanceId of classInstanceIds) {
      const { updateClassEnrollment } = require('./supabaseDb');
      await updateClassEnrollment(classInstanceId, 1);
    }

    // Update enrollment with booking timestamp
    await updateCourseEnrollment(newEnrollment.id, {
      status: 'active',
      bookingsCreatedAt: new Date().toISOString()
    });

    console.log(`✅ Added student to existing cohort with ${createdBookings.length} bookings`);

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

module.exports = {
  processCoursePurchase,
  checkAndProcessThreshold,
  createClassesAndBookings,
  addStudentToExistingCohort,
  getInstructorForCourse,
  MINIMUM_STUDENTS_THRESHOLD
};
