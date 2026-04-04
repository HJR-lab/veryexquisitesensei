const supabaseDb = require('../utils/supabaseDb');

module.exports = function(app, { authenticateToken, requireAdmin, asyncHandler }) {

// ============================================
// CLASS SCHEDULING ENDPOINTS
// ============================================

app.get('/api/classes/available', asyncHandler(async (req, res) => {
  const classes = await supabaseDb.getAvailableClasses();
  console.log(`✅ Successfully fetched and processed ${classes.length} classes with waitlist and makeup counts`);
  res.json({ classes });
}));

app.get('/api/classes/my-bookings', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  console.log('📥 /api/classes/my-bookings called for student:', dbCustomerId);

  const bookings = await supabaseDb.getStudentBookings(dbCustomerId);
  console.log('✅ Bookings found:', bookings.length);

  const formattedBookings = bookings.map(booking => ({
    id: booking.id,
    status: booking.status,
    advanceNoticeGiven: booking.advance_notice_given,
    attended: booking.attended,
    attendanceNotes: booking.attendance_notes,
    class: {
      id: booking.class_instance.id,
      classDate: booking.class_instance.class_date,
      startTime: booking.class_instance.start_time,
      endTime: booking.class_instance.end_time,
      classType: booking.class_instance.class_type,
      classTitle: booking.class_instance.class_title,
      classDescription: booking.class_instance.class_description,
      instructor: booking.class_instance.instructor,
      room: booking.class_instance.room
    }
  }));

  res.json({ bookings: formattedBookings });
}));

// Get student class history with course enrollments
app.get('/api/classes/my-history', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  console.log('📥 /api/classes/my-history called for student:', dbCustomerId);

  // Get all bookings (past and current)
  const { data: bookings, error: bookingsError } = await supabaseDb.supabase
    .from('bookings')
    .select(`
      id,
      status,
      attended,
      booking_date,
      course_enrollment_id,
      class_instance:class_instances!bookings_class_instance_id_fkey (
        id,
        class_date,
        start_time,
        end_time,
        class_type,
        instructor,
        room
      )
    `)
    .eq('student_id', dbCustomerId)
    .order('class_instance(class_date)', { ascending: false });

  if (bookingsError) {
    console.error('Error fetching bookings:', bookingsError);
    throw bookingsError;
  }

  // Get course enrollments
  const { data: enrollments, error: enrollmentsError } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('*')
    .eq('student_id', dbCustomerId)
    .order('course_start_date', { ascending: false });

  if (enrollmentsError) {
    console.error('Error fetching enrollments:', enrollmentsError);
    throw enrollmentsError;
  }

  // Group bookings by actual course identifier (extracted from class_type)
  const courseHistory = [];
  const today = new Date();

  // Helper function to extract base course identifier from class_type
  // e.g., "WT1701AM_DL6.2" -> "WT1701AM_DL6"
  const extractCourseIdentifier = (classType) => {
    if (!classType) return null;
    const match = classType.match(/^(.+?)(?:\.\d+)?$/);
    return match ? match[1] : classType;
  };

  // Process enrollments and split by actual course identifiers
  enrollments.forEach(enrollment => {
    const courseBookings = bookings.filter(b => b.course_enrollment_id === enrollment.id);

    // If no bookings exist but enrollment is completed, show it from enrollment data
    if (courseBookings.length === 0) {
      if (enrollment.status === 'completed') {
        courseHistory.push({
          id: `${enrollment.id}-enrollment`,
          type: 'course',
          courseIdentifier: enrollment.course_identifier || enrollment.id.toString(),
          courseTitle: enrollment.course_title || 'Wheelthrowing Course',
          courseType: enrollment.course_type || '',
          numberOfWeeks: enrollment.number_of_weeks || enrollment.class_credits_allocated || 6,
          startDate: enrollment.course_start_date,
          endDate: enrollment.course_end_date || enrollment.course_expiry_date,
          instructor: enrollment.instructor || 'VES Instructor',
          status: 'completed',
          scheduleDescription: enrollment.schedule_description || '',
          classesAttended: enrollment.class_credits_used || enrollment.number_of_weeks || 6,
          classes: []
        });
      }
      return;
    }

    // Keep all bookings under the same enrollment together as one course
    const sortedBookings = [...courseBookings].sort((a, b) =>
      new Date(a.class_instance.class_date) - new Date(b.class_instance.class_date)
    );
    const startDate = sortedBookings[0]?.class_instance.class_date;
    const endDate = sortedBookings[sortedBookings.length - 1]?.class_instance.class_date;

    const hasUpcomingClasses = courseBookings.some(b =>
      new Date(b.class_instance.class_date) >= today && b.status === 'booked'
    );
    const allClassesFuture = startDate && new Date(startDate) > today;

    const instructor = sortedBookings[0]?.class_instance.instructor ||
                      enrollment.instructor ||
                      'VES Instructor';

    const courseId = enrollment.course_identifier || extractCourseIdentifier(sortedBookings[0]?.class_instance.class_type) || enrollment.id.toString();

    courseHistory.push({
      id: `${enrollment.id}-${courseId}`,
      type: 'course',
      courseIdentifier: courseId,
      courseTitle: enrollment.course_title,
      courseType: enrollment.course_type,
      numberOfWeeks: enrollment.number_of_weeks || sortedBookings.length,
      startDate: startDate,
      endDate: endDate,
      instructor: instructor,
      status: allClassesFuture ? 'upcoming' : hasUpcomingClasses ? 'current' : 'completed',
      classesAttended: sortedBookings.filter(b => b.attended === true || b.status === 'attended' || b.status === 'completed' || (b.status === 'booked' && new Date(b.class_instance.class_date) < today)).length,
      classes: sortedBookings.map(b => ({
        id: b.class_instance.id,
        date: b.class_instance.class_date,
        startTime: b.class_instance.start_time,
        endTime: b.class_instance.end_time,
        classType: b.class_instance.class_type,
        instructor: b.class_instance.instructor,
        attended: b.attended === true || b.status === 'attended' || b.status === 'completed' || (b.status === 'booked' && new Date(b.class_instance.class_date) < today),
        status: b.status
      }))
    });
  });

  // Add standalone bookings (not part of a course enrollment)
  // Try to merge into existing course entries first, then show remaining as standalone
  const standaloneBookings = bookings.filter(b => !b.course_enrollment_id);
  const unmatchedStandalone = [];

  standaloneBookings.forEach(booking => {
    const ci = booking.class_instance;
    const bookingDate = new Date(ci.class_date);

    // Try to find a matching course entry by instructor + date proximity (within 8 weeks)
    const match = courseHistory.find(course => {
      if (course.type !== 'course') return false;
      const courseStart = new Date(course.startDate);
      const courseEnd = new Date(course.endDate);
      // Extend range by 2 weeks on each side to catch makeups
      courseStart.setDate(courseStart.getDate() - 14);
      courseEnd.setDate(courseEnd.getDate() + 14);
      return course.instructor === ci.instructor &&
             bookingDate >= courseStart && bookingDate <= courseEnd;
    });

    if (match) {
      // Merge into existing course entry
      const classEntry = {
        id: ci.id,
        date: ci.class_date,
        startTime: ci.start_time,
        endTime: ci.end_time,
        classType: ci.class_type,
        instructor: ci.instructor,
        attended: booking.attended === true || booking.status === 'attended' || booking.status === 'completed',
        status: booking.status
      };
      match.classes.push(classEntry);
      match.classes.sort((a, b) => new Date(a.date) - new Date(b.date));
      // Update start/end dates
      match.startDate = match.classes[0].date;
      match.endDate = match.classes[match.classes.length - 1].date;
      // Recount attended
      match.classesAttended = match.classes.filter(c => c.attended).length;
    } else {
      unmatchedStandalone.push(booking);
    }
  });

  // Group remaining unmatched standalone bookings
  const standaloneGrouped = {};
  unmatchedStandalone.forEach(booking => {
    const ci = booking.class_instance;
    const baseId = extractCourseIdentifier(ci.class_type) || `standalone-${booking.id}`;
    if (!standaloneGrouped[baseId]) standaloneGrouped[baseId] = [];
    standaloneGrouped[baseId].push(booking);
  });

  Object.entries(standaloneGrouped).forEach(([groupId, groupBookings]) => {
    const sorted = [...groupBookings].sort((a, b) => new Date(a.class_instance.class_date) - new Date(b.class_instance.class_date));
    const firstCI = sorted[0].class_instance;
    const lastCI = sorted[sorted.length - 1].class_instance;
    const hasUpcoming = sorted.some(b => new Date(b.class_instance.class_date) >= today && b.status === 'booked');
    const allFuture = new Date(firstCI.class_date) > today;

    // Derive a readable title from the class_type
    const ct = (firstCI.class_type || '').toUpperCase();
    let title = firstCI.class_type || 'Class';
    if (ct.startsWith('WT')) title = 'Wheelthrowing Beginner/Ext';
    else if (ct.startsWith('HB')) title = 'Handbuilding';
    else if (ct.includes('GLAZ')) title = 'Glazing';

    courseHistory.push({
      id: `standalone-${groupId}`,
      type: 'standalone',
      courseTitle: title,
      courseIdentifier: groupId,
      startDate: firstCI.class_date,
      endDate: lastCI.class_date,
      instructor: firstCI.instructor || 'VES Instructor',
      status: allFuture ? 'upcoming' : hasUpcoming ? 'current' : 'past',
      classesAttended: sorted.filter(b => b.attended || b.status === 'attended' || b.status === 'completed').length,
      classes: sorted.map(b => ({
        id: b.class_instance.id,
        date: b.class_instance.class_date,
        startTime: b.class_instance.start_time,
        endTime: b.class_instance.end_time,
        classType: b.class_instance.class_type,
        instructor: b.class_instance.instructor,
        attended: b.attended,
        status: b.status
      }))
    });
  });

  // Sort by most recent first
  courseHistory.sort((a, b) => {
    const dateA = a.startDate || a.classes[0]?.date || '';
    const dateB = b.startDate || b.classes[0]?.date || '';
    return new Date(dateB) - new Date(dateA);
  });

  // Count attended classes including completed enrollments without bookings
  const completedWithoutBookings = courseHistory.filter(c => c.status === 'completed' && c.classes.length === 0);
  const extraAttended = completedWithoutBookings.reduce((sum, c) => sum + (c.classesAttended || 0), 0);

  const response = {
    history: courseHistory,
    totalClasses: bookings.length + extraAttended,
    attendedClasses: bookings.filter(b => b.attended || b.status === 'attended' || b.status === 'completed' || (b.status === 'booked' && new Date(b.class_instance.class_date) < today)).length + extraAttended
  };

  console.log('📤 Returning history:', JSON.stringify(response, null, 2));
  res.json(response);
}));

app.post('/api/classes/book', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { classInstanceId } = req.body;

  if (!classInstanceId) {
    return res.status(400).json({ error: 'Class instance ID required' });
  }

  const classInstance = await supabaseDb.getClassInstanceById(parseInt(classInstanceId));

  if (!classInstance) {
    return res.status(404).json({ error: 'Class not found' });
  }

  if (classInstance.current_enrollment >= classInstance.max_capacity) {
    return res.status(400).json({ error: 'Class is full. Please join the waitlist.' });
  }

  const existingBooking = await supabaseDb.findBooking(dbCustomerId, parseInt(classInstanceId), 'booked');

  if (existingBooking) {
    return res.status(400).json({ error: 'You are already booked for this class' });
  }

  // Try to find a matching enrollment for this student + class type
  let enrollmentId = null;
  if (classInstance.class_type) {
    const baseId = classInstance.class_type.replace(/\.\d+$/, '');
    const { data: enr } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id')
      .eq('student_id', dbCustomerId)
      .eq('status', 'active')
      .or(`course_identifier.eq.${baseId},course_identifier.like.${baseId}%`)
      .limit(1)
      .single();
    if (enr) enrollmentId = enr.id;
  }

  const booking = await supabaseDb.createBooking({
    studentId: dbCustomerId,
    classInstanceId: parseInt(classInstanceId),
    status: 'booked',
    courseEnrollmentId: enrollmentId
  });

  await supabaseDb.updateClassEnrollment(parseInt(classInstanceId), 1);

  res.json({
    success: true,
    booking: {
      id: booking.id,
      classInstanceId: booking.class_instance_id,
      status: booking.status
    },
    message: 'Class booked successfully!'
  });
}));

// Book a makeup class using remaining credits
app.post('/api/classes/book-makeup', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { classInstanceId } = req.body;

  if (!classInstanceId) {
    return res.status(400).json({ error: 'Class instance ID required' });
  }

  // Get student's credit info
  const { data: customer, error: customerError } = await supabaseDb.supabase
    .from('customers')
    .select('id, classes_allocated, first_name, last_name')
    .eq('id', dbCustomerId)
    .single();

  if (customerError || !customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  // Get ALL bookings to calculate remaining credits
  const { data: allBookings } = await supabaseDb.supabase
    .from('bookings')
    .select('id')
    .eq('student_id', dbCustomerId)
    .in('status', ['booked', 'attended']);

  const totalBooked = allBookings ? allBookings.length : 0;
  const remainingCredits = customer.classes_allocated - totalBooked;

  if (remainingCredits <= 0) {
    return res.status(400).json({
      error: 'No remaining credits available',
      details: `You have used all ${customer.classes_allocated} class credits.`
    });
  }

  // Check class availability
  const classInstance = await supabaseDb.getClassInstanceById(parseInt(classInstanceId));

  if (!classInstance) {
    return res.status(404).json({ error: 'Class not found' });
  }

  if (classInstance.current_enrollment >= classInstance.max_capacity) {
    return res.status(400).json({ error: 'Class is full. No makeup spots available.' });
  }

  // Check if already booked
  const existingBooking = await supabaseDb.findBooking(dbCustomerId, parseInt(classInstanceId), 'booked');

  if (existingBooking) {
    return res.status(400).json({ error: 'You are already booked for this class' });
  }

  // Check if there's a cancelled booking for this class - if so, reactivate it instead of creating new
  const { data: cancelledBooking } = await supabaseDb.supabase
    .from('bookings')
    .select('*')
    .eq('student_id', dbCustomerId)
    .eq('class_instance_id', parseInt(classInstanceId))
    .eq('status', 'cancelled')
    .maybeSingle();

  let booking;
  let bookingError;

  if (cancelledBooking) {
    // Reactivate the cancelled booking
    const { data: updatedBooking, error: updateError } = await supabaseDb.supabase
      .from('bookings')
      .update({
        status: 'booked',
        booking_type: 'makeup',
        booking_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', cancelledBooking.id)
      .select()
      .single();

    booking = updatedBooking;
    bookingError = updateError;
  } else {
    // Create new makeup booking
    const { data: newBooking, error: insertError } = await supabaseDb.supabase
      .from('bookings')
      .insert({
        student_id: dbCustomerId,
        class_instance_id: parseInt(classInstanceId),
        status: 'booked',
        booking_type: 'makeup',
        course_enrollment_id: null,
        booking_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    booking = newBooking;
    bookingError = insertError;
  }

  if (bookingError) {
    console.error('Error creating makeup booking:', bookingError);
    return res.status(500).json({ error: 'Failed to create booking' });
  }

  // Update class enrollment count
  await supabaseDb.updateClassEnrollment(parseInt(classInstanceId), 1);

  res.json({
    success: true,
    booking: {
      id: booking.id,
      classInstanceId: booking.class_instance_id,
      status: booking.status,
      isMakeup: true
    },
    remainingCredits: remainingCredits - 1,
    message: 'Makeup class booked successfully!'
  });
}));

// NEW: Enroll in course (4-week, 6-week, or 8-week)
app.post('/api/classes/enroll-course', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { firstClassId, courseWeeks } = req.body; // courseWeeks: 4, 6, or 8

  if (!firstClassId) {
    return res.status(400).json({ error: 'First class ID required' });
  }

  if (!courseWeeks || ![4, 6, 8].includes(courseWeeks)) {
    return res.status(400).json({ error: 'Course weeks must be 4, 6, or 8' });
  }

  // Get the first class to determine the schedule
  const firstClass = await supabaseDb.getClassInstanceById(parseInt(firstClassId));

  if (!firstClass) {
    return res.status(404).json({ error: 'Class not found' });
  }

  // Extract schedule info (time, day, instructor)
  const scheduleKey = `${firstClass.start_time}_${firstClass.instructor}`;

  // Get all classes with same schedule (same time + instructor)
  const allClasses = await supabaseDb.getAvailableClasses();
  const courseClasses = allClasses
    .filter(c =>
      c.startTime === firstClass.start_time &&
      c.instructor === firstClass.instructor &&
      new Date(c.classDate) >= new Date(firstClass.class_date)
    )
    .sort((a, b) => new Date(a.classDate) - new Date(b.classDate))
    .slice(0, courseWeeks); // Take only the number of weeks requested

  if (courseClasses.length !== courseWeeks) {
    return res.status(400).json({
      error: `Full ${courseWeeks}-week course not available for this schedule. Only ${courseClasses.length} classes available.`
    });
  }

  // Check if student already enrolled in any of these classes
  for (const cls of courseClasses) {
    const existing = await supabaseDb.findBooking(dbCustomerId, cls.id, 'booked');
    if (existing) {
      return res.status(400).json({ error: 'You are already enrolled in this course' });
    }
  }

  // Check capacity for all weeks
  for (const cls of courseClasses) {
    if (cls.currentEnrollment >= 8) { // Regular capacity is 8
      const weekNum = courseClasses.indexOf(cls) + 1;
      return res.status(400).json({
        error: `Week ${weekNum} is full. Cannot enroll in course.`
      });
    }
  }

  // Create course enrollment record in database
  const courseIdentifier = `${firstClass.class_type.substring(0, 2).toUpperCase()}${firstClass.start_time.replace(/[^0-9]/g, '')}_${firstClass.instructor}`;
  const startDate = new Date(firstClass.class_date);
  const expectedEndDate = new Date(courseClasses[courseClasses.length - 1].classDate);

  const { data: enrollment, error: enrollmentError } = await supabaseDb.supabase
    .from('course_enrollments')
    .insert({
      student_id: dbCustomerId,
      course_identifier: courseIdentifier,
      course_type: firstClass.class_type,
      total_weeks: courseWeeks,
      weeks_completed: 0,
      weeks_remaining: courseWeeks,
      start_date: startDate.toISOString().split('T')[0],
      expected_end_date: expectedEndDate.toISOString().split('T')[0],
      status: 'active'
    })
    .select()
    .single();

  if (enrollmentError) {
    console.error('Error creating course enrollment:', enrollmentError);
    return res.status(500).json({ error: 'Failed to create course enrollment' });
  }

  // Book all weeks and link to course enrollment
  const bookings = [];
  for (const cls of courseClasses) {
    const booking = await supabaseDb.createBooking({
      studentId: dbCustomerId,
      classInstanceId: cls.id,
      status: 'booked',
      courseEnrollmentId: enrollment.id // Link to actual enrollment record
    });

    await supabaseDb.updateClassEnrollment(cls.id, 1);
    bookings.push(booking);
  }

  res.json({
    success: true,
    courseEnrollmentId: enrollment.id,
    bookings: bookings.map(b => ({
      id: b.id,
      classInstanceId: b.class_instance_id
    })),
    message: `Successfully enrolled in ${courseWeeks}-week course with ${firstClass.instructor}!`
  });

}));

// Book HB schedule — use existing enrollment credits to book consecutive HB classes
app.post('/api/classes/book-hb-schedule', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { enrollmentId, firstClassId, courseWeeks } = req.body;
  console.log('📚 HB booking request:', { dbCustomerId, enrollmentId, firstClassId, courseWeeks });

  if (!enrollmentId || !firstClassId) {
    return res.status(400).json({ error: 'Enrollment ID and first class ID required' });
  }

  if (!courseWeeks || courseWeeks < 1 || courseWeeks > 8) {
    return res.status(400).json({ error: 'Course weeks must be between 1 and 8 for handbuilding' });
  }

  // Verify enrollment belongs to this student and has sufficient credits
  const { data: enrollment, error: enrollError } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('*')
    .eq('id', enrollmentId)
    .eq('student_id', dbCustomerId)
    .single();

  if (enrollError || !enrollment) {
    return res.status(404).json({ error: 'Enrollment not found' });
  }

  if (enrollment.status !== 'active') {
    return res.status(400).json({ error: 'Enrollment is not active' });
  }

  const creditsRemaining = enrollment.class_credits_remaining || 0;
  if (creditsRemaining < courseWeeks) {
    return res.status(400).json({
      error: `Not enough credits. You have ${creditsRemaining} credits but need ${courseWeeks}.`
    });
  }

  // Get the first class instance
  const firstClass = await supabaseDb.getClassInstanceById(parseInt(firstClassId));
  if (!firstClass) {
    return res.status(404).json({ error: 'Class not found' });
  }

  // Find consecutive HB classes on the same day-of-week with same time + instructor
  // Query directly instead of using getAvailableClasses() which has a limit and unnecessary overhead
  const { data: hbClassesRaw, error: hbQueryError } = await supabaseDb.supabase
    .from('class_instances')
    .select('*')
    .eq('status', 'active')
    .eq('start_time', firstClass.start_time)
    .eq('instructor', firstClass.instructor)
    .like('class_type', 'HB_%')
    .gte('class_date', firstClass.class_date)
    .order('class_date', { ascending: true })
    .limit(courseWeeks * 2); // extra buffer for filtering

  if (hbQueryError) {
    console.error('Error querying HB classes:', hbQueryError);
    return res.status(500).json({ error: 'Failed to find available classes' });
  }

  const firstClassDayOfWeek = new Date(firstClass.class_date).getDay();
  const hbClasses = (hbClassesRaw || [])
    .filter(c => new Date(c.class_date).getDay() === firstClassDayOfWeek)
    .slice(0, courseWeeks)
    .map(c => ({
      id: c.id,
      classDate: c.class_date,
      startTime: c.start_time,
      endTime: c.end_time,
      classType: c.class_type,
      instructor: c.instructor,
      currentEnrollment: c.current_enrollment,
      maxCapacity: c.max_capacity
    }));

  if (hbClasses.length < courseWeeks) {
    return res.status(400).json({
      error: `Only ${hbClasses.length} consecutive classes available. Need ${courseWeeks}.`
    });
  }

  // Check student isn't already booked into these classes
  for (const cls of hbClasses) {
    const existing = await supabaseDb.findBooking(dbCustomerId, cls.id, 'booked');
    if (existing) {
      return res.status(400).json({ error: 'You are already booked in one of these classes' });
    }
  }

  // Check capacity for each class (HB max 10)
  for (const cls of hbClasses) {
    if (cls.currentEnrollment >= 10) {
      const weekNum = hbClasses.indexOf(cls) + 1;
      return res.status(400).json({
        error: `Week ${weekNum} is full. Cannot book schedule.`
      });
    }
  }

  // Create bookings for all weeks, linked to existing enrollment
  // Reactivate cancelled bookings if they exist (unique constraint on student_id + class_instance_id)
  const bookings = [];
  for (const cls of hbClasses) {
    const { data: cancelled } = await supabaseDb.supabase
      .from('bookings')
      .select('id')
      .eq('student_id', dbCustomerId)
      .eq('class_instance_id', cls.id)
      .eq('status', 'cancelled')
      .maybeSingle();

    let booking;
    if (cancelled) {
      const { data: reactivated } = await supabaseDb.supabase
        .from('bookings')
        .update({ status: 'booked', booking_type: 'regular', course_enrollment_id: enrollment.id, updated_at: new Date().toISOString() })
        .eq('id', cancelled.id)
        .select()
        .single();
      booking = reactivated;
    } else {
      booking = await supabaseDb.createBooking({
        studentId: dbCustomerId,
        classInstanceId: cls.id,
        status: 'booked',
        bookingType: 'regular',
        courseEnrollmentId: enrollment.id
      });
    }

    await supabaseDb.updateClassEnrollment(cls.id, 1);
    bookings.push(booking);
  }

  // Decrement credits on booking
  const creditsUsed = bookings.length;
  const { data: currentEnrollment } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('class_credits_used, class_credits_remaining')
    .eq('id', enrollmentId)
    .single();

  await supabaseDb.supabase
    .from('course_enrollments')
    .update({
      class_credits_used: (currentEnrollment?.class_credits_used || 0) + creditsUsed,
      class_credits_remaining: Math.max(0, (currentEnrollment?.class_credits_remaining || 0) - creditsUsed),
      bookings_created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', enrollmentId);

  // Update enrollment with course dates (do NOT overwrite number_of_weeks — it reflects the purchase, not the booking)
  const startDate = new Date(firstClass.class_date);
  const endDate = new Date(hbClasses[hbClasses.length - 1].classDate);

  const dateUpdate = {
    course_end_date: endDate.toISOString().split('T')[0],
  };
  // Only set start date if not already set
  if (!enrollment.course_start_date) {
    dateUpdate.course_start_date = startDate.toISOString().split('T')[0];
  }

  await supabaseDb.supabase
    .from('course_enrollments')
    .update(dateUpdate)
    .eq('id', enrollmentId);

  console.log(`✅ HB schedule booked: ${bookings.length} classes for enrollment ${enrollmentId}`);

  res.json({
    success: true,
    enrollmentId: enrollment.id,
    bookings: bookings.map(b => ({
      id: b.id,
      classInstanceId: b.class_instance_id
    })),
    creditsRemaining: enrollment.class_credits_remaining || 0,
    message: `Successfully booked ${courseWeeks}-week handbuilding schedule!`
  });

}));

app.post('/api/classes/cancel', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { bookingId, advanceNotice } = req.body;

  if (!bookingId) {
    return res.status(400).json({ error: 'Booking ID required' });
  }

  const booking = await supabaseDb.getBookingById(parseInt(bookingId));

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  if (booking.student_id !== dbCustomerId) {
    return res.status(403).json({ error: 'This booking does not belong to you' });
  }

  if (booking.status === 'cancelled') {
    return res.status(400).json({ error: 'Booking already cancelled' });
  }

  await supabaseDb.updateBooking(parseInt(bookingId), {
    status: 'cancelled',
    advanceNoticeGiven: advanceNotice || false
  });

  await supabaseDb.updateClassEnrollment(booking.class_instance_id, -1);

  // Restore HB credit when booking is cancelled
  if (booking.course_enrollment_id) {
    const { data: enr } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id, course_type, class_credits_used, class_credits_remaining')
      .eq('id', booking.course_enrollment_id)
      .single();

    if (enr && (enr.course_type || '').toLowerCase().includes('handbuilding')) {
      await supabaseDb.supabase
        .from('course_enrollments')
        .update({
          class_credits_used: Math.max(0, (enr.class_credits_used || 0) - 1),
          class_credits_remaining: (enr.class_credits_remaining || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', enr.id);
    }
  }

  // Auto-offer spot to next person on waitlist
  try {
    const nextInLine = await supabaseDb.getNextInWaitlist(booking.class_instance_id);
    if (nextInLine) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await supabaseDb.updateWaitlistEntry(nextInLine.id, {
        spotOfferedAt: now.toISOString(),
        notificationSentAt: now.toISOString(),
        expiresAt: expiresAt.toISOString()
      });

      // Send email notification
      const { sendEmail } = require('../utils/emailService');
      if (nextInLine.student?.email) {
        const classDate = new Date(booking.class_instance?.class_date || '').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        await sendEmail({
          to: nextInLine.student.email,
          subject: 'VES — A spot has opened up for your waitlisted class!',
          html: `<p>Great news! A spot has opened up for the class on <strong>${classDate}</strong>.</p><p>You have <strong>24 hours</strong> to claim this spot before it is offered to the next student.</p><p><a href="https://club.ves.sg/classes">Claim your spot</a></p>`
        });
      }
      console.log(`[Waitlist] Auto-offered spot to ${nextInLine.student?.email} for class ${booking.class_instance_id}`);
    }
  } catch (waitlistErr) {
    console.error('[Waitlist] Error auto-offering spot:', waitlistErr);
  }

  res.json({
    success: true,
    message: 'Booking cancelled successfully'
  });
}));

// NEW: Reschedule to a make-up class
app.post('/api/classes/reschedule', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { oldClassId, newClassId } = req.body;

  if (!oldClassId || !newClassId) {
    return res.status(400).json({ error: 'Both old and new class IDs required' });
  }

  // Get the current booking
  let currentBooking = await supabaseDb.findBooking(dbCustomerId, parseInt(oldClassId), 'booked');
  let isRecoveryReschedule = false;

  if (!currentBooking) {
    console.log(`Booking not found for student ${dbCustomerId}, class ${oldClassId} with status 'booked'`);
    // Check bookings with any status (old and target) to provide better error message
    const { data: oldBookingAny } = await supabaseDb.supabase
      .from('bookings')
      .select('*')
      .eq('student_id', dbCustomerId)
      .eq('class_instance_id', parseInt(oldClassId))
      .maybeSingle();

    const { data: targetBookingAny } = await supabaseDb.supabase
      .from('bookings')
      .select('*')
      .eq('student_id', dbCustomerId)
      .eq('class_instance_id', parseInt(newClassId))
      .maybeSingle();

    // Recovery path: previous reschedule attempt cancelled the old booking, then failed on duplicate insert.
    // If the target already has a cancelled/rescheduled row, we can complete the reschedule by reactivating it.
    if (
      oldBookingAny?.status === 'cancelled' &&
      targetBookingAny &&
      ['cancelled', 'rescheduled'].includes(targetBookingAny.status)
    ) {
      console.log('Recovering partial reschedule by reactivating existing target booking');
      currentBooking = oldBookingAny;
      isRecoveryReschedule = true;
    } else if (targetBookingAny?.status === 'booked') {
      return res.json({
        success: true,
        booking: {
          id: targetBookingAny.id,
          classInstanceId: targetBookingAny.class_instance_id
        },
        rescheduleFee: 0,
        message: 'Class was already rescheduled successfully.'
      });
    } else if (oldBookingAny) {
      console.log(`Found booking with status: ${oldBookingAny.status}`);
      return res.status(400).json({
        error: `Cannot reschedule: booking status is '${oldBookingAny.status}' (expected 'booked')`
      });
    }
    if (!currentBooking) {
      return res.status(404).json({ error: 'You are not enrolled in the original class' });
    }
  }

  // Get the old and new class instances
  const oldClass = await supabaseDb.getClassInstanceById(parseInt(oldClassId));
  const newClass = await supabaseDb.getClassInstanceById(parseInt(newClassId));

  if (!oldClass || !newClass) {
    return res.status(404).json({ error: 'Class not found' });
  }

  // Parse class start datetime (combine date + start_time)
  const parseClassDateTime = (classDateStr, timeStr) => {
    const datePart = classDateStr.split('T')[0]; // Get YYYY-MM-DD
    const normalizedTime = timeStr.toUpperCase().trim();

    // Handle both 12-hour (9:30 AM, 3:30pm) and 24-hour (19:00) formats
    const time24Match = normalizedTime.match(/^(\d{1,2}):(\d{2})$/);
    let hour24, minutes;

    if (time24Match) {
      hour24 = parseInt(time24Match[1]);
      minutes = parseInt(time24Match[2]);
    } else {
      const match = normalizedTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
      if (!match) return new Date(NaN);

      const hours = parseInt(match[1]);
      minutes = parseInt(match[2]);
      const period = match[3];

      hour24 = hours;
      if (period === 'PM' && hours !== 12) hour24 = hours + 12;
      else if (period === 'AM' && hours === 12) hour24 = 0;
    }

    const [year, month, day] = datePart.split('-').map(Number);
    return new Date(year, month - 1, day, hour24, minutes);
  };

  // Check if class is within 24 hours
  const now = new Date();
  const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const oldClassDateTime = parseClassDateTime(oldClass.class_date, oldClass.start_time);

  if (isNaN(oldClassDateTime.getTime())) {
    return res.status(400).json({ error: 'Invalid class time format' });
  }

  if (oldClassDateTime < now) {
    return res.status(400).json({ error: 'Cannot reschedule past classes' });
  }

  if (oldClassDateTime < twentyFourHoursFromNow) {
    return res.status(400).json({
      error: 'Cannot reschedule classes within 24 hours of start time. This class will be marked as attended.'
    });
  }

  // Check for 10-class package via the booking's enrollment (not the stale classes_allocated field)
  let has10ClassPackage = false;
  if (currentBooking.course_enrollment_id) {
    const { data: bookingEnrollment } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('number_of_weeks, course_title')
      .eq('id', currentBooking.course_enrollment_id)
      .single();
    has10ClassPackage = bookingEnrollment?.number_of_weeks === 10 ||
      (bookingEnrollment?.course_title?.includes('10 Classes') ?? false);
  }

  // Check if this is a glazing class (Week 6/6 Glazing)
  const isOldClassGlazing = oldClass.class_type?.includes('Week 6/6') && oldClass.class_type?.includes('Glazing');
  const isNewClassGlazing = newClass.class_type?.includes('Week 6/6') && newClass.class_type?.includes('Glazing');

  // For 10-class package: check if this is their 10th class (final class must be glazing)
  if (has10ClassPackage) {
    // Count current bookings for this student
    const { data: allBookings, error: bookingsError } = await supabaseDb.supabase
      .from('bookings')
      .select('id')
      .eq('student_id', dbCustomerId)
      .eq('status', 'booked');

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      return res.status(500).json({ error: 'Failed to fetch bookings' });
    }

    // After rescheduling, they'll still have the same number of bookings (cancelling one, adding one)
    // So if they currently have 9+ bookings, this must be for their 10th class slot
    const totalBookings = allBookings.length;

    if (totalBookings >= 9) {
      // This is their 10th class - must be glazing
      if (!isNewClassGlazing) {
        return res.status(400).json({
          error: 'Your 10th and final class must be a glazing class (Week 6). Please select a glazing class.'
        });
      }
    }
  }

  // Apply cohort restrictions for standard 6-week WT courses (not 10-class package)
  // NOTE: 10-class package students can reschedule across categories (HB ↔ WT)
  // Regular course students must stay within their original course type and cohort dates
  // HB drop-in bookings have no course_enrollment_id — skip cohort restrictions for them
  if (!has10ClassPackage && currentBooking.course_enrollment_id) {
    // Get student's course enrollment to find cohort dates
    const { data: enrollment, error: enrollmentError } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('course_start_date, course_end_date, course_title, package_total_courses')
      .eq('id', currentBooking.course_enrollment_id)
      .single();

    if (enrollmentError) {
      console.error('Error fetching enrollment:', enrollmentError);
      return res.status(500).json({ error: 'Failed to fetch course enrollment' });
    }

    // Check if this is a 6-week Wheelthrowing course
    const isWheelthrowing6Week = enrollment.course_title?.toLowerCase().includes('wheelthrowing') &&
                                  enrollment.course_title?.toLowerCase().includes('6');

    if (isWheelthrowing6Week && enrollment.course_start_date && enrollment.course_end_date) {
      if (isOldClassGlazing) {
        // 3-course package students on courses 1 or 2 can swap glazing → regular WT
        const is3CoursePackage = enrollment.package_total_courses === 3;
        let canSwapGlazingToWT = false;

        if (is3CoursePackage) {
          const { data: completedPkgCourses } = await supabaseDb.supabase
            .from('course_enrollments')
            .select('id')
            .eq('student_id', dbCustomerId)
            .eq('status', 'completed')
            .ilike('course_title', '%3 Course Package%');
          const completedCount = completedPkgCourses?.length || 0;
          // Courses 1 & 2 can swap glazing→WT; course 3 (2 completed) cannot
          canSwapGlazingToWT = completedCount < 2;
        }

        if (!isNewClassGlazing && !canSwapGlazingToWT) {
          return res.status(400).json({
            error: is3CoursePackage
              ? 'Your final course glazing class cannot be rescheduled to a regular class.'
              : 'Glazing class can only be rescheduled to another glazing class (Week 6).'
          });
        }
        // No date restriction for glazing - can reschedule to any future cohort's glazing class
      } else {
        // Regular class (Weeks 1-5): must stay within cohort dates
        const cohortStartDate = new Date(enrollment.course_start_date);
        const cohortEndDate = new Date(enrollment.course_end_date);
        const newClassDate = new Date(newClass.class_date);

        if (newClassDate < cohortStartDate || newClassDate > cohortEndDate) {
          const startStr = cohortStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const endStr = cohortEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return res.status(400).json({
            error: `You can only reschedule to classes within your cohort period (${startStr} - ${endStr}).`
          });
        }

        // Pre-glazing rule: the last class before glazing must be at least 5 full days before glazing date
        // This ensures enough drying time. Applies to week 5/6 (6-week) or week 6/7 (7-week) courses.
        const isPreGlazingClass = oldClass.class_type?.match(/\b(6\.5|7\.6)\b/);
        if (isPreGlazingClass) {
          // Find the student's glazing class booking for this enrollment
          const { data: glazingBooking } = await supabaseDb.supabase
            .from('bookings')
            .select('class_instance_id, class_instances!bookings_class_instance_id_fkey(class_date, class_type)')
            .eq('student_id', dbCustomerId)
            .eq('course_enrollment_id', currentBooking.course_enrollment_id)
            .eq('status', 'booked');

          const glazingClass = (glazingBooking || []).find(b =>
            b.class_instances?.class_type?.includes('Glazing')
          );

          if (glazingClass) {
            const glazingDate = new Date(glazingClass.class_instances.class_date);
            const fiveDaysBefore = new Date(glazingDate.getTime() - 5 * 24 * 60 * 60 * 1000);
            const newDate = new Date(newClass.class_date);

            if (newDate > fiveDaysBefore) {
              const glazingStr = glazingDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
              const deadlineStr = fiveDaysBefore.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
              return res.status(400).json({
                error: `Your pieces need time to dry before firing, which takes 3–4 days. To be ready for glazing on ${glazingDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}, pick a class by ${fiveDaysBefore.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}.`
              });
            }
          }
        }
      }
    }
  }

  // Check if new class has availability (total capacity is 10)
  if (newClass.current_enrollment >= newClass.max_capacity) {
    return res.status(400).json({ error: 'This class is completely full' });
  }

  // Check if student already has any booking row for the target class
  const { data: targetBookingAnyStatus, error: targetBookingLookupError } = await supabaseDb.supabase
    .from('bookings')
    .select('*')
    .eq('student_id', dbCustomerId)
    .eq('class_instance_id', parseInt(newClassId))
    .maybeSingle();

  if (targetBookingLookupError) {
    throw targetBookingLookupError;
  }

  if (targetBookingAnyStatus?.status === 'booked') {
    return res.status(400).json({ error: 'You are already enrolled in this class' });
  }

  // For non-glazing classes, check if reschedule is within same cohort (no fee) or different cohort ($40 fee)
  let rescheduleFee = 0;
  if (!isOldClassGlazing) {
    // Determine if the new class is within the same cohort period
    let isSameCohort = false;
    if (currentBooking.course_enrollment_id) {
      const { data: enroll } = await supabaseDb.supabase
        .from('course_enrollments')
        .select('course_start_date, course_end_date')
        .eq('id', currentBooking.course_enrollment_id)
        .single();

      if (enroll?.course_start_date && enroll?.course_end_date) {
        const cohortStart = new Date(enroll.course_start_date);
        const cohortEnd = new Date(enroll.course_end_date);
        const newClassDate = new Date(newClass.class_date);
        isSameCohort = newClassDate >= cohortStart && newClassDate <= cohortEnd;
      }
    }

    if (!isSameCohort) {
      rescheduleFee = 40; // $40 reschedule fee only for rescheduling outside your cohort

      // Create reschedule fee record
      const { data: newFee, error: feeError } = await supabaseDb.supabase
        .from('reschedule_fees')
        .insert({
          student_id: dbCustomerId,
          booking_id: currentBooking.id,
          fee_type: 'reschedule',
          amount: rescheduleFee,
          payment_status: 'pending',
          notes: `Reschedule fee for ${oldClass.class_type} on ${new Date(oldClass.class_date).toLocaleDateString()} (rescheduled outside cohort)`
        })
        .select()
        .single();

      if (feeError) {
        console.error('Error creating reschedule fee:', feeError);
        // Continue with reschedule but log the error
      }

      // Auto-offset reschedule fee with VES Credits
      if (newFee) {
        try {
          const { spendCredits } = require('../utils/creditManager');
          const feeAmount = parseFloat(newFee.amount);
          const { spent } = await spendCredits({
            customerId: newFee.student_id,
            maxAmount: feeAmount,
            source: 'reschedule_fee',
            referenceId: newFee.id.toString(),
            description: `Reschedule fee offset`,
          });
          if (spent > 0) {
            if (spent >= feeAmount) {
              await supabaseDb.supabase
                .from('reschedule_fees')
                .update({ payment_status: 'paid', notes: (newFee.notes || '') + ` [Credit: $${spent}]` })
                .eq('id', newFee.id);
            } else {
              await supabaseDb.supabase
                .from('reschedule_fees')
                .update({ notes: (newFee.notes || '') + ` [Credit: $${spent} of $${feeAmount}]` })
                .eq('id', newFee.id);
            }
            console.log(`💰 Applied $${spent} VES Credit to reschedule fee ${newFee.id}`);
          }
        } catch (creditErr) {
          console.error('[Credits] Failed to offset reschedule fee:', creditErr);
        }
      }
    }
  }

  // Cancel old booking only if it is still booked (skip in recovery mode to avoid double-decrementing)
  if (currentBooking.status === 'booked') {
    await supabaseDb.updateBooking(currentBooking.id, {
      status: 'cancelled',
      advanceNoticeGiven: true
    });
    await supabaseDb.updateClassEnrollment(parseInt(oldClassId), -1);
  }

  // Determine booking type: if rescheduling back to own course, mark as regular (not makeup)
  const getBaseId = (id) => { const i = (id || '').lastIndexOf('.'); return i > 0 ? id.substring(0, i) : id; };
  const newClassBase = getBaseId(newClass.class_type);
  let resolvedBookingType = 'makeup';
  if (currentBooking.course_enrollment_id) {
    const { data: enrollment } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('course_identifier')
      .eq('id', currentBooking.course_enrollment_id)
      .single();
    if (enrollment && getBaseId(enrollment.course_identifier) === newClassBase) {
      resolvedBookingType = 'regular';
    }
  }

  let newBooking;

  if (targetBookingAnyStatus && ['cancelled', 'rescheduled'].includes(targetBookingAnyStatus.status)) {
    // Reactivate existing target booking row instead of inserting a duplicate
    const { data: reactivatedBooking, error: reactivateError } = await supabaseDb.supabase
      .from('bookings')
      .update({
        status: 'booked',
        booking_type: resolvedBookingType,
        course_enrollment_id: currentBooking.course_enrollment_id || null,
        is_glazing_reschedule: isOldClassGlazing,
        original_class_instance_id: parseInt(oldClassId),
        rescheduled_from_date: oldClass.class_date,
        reschedule_fee_paid: 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', targetBookingAnyStatus.id)
      .select()
      .single();

    if (reactivateError) throw reactivateError;
    newBooking = reactivatedBooking;
  } else {
    // Create new booking (regular if same course, makeup if different)
    newBooking = await supabaseDb.createBooking({
      studentId: dbCustomerId,
      classInstanceId: parseInt(newClassId),
      status: 'booked',
      bookingType: resolvedBookingType,
      courseEnrollmentId: currentBooking.course_enrollment_id, // Keep same course enrollment ID
      isGlazingReschedule: isOldClassGlazing,
      originalClassInstanceId: parseInt(oldClassId),
      rescheduledFromDate: oldClass.class_date,
      rescheduleFeePaid: 0 // Fee is pending payment
    });
  }

  await supabaseDb.updateClassEnrollment(parseInt(newClassId), 1);

  // Auto-offer spot on old class to next person on waitlist
  try {
    const nextInLine = await supabaseDb.getNextInWaitlist(parseInt(oldClassId));
    if (nextInLine) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await supabaseDb.updateWaitlistEntry(nextInLine.id, {
        spotOfferedAt: now.toISOString(),
        notificationSentAt: now.toISOString(),
        expiresAt: expiresAt.toISOString()
      });

      const { sendEmail } = require('../utils/emailService');
      if (nextInLine.student?.email) {
        const classDate = new Date(oldClass.class_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        await sendEmail({
          to: nextInLine.student.email,
          subject: 'VES — A spot has opened up for your waitlisted class!',
          html: `<p>Great news! A spot has opened up for the class on <strong>${classDate}</strong>.</p><p>You have <strong>24 hours</strong> to claim this spot before it is offered to the next student.</p><p><a href="https://club.ves.sg/classes">Claim your spot</a></p>`
        });
      }
      console.log(`[Waitlist] Auto-offered spot to ${nextInLine.student?.email} for class ${oldClassId}`);
    }
  } catch (waitlistErr) {
    console.error('[Waitlist] Error auto-offering spot after reschedule:', waitlistErr);
  }

  // Send reschedule confirmation email
  try {
    const { data: student } = await supabaseDb.supabase
      .from('customers')
      .select('first_name, email')
      .eq('id', dbCustomerId)
      .single();

    if (student?.email) {
      const rescheduleTemplate = require('../email-templates/reschedule-confirmation');
      const { sendAndLogEmail } = require('../utils/emailService');
      const originalDate = new Date(oldClass.class_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      const newDate = new Date(newClass.class_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      const newTime = `${newClass.start_time} – ${newClass.end_time}`;

      const { subject, html } = rescheduleTemplate.generate({
        firstName: student.first_name || 'Student',
        originalDate,
        newDate,
        newTime,
        courseIdentifier: currentBooking.course_enrollment_id || '',
      });

      await sendAndLogEmail({
        emailType: 'reschedule_confirmation',
        courseIdentifier: currentBooking.course_enrollment_id || 'N/A',
        subject,
        html,
        recipientEmails: [student.email],
        sentBy: 'system',
      });
    }
  } catch (emailErr) {
    console.error('Failed to send reschedule confirmation email:', emailErr);
  }

  res.json({
    success: true,
    booking: {
      id: newBooking.id,
      classInstanceId: newBooking.class_instance_id
    },
    rescheduleFee: rescheduleFee,
    message: isRecoveryReschedule
      ? 'Class rescheduled successfully (recovered from a previous failed attempt).'
      : isOldClassGlazing
      ? 'Glazing class rescheduled successfully (no fee)!'
      : rescheduleFee > 0
      ? `Class rescheduled successfully! A $${rescheduleFee} reschedule fee has been added (rescheduled outside your cohort).`
      : 'Class rescheduled successfully (no fee — same cohort).'
  });

}));

// ============================================
// PAUSE COURSE ENDPOINTS
// ============================================

app.post('/api/classes/pause/calculate', authenticateToken, asyncHandler(async (req, res) => {
  const { classId } = req.body;
  const { dbCustomerId } = req.user;

  if (!classId) {
    return res.status(400).json({ error: 'Class ID is required' });
  }

  // Get the booking to find the course enrollment
  const { data: booking, error: bookingError } = await supabaseDb.supabase
    .from('bookings')
    .select('course_enrollment_id, class_instance_id')
    .eq('class_instance_id', classId)
    .eq('student_id', dbCustomerId)
    .eq('status', 'booked')
    .single();

  if (bookingError || !booking || !booking.course_enrollment_id) {
    console.error('Error fetching booking:', bookingError);
    return res.status(404).json({ error: 'Booking or course enrollment not found' });
  }

  // Get course enrollment info
  const { data: enrollment, error: enrollmentError } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('*')
    .eq('id', booking.course_enrollment_id)
    .single();

  if (enrollmentError || !enrollment) {
    console.error('Error fetching course enrollment:', enrollmentError);
    return res.status(500).json({ error: 'Failed to fetch course enrollment' });
  }

  // Check if pause has already been used for this course
  const { data: customer, error: customerError } = await supabaseDb.supabase
    .from('customers')
    .select('*')
    .eq('id', dbCustomerId)
    .single();

  if (customerError) {
    console.error('Error fetching customer:', customerError);
    return res.status(500).json({ error: 'Failed to fetch customer information' });
  }

  if (customer?.pause_used_for_course) {
    return res.status(400).json({
      error: 'You have already used your one-time pause for this course'
    });
  }

  if (customer?.course_paused) {
    return res.status(400).json({
      error: 'Your course is already paused'
    });
  }

  // Calculate remaining classes from enrollment
  const remainingCount = Number.isFinite(enrollment.weeks_remaining)
    ? enrollment.weeks_remaining
    : Math.max(0, (enrollment.number_of_weeks || 0) - (enrollment.weeks_completed || 0));
  const pauseFeePerClass = 40;
  const totalPauseFee = remainingCount * pauseFeePerClass;

  res.json({
    remainingClasses: remainingCount,
    feePerClass: pauseFeePerClass,
    totalFee: totalPauseFee,
    pauseDuration: 30,
    courseIdentifier: enrollment.course_identifier
  });

}));

app.post('/api/classes/pause', authenticateToken, asyncHandler(async (req, res) => {
  const { classId } = req.body;
  const { dbCustomerId } = req.user;

  if (!classId) {
    return res.status(400).json({ error: 'Class ID is required' });
  }

  // Get the booking to find the course enrollment
  const { data: booking, error: bookingError } = await supabaseDb.supabase
    .from('bookings')
    .select('course_enrollment_id')
    .eq('class_instance_id', classId)
    .eq('student_id', dbCustomerId)
    .eq('status', 'booked')
    .single();

  if (bookingError || !booking || !booking.course_enrollment_id) {
    console.error('Error fetching booking:', bookingError);
    return res.status(404).json({ error: 'Booking or course enrollment not found' });
  }

  // Get course enrollment info
  const { data: enrollment, error: enrollmentError } = await supabaseDb.supabase
    .from('course_enrollments')
    .select('*')
    .eq('id', booking.course_enrollment_id)
    .single();

  if (enrollmentError || !enrollment) {
    console.error('Error fetching course enrollment:', enrollmentError);
    return res.status(500).json({ error: 'Failed to fetch course enrollment' });
  }

  // Get customer info
  const { data: customer, error: customerError } = await supabaseDb.supabase
    .from('customers')
    .select('*')
    .eq('id', dbCustomerId)
    .single();

  if (customerError) {
    console.error('Error fetching customer:', customerError);
    return res.status(500).json({ error: 'Failed to fetch customer information' });
  }

  // Check if pause has already been used
  if (customer?.pause_used_for_course) {
    return res.status(400).json({
      error: 'You have already used your one-time pause for this course'
    });
  }

  // Check if course is currently paused
  if (customer?.course_paused) {
    return res.status(400).json({
      error: 'Your course is already paused'
    });
  }

  // Calculate pause fee from enrollment data
  const remainingCount = Number.isFinite(enrollment.weeks_remaining)
    ? enrollment.weeks_remaining
    : Math.max(0, (enrollment.number_of_weeks || 0) - (enrollment.weeks_completed || 0));
  const pauseFeePerClass = 40;
  const totalPauseFee = remainingCount * pauseFeePerClass;

  // Update customer pause status
  const customerUpdate = {};
  if ('course_paused' in customer) customerUpdate.course_paused = true;
  if ('pause_start_date' in customer) customerUpdate.pause_start_date = new Date().toISOString().split('T')[0];
  if ('pause_reason' in customer) customerUpdate.pause_reason = 'Student requested pause';
  if ('paused_at_week' in customer) customerUpdate.paused_at_week = (enrollment.weeks_completed || 0) + 1;
  if ('resume_course_identifier' in customer) customerUpdate.resume_course_identifier = enrollment.course_identifier;
  if ('pause_used_for_course' in customer) customerUpdate.pause_used_for_course = true;
  if ('pause_used_date' in customer) customerUpdate.pause_used_date = new Date().toISOString();

  if (Object.keys(customerUpdate).length > 0) {
    const { error: updateError } = await supabaseDb.supabase
      .from('customers')
      .update(customerUpdate)
      .eq('id', dbCustomerId);

    if (updateError) {
      console.error('Error updating customer pause status:', updateError);
      return res.status(500).json({ error: 'Failed to pause course' });
    }
  } else {
    console.warn('Pause tracking columns not found on customers table; skipping customer pause status update');
  }

  // Update course enrollment status to paused
  const { error: enrollmentUpdateError } = await supabaseDb.supabase
    .from('course_enrollments')
    .update({ status: 'paused' })
    .eq('id', enrollment.id);

  if (enrollmentUpdateError) {
    console.error('Error updating enrollment status:', enrollmentUpdateError);
  }

  // Create a reschedule fee record for the pause
  const { data: newFee, error: feeError } = await supabaseDb.supabase
    .from('reschedule_fees')
    .insert({
      student_id: dbCustomerId,
      fee_type: 'pause',
      amount: totalPauseFee,
      payment_status: 'pending',
      notes: `Course pause - ${remainingCount} remaining classes at $${pauseFeePerClass}/class`
    })
    .select()
    .single();

  if (feeError) {
    console.error('Error creating pause fee:', feeError);
    // Don't fail the request, but log the error
  }

  // Auto-offset pause fee with VES Credits
  if (newFee) {
    try {
      const { spendCredits } = require('../utils/creditManager');
      const feeAmount = parseFloat(newFee.amount);
      const { spent } = await spendCredits({
        customerId: newFee.student_id,
        maxAmount: feeAmount,
        source: 'reschedule_fee',
        referenceId: newFee.id.toString(),
        description: `Reschedule fee offset`,
      });
      if (spent > 0) {
        if (spent >= feeAmount) {
          await supabaseDb.supabase
            .from('reschedule_fees')
            .update({ payment_status: 'paid', notes: (newFee.notes || '') + ` [Credit: $${spent}]` })
            .eq('id', newFee.id);
        } else {
          await supabaseDb.supabase
            .from('reschedule_fees')
            .update({ notes: (newFee.notes || '') + ` [Credit: $${spent} of $${feeAmount}]` })
            .eq('id', newFee.id);
        }
        console.log(`💰 Applied $${spent} VES Credit to pause fee ${newFee.id}`);
      }
    } catch (creditErr) {
      console.error('[Credits] Failed to offset pause fee:', creditErr);
    }
  }

  // TODO: Generate payment link (needs Shopify integration setup)
  // For now, return a placeholder that should be updated with actual payment link
  const paymentLink = `https://ves.sg/pages/pause-payment?amount=${totalPauseFee}&student=${encodeURIComponent(customer?.email || '')}`;

  res.json({
    success: true,
    message: 'Course paused successfully',
    pauseFee: totalPauseFee,
    pauseDuration: 30,
    paymentLink
  });

}));

// ============================================
// ATTENDANCE & NO-SHOW ENDPOINTS
// ============================================

app.get('/api/classes/:classInstanceId/bookings', authenticateToken, asyncHandler(async (req, res) => {
  const { classInstanceId } = req.params;
  const bookings = await supabaseDb.getClassBookings(parseInt(classInstanceId));
  if (!req.user.isAdmin) {
    return res.json({ count: bookings.length });
  }
  res.json({ bookings });
}));

app.post('/api/classes/bookings/:bookingId/mark-attendance', authenticateToken, asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { attended, notes } = req.body;
  const { dbCustomerId } = req.user;

  // Allow admin or instructor
  if (!req.user.isAdmin) {
    const { data: caller } = await supabaseDb.supabase
      .from('customers').select('role').eq('id', dbCustomerId).single();
    if (!caller || caller.role !== 'instructor') {
      return res.status(403).json({ error: 'Admin or instructor access required' });
    }
  }

  if (typeof attended !== 'boolean') {
    return res.status(400).json({ error: 'Attended status required (true/false)' });
  }

  const booking = await supabaseDb.getBookingById(parseInt(bookingId));

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  let newStatus = booking.status;
  let incrementForfeit = false;

  if (!attended) {
    if (booking.advance_notice_given) {
      newStatus = 'completed';
    } else {
      newStatus = 'forfeited';
      incrementForfeit = true;
    }
  } else {
    newStatus = 'completed';
  }

  const updatedBooking = await supabaseDb.updateBooking(parseInt(bookingId), {
    attended: attended,
    status: newStatus,
    markedByAdminId: dbCustomerId,
    attendanceMarkedAt: new Date().toISOString(),
    attendanceNotes: notes || null
  });

  if (incrementForfeit) {
    await supabaseDb.incrementClassesForfeited(booking.student.id);

    // Add $20 no-show fee if this was a rescheduled booking
    if (booking.original_class_instance_id || booking.rescheduled_from_date) {
      const { data: newFee, error: feeError } = await supabaseDb.supabase
        .from('reschedule_fees')
        .insert({
          student_id: booking.student.id,
          booking_id: booking.id,
          fee_type: 'no_show',
          amount: 20,
          payment_status: 'pending',
          notes: `No-show fee for rescheduled class ${booking.class_instance?.class_type || ''} on ${booking.class_instance?.class_date || ''}`
        })
        .select()
        .single();
      if (feeError) console.error('Error creating no-show fee:', feeError);

      // Auto-offset no-show fee with VES Credits
      if (newFee) {
        try {
          const { spendCredits } = require('../utils/creditManager');
          const feeAmount = parseFloat(newFee.amount);
          const { spent } = await spendCredits({
            customerId: newFee.student_id,
            maxAmount: feeAmount,
            source: 'reschedule_fee',
            referenceId: newFee.id.toString(),
            description: `Reschedule fee offset`,
          });
          if (spent > 0) {
            if (spent >= feeAmount) {
              await supabaseDb.supabase
                .from('reschedule_fees')
                .update({ payment_status: 'paid', notes: (newFee.notes || '') + ` [Credit: $${spent}]` })
                .eq('id', newFee.id);
            } else {
              await supabaseDb.supabase
                .from('reschedule_fees')
                .update({ notes: (newFee.notes || '') + ` [Credit: $${spent} of $${feeAmount}]` })
                .eq('id', newFee.id);
            }
            console.log(`💰 Applied $${spent} VES Credit to no-show fee ${newFee.id}`);
          }
        } catch (creditErr) {
          console.error('[Credits] Failed to offset no-show fee:', creditErr);
        }
      }
    }
  }

  // Update enrollment progress when attendance is marked
  // Only update when transitioning FROM 'booked' (first mark), not when toggling between attended/forfeited
  const wasBooked = booking.status === 'booked';
  if (booking.course_enrollment_id && wasBooked) {
    const { data: enrollment } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id, course_type, class_credits_used, class_credits_remaining, weeks_completed')
      .eq('id', booking.course_enrollment_id)
      .single();

    if (enrollment) {
      const isHB = (enrollment.course_type || '').toLowerCase().includes('handbuilding');
      if (isHB) {
        // HB credits are decremented at booking time, not at attendance time.
        // No additional credit update needed here.
      } else {
        // WT courses: increment weeks_completed on attended or forfeited (no-show)
        if (attended || (!attended && !booking.advance_notice_given)) {
          await supabaseDb.supabase
            .from('course_enrollments')
            .update({
              weeks_completed: (enrollment.weeks_completed || 0) + 1,
              updated_at: new Date().toISOString()
            })
            .eq('id', enrollment.id);
        }
      }
    }
  }

  // Handle firing pieces if provided
  if (req.body.firingPieces && parseInt(req.body.firingPieces) > 0) {
    const firingPieces = parseInt(req.body.firingPieces);
    const allowance = 7; // WT standard allowance

    // Save firing_pieces on the booking
    await supabaseDb.supabase
      .from('bookings')
      .update({ firing_pieces: firingPieces })
      .eq('id', bookingId);

    const extraPieces = Math.max(0, firingPieces - allowance);
    if (extraPieces > 0) {
      const chargeAmount = extraPieces * 20;

      // Create firing charge
      const { data: charge, error: chargeError } = await supabaseDb.supabase
        .from('firing_charges')
        .insert({
          customer_id: booking.student.id,
          course_enrollment_id: booking.course_enrollment_id,
          pieces: extraPieces,
          amount: chargeAmount,
        })
        .select()
        .single();

      if (!chargeError && charge) {
        // Auto-offset with credits
        try {
          const { spendCredits } = require('../utils/creditManager');
          const { spent } = await spendCredits({
            customerId: booking.student.id,
            maxAmount: chargeAmount,
            source: 'firing_fee',
            referenceId: charge.id.toString(),
            description: `${extraPieces} extra firing piece${extraPieces > 1 ? 's' : ''} @ $20`,
          });

          if (spent > 0) {
            await supabaseDb.supabase
              .from('firing_charges')
              .update({ credit_applied: spent })
              .eq('id', charge.id);
          }

          console.log(`🔥 Firing charge: ${extraPieces} extra pieces = $${chargeAmount}, credit applied: $${spent}`);
        } catch (creditErr) {
          console.error('[Credits] Failed to offset firing charge:', creditErr);
        }
      }
    }
  }

  res.json({
    success: true,
    booking: {
      id: updatedBooking.id,
      attended: updatedBooking.attended,
      status: updatedBooking.status,
      attendanceMarkedAt: updatedBooking.attendance_marked_at
    },
    message: attended ? 'Marked as attended' : (booking.advance_notice_given ? 'Marked as no-show with notice' : 'Marked as no-show without notice - class forfeited')
  });
}));

app.get('/api/students/:studentId/attendance', authenticateToken, asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  if (!req.user.isAdmin && req.user.dbCustomerId !== parseInt(studentId)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const customer = await supabaseDb.getCustomerById(parseInt(studentId));

  if (!customer) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const bookings = await supabaseDb.getStudentAttendance(parseInt(studentId));

  const formattedBookings = bookings.map(booking => ({
    id: booking.id,
    status: booking.status,
    attended: booking.attended,
    advanceNoticeGiven: booking.advance_notice_given,
    attendanceMarkedAt: booking.attendance_marked_at,
    attendanceNotes: booking.attendance_notes,
    class: {
      classDate: booking.class_instance.class_date,
      startTime: booking.class_instance.start_time,
      endTime: booking.class_instance.end_time,
      classType: booking.class_instance.class_type,
      instructor: booking.class_instance.instructor
    }
  }));

  const attendanceStats = {
    totalClasses: bookings.length,
    attended: bookings.filter(b => b.attended === true).length,
    noShowWithNotice: bookings.filter(b => b.attended === false && b.advance_notice_given === true).length,
    forfeited: bookings.filter(b => b.status === 'forfeited').length
  };

  res.json({
    student: {
      id: customer.id,
      name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
      email: customer.email,
      classesForfeited: customer.classes_forfeited || 0
    },
    stats: attendanceStats,
    bookings: formattedBookings
  });
}));

// ============================================
// WAITLIST ENDPOINTS
// ============================================

app.post('/api/classes/waitlist/join', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { classInstanceId } = req.body;

  if (!classInstanceId) {
    return res.status(400).json({ error: 'Class instance ID required' });
  }

  const classInstance = await supabaseDb.getClassInstanceById(parseInt(classInstanceId));

  if (!classInstance) {
    return res.status(404).json({ error: 'Class not found' });
  }

  const existingBooking = await supabaseDb.findBooking(dbCustomerId, parseInt(classInstanceId), 'booked');

  if (existingBooking) {
    return res.status(400).json({ error: 'You are already booked for this class' });
  }

  const existingWaitlist = await supabaseDb.findWaitlistEntry(dbCustomerId, parseInt(classInstanceId));

  if (existingWaitlist) {
    return res.status(400).json({
      error: 'You are already on the waitlist for this class',
      position: existingWaitlist.position
    });
  }

  const maxPosition = await supabaseDb.getMaxWaitlistPosition(parseInt(classInstanceId));
  const newPosition = maxPosition + 1;

  const waitlistEntry = await supabaseDb.createWaitlistEntry({
    studentId: dbCustomerId,
    classInstanceId: parseInt(classInstanceId),
    position: newPosition
  });

  res.json({
    success: true,
    waitlist: {
      id: waitlistEntry.id,
      position: waitlistEntry.position,
      joinedAt: waitlistEntry.joined_at,
      message: `You are #${newPosition} on the waitlist`
    }
  });
}));

app.delete('/api/classes/waitlist/leave', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { classInstanceId } = req.body;

  if (!classInstanceId) {
    return res.status(400).json({ error: 'Class instance ID required' });
  }

  const waitlistEntry = await supabaseDb.findWaitlistEntry(dbCustomerId, parseInt(classInstanceId));

  if (!waitlistEntry) {
    return res.status(404).json({ error: 'You are not on the waitlist for this class' });
  }

  const removedPosition = waitlistEntry.position;

  await supabaseDb.deleteWaitlistEntry(waitlistEntry.id);
  await supabaseDb.updateWaitlistPositions(parseInt(classInstanceId), removedPosition);

  res.json({ success: true, message: 'Removed from waitlist' });
}));

app.get('/api/classes/waitlist/my-entries', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;

  const waitlistEntries = await supabaseDb.getStudentWaitlistEntries(dbCustomerId);

  const formattedEntries = waitlistEntries.map(entry => ({
    id: entry.id,
    position: entry.position,
    joinedAt: entry.joined_at,
    spotOfferedAt: entry.spot_offered_at,
    expiresAt: entry.expires_at,
    class: {
      id: entry.class_instance.id,
      classDate: entry.class_instance.class_date,
      startTime: entry.class_instance.start_time,
      endTime: entry.class_instance.end_time,
      classType: entry.class_instance.class_type,
      instructor: entry.class_instance.instructor
    }
  }));

  res.json({ waitlistEntries: formattedEntries });
}));

app.get('/api/classes/:classInstanceId/waitlist', authenticateToken, asyncHandler(async (req, res) => {
  const { classInstanceId } = req.params;
  const waitlist = await supabaseDb.getClassWaitlist(parseInt(classInstanceId));
  res.json({ waitlist });
}));

app.post('/api/classes/:classInstanceId/waitlist/offer-next', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { classInstanceId } = req.params;

  const nextInLine = await supabaseDb.getNextInWaitlist(parseInt(classInstanceId));

  if (!nextInLine) {
    return res.status(404).json({ error: 'No one on waitlist' });
  }

  if (nextInLine.class_instance.current_enrollment >= nextInLine.class_instance.max_capacity) {
    return res.status(400).json({ error: 'Class is full' });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const updatedWaitlist = await supabaseDb.updateWaitlistEntry(nextInLine.id, {
    spotOfferedAt: now.toISOString(),
    notificationSentAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  });

  console.log(`Spot offered to ${nextInLine.student.email} for class on ${nextInLine.class_instance.class_date}`);
  console.log(`Offer expires at: ${expiresAt}`);

  res.json({
    success: true,
    waitlistEntry: {
      id: updatedWaitlist.id,
      position: updatedWaitlist.position,
      studentName: `${nextInLine.student.first_name} ${nextInLine.student.last_name}`,
      studentEmail: nextInLine.student.email,
      spotOfferedAt: updatedWaitlist.spot_offered_at,
      expiresAt: updatedWaitlist.expires_at
    },
    message: 'Spot offered successfully'
  });
}));

app.post('/api/classes/waitlist/claim', authenticateToken, asyncHandler(async (req, res) => {
  const { dbCustomerId } = req.user;
  const { waitlistId } = req.body;

  if (!waitlistId) {
    return res.status(400).json({ error: 'Waitlist ID required' });
  }

  const waitlistEntry = await supabaseDb.getWaitlistEntryById(parseInt(waitlistId));

  if (!waitlistEntry) {
    return res.status(404).json({ error: 'Waitlist entry not found' });
  }

  if (waitlistEntry.student_id !== dbCustomerId) {
    return res.status(403).json({ error: 'This waitlist entry does not belong to you' });
  }

  if (waitlistEntry.claimed) {
    return res.status(400).json({ error: 'This spot has already been claimed' });
  }

  if (!waitlistEntry.spot_offered_at) {
    return res.status(400).json({ error: 'No spot has been offered yet' });
  }

  if (waitlistEntry.expires_at && new Date() > new Date(waitlistEntry.expires_at)) {
    return res.status(400).json({ error: 'This offer has expired' });
  }

  if (waitlistEntry.class_instance.current_enrollment >= waitlistEntry.class_instance.max_capacity) {
    return res.status(400).json({ error: 'Class is now full' });
  }

  // Try to find a matching enrollment for this student + class
  let waitlistEnrollmentId = null;
  if (waitlistEntry.class_instance?.class_type) {
    const baseId = waitlistEntry.class_instance.class_type.replace(/\.\d+$/, '');
    const { data: enr } = await supabaseDb.supabase
      .from('course_enrollments')
      .select('id')
      .eq('student_id', dbCustomerId)
      .eq('status', 'active')
      .or(`course_identifier.eq.${baseId},course_identifier.like.${baseId}%`)
      .limit(1)
      .single();
    if (enr) waitlistEnrollmentId = enr.id;
  }

  const booking = await supabaseDb.createBooking({
    studentId: dbCustomerId,
    classInstanceId: waitlistEntry.class_instance_id,
    status: 'booked',
    courseEnrollmentId: waitlistEnrollmentId
  });

  await supabaseDb.updateWaitlistEntry(waitlistEntry.id, {
    claimed: true,
    claimedAt: new Date().toISOString()
  });

  await supabaseDb.updateClassEnrollment(waitlistEntry.class_instance_id, 1);

  res.json({
    success: true,
    booking: {
      id: booking.id,
      classInstanceId: booking.class_instance_id,
      status: booking.status
    },
    message: 'Successfully claimed your spot!'
  });
}));

app.post('/api/classes/waitlist/process-expired', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const expiredOffers = await supabaseDb.getExpiredWaitlistOffers();

  const processedEntries = [];

  for (const entry of expiredOffers) {
    await supabaseDb.updateWaitlistEntry(entry.id, {
      spotOfferedAt: null,
      notificationSentAt: null,
      expiresAt: null
    });

    console.log(`Expired offer for ${entry.student.email} - class on ${entry.class_instance.class_date}`);
    processedEntries.push({
      studentEmail: entry.student.email,
      classDate: entry.class_instance.class_date,
      position: entry.position
    });
  }

  res.json({
    success: true,
    processedCount: processedEntries.length,
    entries: processedEntries
  });
}));

};
