/**
 * Course enrollment data access.
 *
 * Domain module extracted from the monolithic supabaseDb.js. Owns the
 * `course_enrollments` table plus the bulk `class_instances` / `bookings`
 * inserts used by the automatic booking-creation flow. supabaseDb.js re-exports
 * these functions so existing `require('./supabaseDb').<fn>` call sites keep
 * working unchanged during the incremental split.
 */

const { supabase } = require('./supabaseClient');

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
      ...(enrollmentData.packageCoursesRemaining != null && { package_courses_remaining: enrollmentData.packageCoursesRemaining }),
      ...(enrollmentData.totalWeeks && { total_weeks: enrollmentData.totalWeeks }),
      ...(enrollmentData.classCreditsAllocated && { class_credits_allocated: enrollmentData.classCreditsAllocated }),
      ...(enrollmentData.classCreditsRemaining != null && { class_credits_remaining: enrollmentData.classCreditsRemaining }),
      ...(enrollmentData.classCreditsUsed != null && { class_credits_used: enrollmentData.classCreditsUsed })
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

module.exports = {
  createCourseEnrollment,
  findCohortEnrollments,
  updateCourseEnrollment,
  createClassInstances,
  createMultipleBookings,
};
