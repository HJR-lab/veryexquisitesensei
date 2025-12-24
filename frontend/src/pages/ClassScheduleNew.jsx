import { useState, useEffect } from 'react';
import api from '../utils/api';
import Navigation from '../components/Navigation';
import ClassCalendar from '../components/ClassCalendar';

export default function ClassScheduleNew() {
  const [classes, setClasses] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedClass, setSelectedClass] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [bookingNotes, setBookingNotes] = useState('');
  const [classTypeFilter, setClassTypeFilter] = useState('all');
  const [courseWeeks, setCourseWeeks] = useState(null); // null for single, or 4/6/8 for courses
  const [highlightedCourseDates, setHighlightedCourseDates] = useState([]); // Array of dates to highlight for selected course
  const [showCourseMenu, setShowCourseMenu] = useState(false);
  const [courseMenuPosition, setCourseMenuPosition] = useState({ x: 0, y: 0 });
  const [courseMenuOptions, setCourseMenuOptions] = useState([]);
  const [showClassMenu, setShowClassMenu] = useState(null); // Store classId for which menu is open
  const [rescheduleSelectedDate, setRescheduleSelectedDate] = useState(new Date());
  const [rescheduleCurrentMonth, setRescheduleCurrentMonth] = useState(new Date());
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseCalculation, setPauseCalculation] = useState(null);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  useEffect(() => {
    fetchClasses();
    fetchMyBookings();
  }, []);

  // When reschedule modal opens, find first date with available classes
  useEffect(() => {
    if (showRescheduleModal && selectedClass) {
      const makeupClasses = getAvailableMakeupClasses();
      console.log('🔍 MODAL OPENED - Total makeup classes found:', makeupClasses.length);

      if (makeupClasses.length > 0) {
        // Get all unique dates from makeup classes
        const uniqueDates = [...new Set(makeupClasses.map(c => c.classDate.split('T')[0]))];
        console.log('📅 Unique dates with classes:', uniqueDates);

        // Sort dates and pick the first one
        const sortedDates = uniqueDates.sort();
        const firstDateStr = sortedDates[0];
        const firstDate = new Date(firstDateStr + 'T12:00:00');

        console.log('✅ Auto-selecting first available date:', firstDateStr);
        setRescheduleSelectedDate(firstDate);
        setRescheduleCurrentMonth(new Date(firstDate.getFullYear(), firstDate.getMonth(), 1));
      } else {
        console.log('❌ NO MAKEUP CLASSES FOUND!');
        console.log('Selected class details:', {
          id: selectedClass.id,
          classType: selectedClass.classType,
          classDate: selectedClass.classDate,
          instructor: selectedClass.instructor
        });
      }
    }
  }, [showRescheduleModal, selectedClass]);

  const fetchClasses = async () => {
    try {
      // Use the admin endpoint which returns properly structured courses
      // This endpoint requires authentication but works for logged-in students
      const response = await api.get('/admin/classes');
      console.log('Fetched courses from admin endpoint:', response.data.courses);
      setClasses(response.data.courses || []);
    } catch (error) {
      console.error('Error fetching classes from admin endpoint:', error);
      // If admin endpoint fails (e.g., not authenticated), fall back to public endpoint
      try {
        console.log('Falling back to public endpoint...');
        const publicResponse = await api.get('/classes/available');
        // Transform flat classes array into courses structure
        const flatClasses = publicResponse.data.classes || [];
        console.log('Fetched flat classes from public endpoint:', flatClasses.length, 'classes');

        // Group classes by a signature to create courses
        const courseGroups = {};
        flatClasses.forEach(cls => {
          const clsDate = new Date(cls.classDate);
          const dayOfWeek = clsDate.getDay();
          const signature = `${cls.classType}_${cls.startTime}_${cls.instructor}_${dayOfWeek}`;

          if (!courseGroups[signature]) {
            courseGroups[signature] = {
              classes: [],
              identifier: `${cls.classType.substring(0, 2).toUpperCase()}_${cls.startTime.replace(/[^0-9]/g, '')}`
            };
          }

          courseGroups[signature].classes.push({
            id: cls.id,
            class_date: cls.classDate,
            class_type: cls.classType,
            start_time: cls.startTime,
            end_time: cls.endTime,
            instructor: cls.instructor,
            room: cls.room,
            max_capacity: cls.maxCapacity,
            bookingCount: cls.currentEnrollment || 0
          });
        });

        const transformedCourses = Object.values(courseGroups);
        console.log('Transformed into courses:', transformedCourses.length, 'courses');
        setClasses(transformedCourses);
      } catch (fallbackError) {
        console.error('Error fetching classes from fallback endpoint:', fallbackError);
      }
    }
  };

  const fetchMyBookings = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('❌ No token found - user not logged in');
        return; // Not logged in
      }

      console.log('🔍 Fetching my bookings...');
      const response = await api.get('/classes/my-bookings');
      console.log('✅ My bookings response:', response.data);
      setMyBookings(response.data.bookings || []);
      console.log('📊 Total bookings loaded:', response.data.bookings?.length || 0);
    } catch (error) {
      console.error('❌ Error fetching bookings:', error);
      console.error('Error response:', error.response?.data);
    }
  };

  const isEnrolled = (classId) => {
    return myBookings.some(booking => booking.class.id === classId && booking.status === 'booked');
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    // Convert Sunday (0) to 6, Monday (1) to 0, etc. for Monday-first week
    const startingDayOfWeek = (firstDay.getDay() + 6) % 7;

    return { daysInMonth, startingDayOfWeek };
  };

  const formatDate = (date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date);
  };

  const formatShortDate = (date) => {
    const d = new Date(date);
    const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const day = d.getDate();
    return { month, day };
  };

  const getClassesForDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Flatten all class instances from all courses
    const allClasses = [];
    classes.forEach(course => {
      course.classes?.forEach(cls => {
        if (cls.class_date?.startsWith(dateStr)) {
          allClasses.push({
            ...cls,
            baseCourseIdentifier: course.identifier,
            fullCourseIdentifier: cls.courseIdentifier,
            // Map to old property names for compatibility
            id: cls.id,
            classDate: cls.class_date,
            classType: cls.class_type,
            startTime: cls.start_time,
            endTime: cls.end_time,
            instructor: cls.instructor,
            room: cls.room,
            maxCapacity: cls.max_capacity,
            currentEnrollment: cls.bookingCount,
            isFull: cls.bookingCount >= cls.max_capacity,
            isCompletelyFull: cls.bookingCount >= cls.max_capacity
          });
        }
      });
    });

    // Apply filter
    if (classTypeFilter !== 'all') {
      return allClasses.filter(c => getClassCategory(c.classType) === classTypeFilter);
    }

    return allClasses;
  };

  // Remove availability status - students don't see capacity numbers

  const handleBooking = async () => {
    if (!courseWeeks) {
      alert('Please select a course length');
      return;
    }

    try {
      await api.post('/classes/enroll-course', {
        firstClassId: selectedClass.id,
        courseWeeks: courseWeeks
      });

      alert(`Successfully enrolled in ${courseWeeks}-week course with ${selectedClass.instructor}!`);
      setShowModal(false);
      setBookingNotes('');
      setCourseWeeks(null);
      fetchClasses();
      fetchMyBookings();
    } catch (error) {
      console.error('Error enrolling in course:', error);
      alert(error.response?.data?.error || 'Failed to enroll in course');
    }
  };

  const getWeekNumberFromClassType = (classType) => {
    const match = classType?.match(/Week (\d)/);
    return match ? parseInt(match[1]) : null;
  };

  // Get all dates in a course
  const getCourseDates = (clickedClass) => {
    if (!clickedClass || !clickedClass.baseCourseIdentifier) {
      console.log('❌ getCourseDates: No baseCourseIdentifier', clickedClass);
      return [];
    }

    // Use the base courseIdentifier to find all classes in same course
    const baseCourseId = clickedClass.baseCourseIdentifier;
    console.log('🔍 getCourseDates: Looking for base identifier:', baseCourseId);

    // Find the course with this identifier
    const matchingCourse = classes.find(c => c.identifier === baseCourseId);

    if (!matchingCourse) {
      console.log('❌ getCourseDates: No matching course found for:', baseCourseId);
      console.log('Available course identifiers:', classes.map(c => c.identifier));
      return [];
    }

    console.log('✅ getCourseDates: Found course with', matchingCourse.classes?.length, 'classes');

    // Extract unique dates (YYYY-MM-DD format) from all classes in the course
    const dates = matchingCourse.classes.map(cls => cls.class_date.split('T')[0]);

    console.log('📅 getCourseDates: Returning dates:', dates);
    return [...new Set(dates)]; // Remove duplicates
  };

  const getClassCategory = (classType) => {
    if (!classType) return 'other';
    const upper = classType.toUpperCase();

    // Check for course identifier prefixes (WT, HB, KD)
    if (upper.startsWith('WT')) return 'wheelthrowing-beginner'; // Default all wheelthrowing to beginner
    if (upper.startsWith('HB')) return 'handbuilding';
    if (upper.startsWith('KD')) return 'kids';

    // Fallback to word matching
    const lower = classType.toLowerCase();
    if (lower.includes('wheelthrowing') && lower.includes('beginner')) return 'wheelthrowing-beginner';
    if (lower.includes('wheelthrowing') && lower.includes('intermediate')) return 'wheelthrowing-intermediate';
    if (lower.includes('handbuilding')) return 'handbuilding';
    if (lower.includes('kids') || lower.includes('children')) return 'kids';
    return 'other';
  };

  const classTypeConfig = {
    'all': {
      label: 'All Classes',
      bgActive: 'bg-gray-500',
      bgInactive: 'bg-background',
      border: 'border-gray-500',
      text: 'text-gray-700',
      bgLight: 'bg-gray-500/20',
      iconBg: 'bg-gray-500/20',
      iconText: 'text-gray-700'
    },
    'wheelthrowing-beginner': {
      label: 'Wheelthrowing Beginner',
      bgActive: 'bg-orange-500',
      bgInactive: 'bg-background',
      border: 'border-orange-500',
      text: 'text-orange-700',
      bgLight: 'bg-orange-500/20',
      iconBg: 'bg-orange-500/20',
      iconText: 'text-orange-700'
    },
    'wheelthrowing-intermediate': {
      label: 'Wheelthrowing Intermediate',
      bgActive: 'bg-cyan-500',
      bgInactive: 'bg-background',
      border: 'border-cyan-500',
      text: 'text-cyan-700',
      bgLight: 'bg-cyan-500/20',
      iconBg: 'bg-cyan-500/20',
      iconText: 'text-cyan-700'
    },
    'handbuilding': {
      label: 'Handbuilding',
      bgActive: 'bg-black',
      bgInactive: 'bg-background',
      border: 'border-black',
      text: 'text-black',
      bgLight: 'bg-black/20',
      iconBg: 'bg-black/20',
      iconText: 'text-black'
    },
    'kids': {
      label: 'Kids Classes',
      bgActive: 'bg-yellow-500',
      bgInactive: 'bg-background',
      border: 'border-yellow-500',
      text: 'text-yellow-700',
      bgLight: 'bg-yellow-500/20',
      iconBg: 'bg-yellow-500/20',
      iconText: 'text-yellow-700'
    }
  };

  const getRescheduleClassesForDate = (date) => {
    const makeupClasses = getAvailableMakeupClasses();

    // Format date as YYYY-MM-DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    return makeupClasses.filter(c => c.classDate?.startsWith(dateStr));
  };

  // Helper function to parse class datetime
  const parseClassDateTime = (classDateStr, startTimeStr) => {
    try {
      // classDateStr is like "2025-10-31T00:00:00"
      // startTimeStr is like "9:30 AM" or "09:30 AM"
      const datePart = classDateStr.split('T')[0]; // Get YYYY-MM-DD
      const [time, period] = startTimeStr.split(' '); // Split "9:30 AM" into ["9:30", "AM"]
      const [hours, minutes] = time.split(':').map(Number);

      // Convert to 24-hour format
      let hour24 = hours;
      if (period === 'PM' && hours !== 12) {
        hour24 = hours + 12;
      } else if (period === 'AM' && hours === 12) {
        hour24 = 0;
      }

      // Create date object with the parsed time
      const [year, month, day] = datePart.split('-').map(Number);
      return new Date(year, month - 1, day, hour24, minutes);
    } catch (error) {
      console.error('Error parsing class datetime:', classDateStr, startTimeStr, error);
      return new Date(NaN); // Return invalid date
    }
  };

  const getAvailableMakeupClasses = () => {
    if (!selectedClass) return [];

    const classCategory = getClassCategory(selectedClass.classType);

    // Check for glazing class by looking at fullCourseIdentifier
    // Glazing classes are Week 6 of 6-week courses (ends with .6)
    const isGlazingClass = selectedClass.fullCourseIdentifier?.endsWith('.6');

    console.log('🔍 RESCHEDULE CHECK:', {
      classType: selectedClass.classType,
      fullCourseIdentifier: selectedClass.fullCourseIdentifier,
      isGlazingClass,
      category: classCategory
    });

    // Filter out classes starting in less than 30 minutes
    const now = new Date();
    const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);

    // Find all bookings for this student to determine their course start date
    const studentBookingsForCourse = myBookings.filter(booking => {
      const bookingCategory = getClassCategory(booking.class.classType);
      return bookingCategory === classCategory && booking.status === 'booked';
    });

    // Determine the course start date (earliest class in their bookings)
    let courseStartDate = null;
    if (studentBookingsForCourse.length > 0) {
      const dates = studentBookingsForCourse.map(b => new Date(b.class.classDate));
      courseStartDate = new Date(Math.min(...dates));
    }

    // Calculate time window: 6 weeks course + 2 weeks buffer = 8 weeks from course start
    const eightWeeksFromStart = courseStartDate
      ? new Date(courseStartDate.getTime() + (8 * 7 * 24 * 60 * 60 * 1000))
      : null;

    // Flatten all classes from all courses
    const allClasses = [];
    classes.forEach(course => {
      course.classes?.forEach(cls => {
        allClasses.push({
          ...cls,
          id: cls.id,
          classDate: cls.class_date,
          classType: cls.class_type,
          startTime: cls.start_time,
          endTime: cls.end_time,
          instructor: cls.instructor,
          maxCapacity: cls.max_capacity,
          currentEnrollment: cls.bookingCount,
          isCompletelyFull: cls.bookingCount >= cls.max_capacity
        });
      });
    });

    // For handbuilding (continuous classes), show classes within 8 weeks from course start
    if (classCategory === 'handbuilding') {
      return allClasses.filter(c => {
        const isHandbuilding = getClassCategory(c.classType) === 'handbuilding';
        const isDifferentClass = c.id !== selectedClass.id;
        const hasSpace = !c.isCompletelyFull && c.currentEnrollment < c.maxCapacity;

        // Check if class starts at least 30 minutes from now
        const classDateTime = parseClassDateTime(c.classDate, c.startTime);
        const isAtLeast30MinAway = classDateTime >= thirtyMinutesFromNow;

        // Check if within 8-week window from course start
        const withinTimeWindow = eightWeeksFromStart
          ? classDateTime <= eightWeeksFromStart
          : true; // If we can't determine course start, allow all

        return isHandbuilding && isDifferentClass && hasSpace && isAtLeast30MinAway && withinTimeWindow;
      });
    }

    // For glazing classes (Week 6/6), allow rescheduling up to 2 courses ahead (12 weeks)
    if (isGlazingClass) {
      const selectedClassDate = new Date(selectedClass.classDate);
      const twelveWeeksAhead = new Date(selectedClassDate.getTime() + (12 * 7 * 24 * 60 * 60 * 1000));

      console.log('🔍 GLAZING CLASS RESCHEDULE');
      console.log('Selected class:', selectedClass);
      console.log('12 weeks ahead:', twelveWeeksAhead);
      console.log('Total classes to filter:', allClasses.length);

      const filtered = allClasses.filter(c => {
        // Glazing classes are Week 6 of 6-week courses (fullCourseIdentifier ends with .6)
        const isOtherGlazingClass = c.fullCourseIdentifier?.endsWith('.6') || c.courseIdentifier?.endsWith('.6');
        const isDifferentClass = c.id !== selectedClass.id;

        // Glazing classes have max capacity of 14, not 8
        const glazingMaxCapacity = 14;
        const hasSpace = !c.isCompletelyFull && c.currentEnrollment < glazingMaxCapacity;

        // Check if class starts at least 30 minutes from now
        const classDateTime = parseClassDateTime(c.classDate, c.startTime);
        const isAtLeast30MinAway = classDateTime >= thirtyMinutesFromNow;

        // Check if within 12 weeks (2 courses) ahead
        const withinTwoCourses = classDateTime <= twelveWeeksAhead;

        if (isOtherGlazingClass) {
          console.log('Found glazing class:', {
            id: c.id,
            classType: c.classType,
            fullCourseIdentifier: c.fullCourseIdentifier,
            courseIdentifier: c.courseIdentifier,
            date: c.classDate,
            startTime: c.startTime,
            currentEnrollment: c.currentEnrollment,
            maxCapacity: glazingMaxCapacity,
            hasSpace,
            isDifferentClass,
            isAtLeast30MinAway,
            withinTwoCourses,
            passes: isOtherGlazingClass && isDifferentClass && hasSpace && isAtLeast30MinAway && withinTwoCourses
          });
        }

        return isOtherGlazingClass && isDifferentClass && hasSpace && isAtLeast30MinAway && withinTwoCourses;
      });

      console.log('✅ Filtered glazing classes:', filtered.length);
      return filtered;
    }

    // For wheelthrowing (week-based courses), show classes within 8 weeks from course start
    const currentWeek = getWeekNumberFromClassType(selectedClass.classType);
    if (!currentWeek) return [];

    return allClasses.filter(c => {
      // FIRST: Check if this is a Week 6/6 Glazing class - if so, exclude it immediately
      const isWeek6Glazing = c.classType?.includes('Week 6/6') && c.classType?.includes('Glazing');
      if (isWeek6Glazing) {
        return false; // Always exclude Week 6/6 Glazing classes for Week 1-5 students
      }

      const classWeek = getWeekNumberFromClassType(c.classType);
      const sameCategory = getClassCategory(c.classType) === classCategory;
      const hasSpace = !c.isCompletelyFull && c.currentEnrollment < c.maxCapacity;

      // Check if class starts at least 30 minutes from now
      const classDateTime = parseClassDateTime(c.classDate, c.startTime);
      const isAtLeast30MinAway = classDateTime >= thirtyMinutesFromNow;

      // Check if within 8-week window from course start
      const withinTimeWindow = eightWeeksFromStart
        ? classDateTime <= eightWeeksFromStart
        : true; // If we can't determine course start, allow all

      return classWeek !== null &&
             classWeek >= 1 && classWeek <= 5 &&
             sameCategory &&
             c.id !== selectedClass.id &&
             hasSpace &&
             isAtLeast30MinAway &&
             withinTimeWindow;
    });
  };

  const handleReschedule = async (newClassId) => {
    try {
      await api.post('/classes/reschedule', {
        oldClassId: selectedClass.id,
        newClassId: newClassId
      });

      alert('Successfully rescheduled your class!');
      setShowRescheduleModal(false);
      setSelectedClass(null);
      fetchClasses();
      fetchMyBookings();
    } catch (error) {
      console.error('Error rescheduling:', error);
      alert(error.response?.data?.error || 'Failed to reschedule class');
    }
  };

  const handleJoinWaitlist = async () => {
    try {
      const response = await api.post('/classes/waitlist/join', {
        classInstanceId: selectedClass.id
      });

      alert(response.data.waitlist.message || 'Successfully joined the waitlist!');
      setShowWaitlistModal(false);
      setSelectedClass(null);
      fetchClasses();
    } catch (error) {
      console.error('Error joining waitlist:', error);
      alert(error.response?.data?.error || 'Failed to join waitlist');
    }
  };

  const handlePauseRequest = async () => {
    try {
      // Request pause calculation from backend
      const response = await api.post('/classes/pause/calculate', {
        classId: selectedClass.id
      });

      setPauseCalculation(response.data);
      setShowPauseModal(true);
    } catch (error) {
      console.error('Error calculating pause:', error);
      alert(error.response?.data?.error || 'Failed to calculate pause fee. You may have already used your pause for this course.');
    }
  };

  const confirmPause = async () => {
    try {
      const response = await api.post('/classes/pause', {
        classId: selectedClass.id
      });

      // Show payment link to user
      if (response.data.paymentLink) {
        alert(`Your course has been paused. Please complete payment to continue:\n\n${response.data.paymentLink}\n\nYou have 30 days to resume your course.`);
        window.open(response.data.paymentLink, '_blank');
      } else {
        alert(response.data.message || 'Course paused successfully!');
      }

      setShowPauseModal(false);
      setShowRescheduleModal(false);
      setSelectedClass(null);
      fetchClasses();
      fetchMyBookings();
    } catch (error) {
      console.error('Error pausing course:', error);
      alert(error.response?.data?.error || 'Failed to pause course');
    }
  };

  const classesForSelectedDate = getClassesForDate(selectedDate);

  return (
    <div className="min-h-screen bg-background font-display text-text">
      <Navigation />

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8 lg:items-start">
          {/* Calendar */}
          <div className="flex-1 lg:max-w-md">
            {/* Class Type Filter Dropdown */}
            <div className="mb-4">
              <p className="text-sm font-bold text-text-muted mb-2 uppercase">Filter by Class Type</p>
              <div className="relative">
                <select
                  value={classTypeFilter}
                  onChange={(e) => setClassTypeFilter(e.target.value)}
                  className={`w-full px-4 py-2.5 text-sm font-bold uppercase border transition-colors appearance-none cursor-pointer ${
                    classTypeConfig[classTypeFilter].border
                  } ${classTypeConfig[classTypeFilter].text} bg-background hover:bg-background-alt`}
                  style={{
                    paddingRight: '2.5rem'
                  }}
                >
                  {Object.entries(classTypeConfig).map(([key, config]) => (
                    <option key={key} value={key}>
                      {config.label}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <span className="material-symbols-outlined text-text-muted">expand_more</span>
                </div>
              </div>
            </div>

            <ClassCalendar
              currentMonth={currentMonth}
              onMonthChange={setCurrentMonth}
              onDateSelect={(date, dayClasses, event) => {
                setSelectedDate(date);

                // When clicking a date, check for course classes to highlight the full course
                if (dayClasses && dayClasses.length > 0) {
                  // Get week-based course classes on this date
                  const courseClassesOnDate = dayClasses.filter(c => {
                    // Check if this is a week-based course (has fullCourseIdentifier with week number like .1, .2, etc)
                    return c.fullCourseIdentifier && c.fullCourseIdentifier.includes('.');
                  });

                  // Check if there are multiple different courses (different start times)
                  const uniqueStartTimes = [...new Set(courseClassesOnDate.map(c => c.startTime))];
                  const hasMultipleCourses = uniqueStartTimes.length > 1;

                  if (hasMultipleCourses) {
                    // Multiple courses - show dropdown menu
                    const uniqueCourses = [];
                    const seenTimes = new Set();

                    courseClassesOnDate.forEach(c => {
                      if (!seenTimes.has(c.startTime)) {
                        seenTimes.add(c.startTime);
                        uniqueCourses.push(c);
                      }
                    });

                    setCourseMenuOptions(uniqueCourses);

                    // Position menu near the clicked cell
                    const rect = event.currentTarget.getBoundingClientRect();
                    let menuX = rect.left;
                    let menuY = rect.bottom;

                    // Ensure menu doesn't go off-screen horizontally
                    const menuWidth = 250;
                    if (menuX + menuWidth > window.innerWidth) {
                      menuX = window.innerWidth - menuWidth - 10;
                    }

                    setCourseMenuPosition({ x: menuX, y: menuY });
                    setShowCourseMenu(true);
                  } else if (courseClassesOnDate.length === 1) {
                    // Only one course - highlight it immediately
                    const courseDates = getCourseDates(courseClassesOnDate[0]);
                    setHighlightedCourseDates(courseDates);
                    setShowCourseMenu(false);
                  } else {
                    setHighlightedCourseDates([]);
                    setShowCourseMenu(false);
                  }
                } else {
                  setHighlightedCourseDates([]);
                  setShowCourseMenu(false);
                }
              }}
              selectedDate={selectedDate}
              getClassesForDate={getClassesForDate}
              highlightedDates={highlightedCourseDates}
              classTypeConfig={classTypeConfig}
              getClassCategory={getClassCategory}
              classTypeFilter={classTypeFilter}
              isAdminView={false}
              myBookings={myBookings}
              isEnrolled={isEnrolled}
            />
          </div>

          {/* Class List */}
          <div className="flex-1">
            <div className="mb-4">
              <p className="text-sm font-bold text-text-muted mb-2 uppercase">
                Class Schedule
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {classesForSelectedDate.length === 0 ? (
                <p className="text-text-muted">No classes scheduled for this date.</p>
              ) : (
                classesForSelectedDate.map((classItem) => {
                  const enrolled = isEnrolled(classItem.id);
                  const isGlazingClass = classItem.fullCourseIdentifier?.endsWith('.6');
                  const isPast = new Date(classItem.classDate) < new Date();
                  const isSoldOut = classItem.isFull || (classItem.currentEnrollment >= classItem.maxCapacity);
                  const classCategory = getClassCategory(classItem.classType);
                  const categoryConfig = classTypeConfig[classCategory] || classTypeConfig['wheelthrowing-beginner'];

                  return (
                    <div
                      key={classItem.id}
                      className={`bg-background-alt p-4 border ${
                        enrolled ? 'border-blue-500 bg-blue-500/5' :
                        isGlazingClass ? 'border-amber-900' :
                        categoryConfig.border
                      } flex items-center justify-between gap-4`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`${
                          enrolled ? 'text-blue-500 bg-blue-500/20' :
                          isGlazingClass ? 'text-amber-900 bg-amber-900/20' :
                          `${categoryConfig.iconText} ${categoryConfig.iconBg}`
                        } flex flex-col items-center justify-center shrink-0 w-16 h-16 p-1`}>
                          <span className="text-xs font-bold leading-none">
                            {formatShortDate(classItem.classDate).month}
                          </span>
                          <span className="text-2xl font-bold leading-none mt-1">
                            {formatShortDate(classItem.classDate).day}
                          </span>
                        </div>
                        <div className="flex flex-col justify-center">
                          <div className="flex items-center gap-2">
                            <p className="font-bold">{classItem.classType}</p>
                            {enrolled && (
                              <span className="px-2 py-0.5 bg-blue-500 text-white text-xs font-bold uppercase">Enrolled</span>
                            )}
                            {!enrolled && isSoldOut && (
                              <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold uppercase">Full</span>
                            )}
                            {isGlazingClass && !enrolled && !isSoldOut && (
                              <span className="px-2 py-0.5 bg-amber-900 text-white text-xs font-bold uppercase">Final Week</span>
                            )}
                          </div>
                          <p className="text-sm text-text-muted">
                            {classItem.startTime} - {classItem.endTime} with {classItem.instructor}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {enrolled ? (
                          <button
                            onClick={() => {
                              setSelectedClass(classItem);
                              setShowRescheduleModal(true);
                              // Reset to today when opening modal
                              setRescheduleSelectedDate(new Date());
                              setRescheduleCurrentMonth(new Date());
                            }}
                            disabled={isPast}
                            className={`flex min-w-[84px] max-w-[480px] items-center justify-center overflow-hidden h-8 px-4 ${
                              isPast ? 'bg-text-muted cursor-not-allowed' : 'bg-blue-500 cursor-pointer hover:bg-blue-600'
                            } text-white text-sm font-medium`}
                          >
                            <span className="truncate">{isPast ? 'Ended' : 'Reschedule'}</span>
                          </button>
                        ) : isSoldOut ? (
                          <button
                            onClick={() => {
                              setSelectedClass(classItem);
                              setShowWaitlistModal(true);
                            }}
                            className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden h-8 px-4 bg-red-500 text-white text-sm font-medium"
                          >
                            <span className="truncate">Join Waitlist</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              // Redirect to Shopify for booking and payment
                              const category = getClassCategory(classItem.classType);
                              const url = category === 'handbuilding'
                                ? 'https://ves.sg/products/handbuilding-pottery-course'
                                : 'https://ves.sg/products/wheelthrowing-pottery-course';
                              window.location.href = url;
                            }}
                            className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden h-8 px-4 bg-accent text-white text-sm font-medium"
                          >
                            <span className="truncate">Book Course</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Booking Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-background-alt border border-border shadow-lg w-full max-w-lg my-8">
            <div className="p-6 border-b border-border">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold uppercase">{selectedClass?.classType}</h3>
                  <p className="text-sm text-text-muted mt-1">with {selectedClass?.instructor}</p>
                </div>
                <button
                  className="p-2 hover:bg-background"
                  onClick={() => setShowModal(false)}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {getClassCategory(selectedClass?.classType) === 'handbuilding' ? (
                <>
                  <div className="bg-amber-600/10 border border-amber-600 p-3 mb-4">
                    <p className="text-sm font-bold text-amber-700">HANDBUILDING COURSE ENROLLMENT</p>
                    <p className="text-xs text-text-muted mt-1">
                      Select your course length below. All courses meet weekly on Wednesdays.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={() => setCourseWeeks(4)}
                      className={`w-full p-4 border text-left transition-all ${
                        courseWeeks === 4
                          ? 'border-amber-600 bg-amber-600/10'
                          : 'border-border hover:border-amber-600/50'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-lg">4-Week Course</p>
                          <p className="text-sm text-text-muted mt-1">
                            Learn pottery basics and fundamental handbuilding techniques
                          </p>
                          <p className="text-xs text-text-muted mt-1">
                            Pinching, coiling, slab-building, and glazing
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-xl">$360</p>
                          <p className="text-xs text-text-muted">4 sessions</p>
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => setCourseWeeks(8)}
                      className={`w-full p-4 border text-left transition-all ${
                        courseWeeks === 8
                          ? 'border-amber-600 bg-amber-600/10'
                          : 'border-border hover:border-amber-600/50'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-lg">8-Week Course</p>
                          <p className="text-sm text-text-muted mt-1">
                            Extend into sculptural work and expressive forms
                          </p>
                          <p className="text-xs text-text-muted mt-1">
                            Faces, figures, and abstract designs
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-xl">$640</p>
                          <p className="text-xs text-text-muted">8 sessions</p>
                        </div>
                      </div>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-amber-900/10 border border-amber-900 p-3 mb-4">
                    <p className="text-sm font-bold text-amber-900">6-WEEK COURSE ENROLLMENT</p>
                    <p className="text-xs text-text-muted mt-1">
                      You'll be enrolled in all 6 weeks of this course ({selectedClass?.startTime} every week with {selectedClass?.instructor})
                    </p>
                  </div>
                  <p className="text-base">
                    This 6-week course will help you develop your pottery skills. Learn wheelthrowing techniques and create beautiful pieces.
                  </p>
                </>
              )}

              <div>
                <p className="font-bold">Schedule:</p>
                <p>{selectedClass?.startTime} - {selectedClass?.endTime} with {selectedClass?.instructor}</p>
                <p className="text-sm text-text-muted">
                  {courseWeeks ? `Repeats weekly for ${courseWeeks} weeks` : 'Select a course option above'}
                </p>
              </div>
              <div>
                <p className="font-bold">Location:</p>
                <p>{selectedClass?.room || 'Studio A'}</p>
              </div>
            </div>

            <div className="p-6 bg-background border-t border-border">
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleBooking(); }}>
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="notes">
                    Note to Instructor (optional)
                  </label>
                  <textarea
                    className="form-textarea w-full border-border bg-background-alt"
                    id="notes"
                    rows="2"
                    value={bookingNotes}
                    onChange={(e) => setBookingNotes(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden h-10 px-4 bg-border text-text text-sm font-bold"
                    onClick={() => setShowModal(false)}
                  >
                    <span>Cancel</span>
                  </button>
                  <button
                    type="submit"
                    className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden h-10 px-4 bg-accent text-white text-sm font-bold"
                  >
                    <span>Book Now</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {showRescheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-background-alt border border-border shadow-lg w-full max-w-5xl my-8">
            <div className="p-6 border-b border-border">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold uppercase">Reschedule Class</h3>
                  <p className="text-sm text-text-muted mt-1">
                    {selectedClass?.classType} with {selectedClass?.instructor} - {formatDate(new Date(selectedClass?.classDate))} at {selectedClass?.startTime}
                  </p>
                </div>
                <button
                  className="p-2 hover:bg-background"
                  onClick={() => {
                    setShowRescheduleModal(false);
                    setRescheduleSelectedDate(new Date());
                    setRescheduleCurrentMonth(new Date());
                  }}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="bg-blue-500/10 border border-blue-500 p-3 mb-4">
                <p className="text-xs text-text-muted">
                  Select an available date below to see classes you can reschedule to. Your current booking will be canceled. Only classes starting at least 30 minutes from now are shown.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Calendar Section - Using Shared ClassCalendar Component */}
                <div>
                  <ClassCalendar
                    currentMonth={rescheduleCurrentMonth}
                    onMonthChange={setRescheduleCurrentMonth}
                    onDateSelect={(date) => setRescheduleSelectedDate(date)}
                    selectedDate={rescheduleSelectedDate}
                    getClassesForDate={(date) => {
                      // Return available makeup classes for this date
                      const classesOnDate = getRescheduleClassesForDate(date);
                      // Map to format expected by ClassCalendar
                      return classesOnDate.map(c => ({
                        ...c,
                        class_type: c.classType,
                        fullCourseIdentifier: c.fullCourseIdentifier || c.courseIdentifier
                      }));
                    }}
                    highlightedDates={[]}
                    classTypeConfig={{
                      'all': { bgLight: 'bg-blue-500/20' },
                      'wheelthrowing-beginner': { bgLight: 'bg-blue-500/20' },
                      'wheelthrowing-intermediate': { bgLight: 'bg-blue-500/20' },
                      'handbuilding': { bgLight: 'bg-blue-500/20' },
                      'kids': { bgLight: 'bg-blue-500/20' }
                    }}
                    getClassCategory={getClassCategory}
                    classTypeFilter="all"
                    isAdminView={false}
                    isEnrolled={() => false}
                  />
                </div>

                {/* Class List Section */}
                <div>
                  <p className="text-sm font-bold text-text-muted mb-3 uppercase">
                    Available Classes on {formatDate(rescheduleSelectedDate)}
                  </p>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {getRescheduleClassesForDate(rescheduleSelectedDate).length === 0 ? (
                      <p className="text-text-muted text-center py-8">
                        No available classes on this date. Please select another date or contact the studio.
                      </p>
                    ) : (
                      getRescheduleClassesForDate(rescheduleSelectedDate).map((classItem) => {
                        const isGlazingClass = classItem.classType?.includes('Week 6/6') && classItem.classType?.includes('Glazing');
                        const classDate = new Date(classItem.classDate);

                        return (
                          <div
                            key={classItem.id}
                            className={`bg-background p-4 border ${
                              isGlazingClass ? 'border-amber-900' : 'border-border'
                            } flex flex-col gap-2`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-bold text-sm">{classItem.classType}</p>
                                  {isGlazingClass && (
                                    <span className="px-2 py-0.5 bg-amber-900 text-white text-xs font-bold uppercase">Final Week</span>
                                  )}
                                </div>
                                <p className="text-xs text-text-muted">
                                  {classItem.startTime} - {classItem.endTime}
                                </p>
                                <p className="text-xs text-text-muted">
                                  with {classItem.instructor}
                                </p>
                              </div>
                              <button
                                onClick={() => {
                                  if (window.confirm(`Reschedule to ${formatDate(classDate)} at ${classItem.startTime} with ${classItem.instructor}?`)) {
                                    handleReschedule(classItem.id);
                                  }
                                }}
                                className="flex min-w-[70px] cursor-pointer items-center justify-center h-8 px-3 bg-accent text-white text-xs font-medium"
                              >
                                <span className="truncate">Select</span>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 bg-background border-t border-border flex justify-between items-center">
              <button
                onClick={handlePauseRequest}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors text-sm font-bold"
              >
                <span className="material-symbols-outlined text-sm">pause_circle</span>
                <span>Pause Course</span>
              </button>
              <button
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden h-10 px-4 bg-border text-text text-sm font-bold"
                onClick={() => {
                  setShowRescheduleModal(false);
                  setRescheduleSelectedDate(new Date());
                  setRescheduleCurrentMonth(new Date());
                }}
              >
                <span>Cancel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause Confirmation Modal */}
      {showPauseModal && pauseCalculation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-background-alt border border-border shadow-lg w-full max-w-lg">
            <div className="p-6 border-b border-border">
              <h3 className="text-2xl font-bold uppercase">Pause Course</h3>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-yellow-500/10 border border-yellow-500 p-3">
                <p className="text-sm font-bold text-yellow-700">IMPORTANT INFORMATION</p>
                <ul className="text-xs text-text-muted mt-2 space-y-1 list-disc list-inside">
                  <li>You can only pause once per course</li>
                  <li>Pause is valid for 30 days maximum</li>
                  <li>You can resume in the next available {pauseCalculation.courseType} course</li>
                  <li>A fee of $40/class applies for remaining classes</li>
                </ul>
              </div>

              <div className="bg-blue-500/10 border border-blue-500 p-4">
                <p className="text-sm font-bold text-blue-700 mb-3">PAUSE SUMMARY</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Remaining Classes:</span>
                    <span className="font-bold">{pauseCalculation.remainingClasses}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Fee per Class:</span>
                    <span className="font-bold">$40.00</span>
                  </div>
                  <div className="border-t border-blue-500/20 pt-2 flex justify-between">
                    <span className="text-text-muted font-bold">Total Pause Fee:</span>
                    <span className="font-bold text-lg text-blue-700">${pauseCalculation.totalFee.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <p className="text-sm text-text-muted">
                After confirming, you'll receive a payment link. Once paid, you can resume your course in the next available {pauseCalculation.courseType} course within 30 days.
              </p>
            </div>

            <div className="p-6 bg-background border-t border-border flex justify-end gap-2">
              <button
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden h-10 px-4 bg-border text-text text-sm font-bold"
                onClick={() => {
                  setShowPauseModal(false);
                  setPauseCalculation(null);
                }}
              >
                <span>Cancel</span>
              </button>
              <button
                onClick={confirmPause}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden h-10 px-4 bg-yellow-500 text-white text-sm font-bold hover:bg-yellow-600"
              >
                <span>Confirm Pause</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Waitlist Modal */}
      {showWaitlistModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-background-alt border border-border shadow-lg w-full max-w-lg my-8">
            <div className="p-6 border-b border-border">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold uppercase">Join Waitlist</h3>
                  <p className="text-sm text-text-muted mt-1">{selectedClass?.classType}</p>
                </div>
                <button
                  className="p-2 hover:bg-background"
                  onClick={() => setShowWaitlistModal(false)}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-red-500/10 border border-red-500 p-3">
                <p className="text-sm font-bold text-red-700">CLASS IS FULL</p>
                <p className="text-xs text-text-muted mt-1">
                  This class is currently at full capacity. Join the waitlist to be notified when a spot becomes available.
                </p>
              </div>

              <div>
                <p className="font-bold">Class Details:</p>
                <p>{selectedClass?.classType}</p>
                <p className="text-sm text-text-muted">
                  {formatDate(new Date(selectedClass?.classDate))} at {selectedClass?.startTime}
                </p>
                <p className="text-sm text-text-muted">with {selectedClass?.instructor}</p>
              </div>

              <div className="bg-blue-500/10 border border-blue-500 p-3">
                <p className="text-sm font-bold text-blue-700">HOW THE WAITLIST WORKS</p>
                <ul className="text-xs text-text-muted mt-2 space-y-1 list-disc list-inside">
                  <li>You'll be added to the waitlist in order</li>
                  <li>If a spot opens, we'll notify the next person on the list</li>
                  <li>You'll have 24 hours to claim your spot</li>
                  <li>You can leave the waitlist at any time</li>
                </ul>
              </div>
            </div>

            <div className="p-6 bg-background border-t border-border flex justify-end gap-2">
              <button
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden h-10 px-4 bg-border text-text text-sm font-bold"
                onClick={() => setShowWaitlistModal(false)}
              >
                <span>Cancel</span>
              </button>
              <button
                onClick={handleJoinWaitlist}
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden h-10 px-4 bg-red-500 text-white text-sm font-bold"
              >
                <span>Join Waitlist</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Course Selection Dropdown Menu */}
      {showCourseMenu && (
        <>
          {/* Backdrop to close menu */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowCourseMenu(false)}
          />

          {/* Menu */}
          <div
            className="fixed z-50 bg-background-alt border border-border shadow-lg"
            style={{
              left: `${courseMenuPosition.x}px`,
              top: `${courseMenuPosition.y}px`,
              minWidth: '250px',
              maxWidth: '350px'
            }}
          >
            <div className="py-1">
              <p className="text-xs font-bold text-text-muted uppercase px-3 py-2">Select Course</p>
              <div className="border-t border-gray-300"></div>
              {courseMenuOptions.map((course, index) => {
                const category = getClassCategory(course.classType);
                const config = classTypeConfig[category] || classTypeConfig['wheelthrowing-beginner'];

                return (
                  <div key={course.startTime}>
                    {index > 0 && <div className="border-t border-gray-300"></div>}
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-background transition-colors"
                      onClick={() => {
                      const courseDates = getCourseDates(course);
                      setHighlightedCourseDates(courseDates);
                      setShowCourseMenu(false);

                      // Adjust calendar view to show the course optimally
                      if (courseDates && courseDates.length > 0) {
                        // Sort dates to get first and last
                        const sortedDates = [...courseDates].sort();
                        const firstCourseDate = new Date(sortedDates[0] + 'T12:00:00');
                        const lastCourseDate = new Date(sortedDates[sortedDates.length - 1] + 'T12:00:00');

                        const firstMonth = firstCourseDate.getMonth();
                        const firstYear = firstCourseDate.getFullYear();
                        const lastMonth = lastCourseDate.getMonth();
                        const lastYear = lastCourseDate.getFullYear();

                        // Calculate month difference
                        const monthDiff = (lastYear - firstYear) * 12 + (lastMonth - firstMonth);

                        // We display 2 consecutive months
                        // If course spans exactly 2 months, show those 2 months
                        // If course spans 3+ months, show the first 2 months
                        // But we want to optimize to show the maximum number of course dates

                        // Strategy: If the last date is in the 3rd month (monthDiff === 2),
                        // and most dates are in months 2 and 3, show months 2-3 instead of 1-2
                        if (monthDiff === 2) {
                          // Course spans 3 months - check which 2-month window captures more dates
                          const month2Start = new Date(firstYear, firstMonth + 1, 1);
                          const datesInLaterMonths = sortedDates.filter(dateStr => {
                            const d = new Date(dateStr + 'T12:00:00');
                            return d >= month2Start;
                          }).length;

                          // If most dates are in the later 2 months, show those
                          if (datesInLaterMonths >= sortedDates.length - 1) {
                            setCurrentMonth(new Date(firstYear, firstMonth + 1, 1));
                          } else {
                            setCurrentMonth(new Date(firstYear, firstMonth, 1));
                          }
                        } else {
                          // Course spans 2 or fewer months, show from first month
                          setCurrentMonth(new Date(firstYear, firstMonth, 1));
                        }
                      }
                    }}
                  >
                      <p className="font-bold text-sm">{course.startTime}</p>
                      <p className="text-xs text-text-muted">{course.classType}</p>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
