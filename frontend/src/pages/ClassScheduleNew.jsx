import { useState, useEffect } from 'react';
import api, { classesAPI } from '../utils/api';
import Navigation from '../components/Navigation';
import ClassCalendar from '../components/ClassCalendar';

export default function ClassScheduleNew() {
  const [classes, setClasses] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [studentData, setStudentData] = useState(null);
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
    fetchStudentData();
  }, []);

  const fetchStudentData = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return; // Not logged in

      const response = await api.get('/students/me');
      setStudentData(response.data.student);
    } catch (error) {
      console.error('Error fetching student data:', error);
    }
  };

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


  const formatTime = (timeStr) => {
    return timeStr;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'current':
        return 'bg-green-500/10 text-green-700 border-green-500';
      case 'completed':
        return 'bg-blue-500/10 text-blue-700 border-blue-500';
      case 'upcoming':
        return 'bg-orange-500/10 text-orange-700 border-orange-500';
      case 'past':
        return 'bg-gray-500/10 text-gray-700 border-gray-500';
      default:
        return 'bg-gray-500/10 text-gray-700 border-gray-500';
    }
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
            fullCourseIdentifier: cls.course_identifier,
            courseIdentifier: cls.course_identifier,
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

      alert(`Successfully booked in ${courseWeeks}-week course with ${selectedClass.instructor}!`);
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

  const getWeekNumberFromClassType = (classType, courseIdentifier) => {
    // First try to get week from course_identifier (e.g., "WT2201NT_JL6.1" -> week 1)
    if (courseIdentifier) {
      const match = courseIdentifier.match(/\.(\d+)$/);
      if (match) {
        return parseInt(match[1]);
      }
    }

    // Fallback to classType if it contains "Week X"
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
  const parseClassDateTime = (classDateStr, timeStr) => {
    try {
      // classDateStr is like "2025-10-31T00:00:00"
      // timeStr can be:
      // - 12-hour format: "9:30 AM", "09:30 AM", "3:30pm", "12:00pm", "1:00 PM"
      // - 24-hour format: "19:00", "09:30", "14:30"
      const datePart = classDateStr.split('T')[0]; // Get YYYY-MM-DD

      let hour24, minutes;

      // Check if it's 24-hour format (HH:MM without AM/PM)
      const time24Match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
      if (time24Match) {
        hour24 = parseInt(time24Match[1]);
        minutes = parseInt(time24Match[2]);
      } else {
        // Handle 12-hour format
        const normalizedTime = timeStr.toUpperCase().trim();

        // Extract time and period (handle both "3:30 PM" and "3:30PM")
        const match = normalizedTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
        if (!match) {
          throw new Error(`Invalid time format: ${timeStr}`);
        }

        const hours = parseInt(match[1]);
        minutes = parseInt(match[2]);
        const period = match[3];

        // Convert to 24-hour format
        hour24 = hours;
        if (period === 'PM' && hours !== 12) {
          hour24 = hours + 12;
        } else if (period === 'AM' && hours === 12) {
          hour24 = 0;
        }
      }

      // Create date object with the parsed time
      const [year, month, day] = datePart.split('-').map(Number);
      return new Date(year, month - 1, day, hour24, minutes);
    } catch (error) {
      console.error('Error parsing class datetime:', classDateStr, timeStr, error);
      return new Date(NaN); // Return invalid date
    }
  };

  const getAvailableMakeupClasses = () => {
    if (!selectedClass || !studentData) return [];

    const classCategory = getClassCategory(selectedClass.classType);

    // Filter out classes starting in less than 24 hours
    const now = new Date();
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Check if student has 10-class package
    const has10ClassPackage = studentData.classes_allocated === 10 && !studentData.course_expiry_date;

    // For 10-class package: check if this is their 10th class
    const totalBookings = myBookings.length;
    const is10thClass = has10ClassPackage && totalBookings >= 9;

    // Check if old class is glazing
    const isOldClassGlazing = selectedClass.classType?.includes('Week 6/6') && selectedClass.classType?.includes('Glazing');

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
          fullCourseIdentifier: cls.course_identifier,
          courseIdentifier: cls.course_identifier
        });
      });
    });

    console.log('🔍 RESCHEDULE - Looking for classes to reschedule to');
    console.log('Selected class category:', classCategory);
    console.log('Has 10-class package:', has10ClassPackage);
    console.log('Is 10th class (must be glazing):', is10thClass);
    console.log('Is old class glazing:', isOldClassGlazing);
    console.log('Total bookings:', totalBookings);
    console.log('Total classes available:', allClasses.length);

    // Simple logic: 10 wheels total, so any class with < 10 students is available
    const availableClasses = allClasses.filter(c => {
      const categoryMatch = getClassCategory(c.classType);
      const sameCategory = categoryMatch === classCategory;
      const isDifferentClass = c.id !== selectedClass.id;

      // Total capacity is 10 wheels - if enrolled < 10, there's space
      const totalWheels = 10;
      const hasSpace = c.currentEnrollment < totalWheels;
      const availableSlots = totalWheels - c.currentEnrollment;

      // Check if class starts at least 24 hours from now
      const classDateTime = parseClassDateTime(c.classDate, c.startTime);
      const isAtLeast24HoursAway = classDateTime >= twentyFourHoursFromNow;
      const isValidTime = !isNaN(classDateTime.getTime());

      // For 10-class package: if this is the 10th class, must be glazing
      const isNewClassGlazing = c.classType?.includes('Week 6/6') && c.classType?.includes('Glazing');
      if (is10thClass && !isNewClassGlazing) {
        return false; // 10th class must be glazing
      }

      // Apply cohort restrictions (only for standard 6-week WT, not 10-class package)
      let cohortRestrictionPasses = true;
      if (!has10ClassPackage && sameCategory) {
        if (isOldClassGlazing) {
          // Old class is glazing: can only reschedule to another glazing class
          cohortRestrictionPasses = isNewClassGlazing;
        } else {
          // Old class is weeks 1-5: must be within cohort dates (we don't have cohort dates in frontend, so skip for now)
          // The backend will enforce this restriction
          cohortRestrictionPasses = true;
        }
      }

      const passes = sameCategory && isDifferentClass && hasSpace && isAtLeast24HoursAway && isValidTime && cohortRestrictionPasses;

      // Log all classes to see what's happening
      console.log('Checking class:', {
        id: c.id,
        classType: c.classType,
        category: categoryMatch,
        sameCategory,
        isDifferentClass,
        date: c.classDate,
        time: c.startTime,
        enrolled: c.currentEnrollment,
        availableSlots,
        hasSpace,
        classDateTime: classDateTime.toString(),
        isValidTime,
        isAtLeast24HoursAway,
        twentyFourHoursFromNow: twentyFourHoursFromNow.toString(),
        cohortRestrictionPasses,
        passes
      });

      return passes;
    });

    console.log('📊 Total available classes for reschedule:', availableClasses.length);
    return availableClasses;
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

  const parseCourseName = (courseIdentifier, classType) => {
    // If we have a valid course identifier, parse it
    if (courseIdentifier && courseIdentifier !== 'N/A') {
      const typeMatch = courseIdentifier.match(/^(WT|HB|CL)/);
      const weeksMatch = courseIdentifier.match(/(\d+)\.\d+$/);

      if (typeMatch) {
        const type = typeMatch[1] === 'WT' ? 'Wheelthrowing' :
                     typeMatch[1] === 'HB' ? 'Handbuilding' :
                     'Class';

        const weeks = weeksMatch ? `${weeksMatch[1]} Weeks` : '';
        return weeks ? `${type} ${weeks}` : type;
      }
    }

    // Fallback to class_type if course_identifier is N/A
    if (classType) {
      if (classType.toLowerCase().includes('wheelthrowing')) {
        return 'Wheelthrowing 6 Weeks';
      } else if (classType.toLowerCase().includes('handbuilding')) {
        return 'Handbuilding 4 Weeks';
      }
      return classType;
    }

    return 'N/A';
  };

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
                setHighlightedCourseDates([]);
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

            {/* Class Credits Display */}
            {studentData && (() => {
              const total = studentData.classes_allocated || 0;
              // Count all active bookings (booked + attended) as they take up allocated slots
              // Exclude cancelled bookings as they free up the slot
              const booked = myBookings.filter(b => b.status === 'booked' || b.status === 'attended').length;
              const available = total - booked;

              // Calculate attended from current course bookings only
              // Count bookings that have ended (status: attended or completed)
              // Also count past classes with 'booked' status as attended
              const today = new Date();
              today.setHours(0, 0, 0, 0);

              const attended = myBookings.filter(booking => {
                const classDate = booking.class?.classDate || booking.classInstance?.classDate || booking.class_date;
                if (!classDate) return false;

                // Get just the date part for comparison
                const bookingDate = new Date(classDate);
                bookingDate.setHours(0, 0, 0, 0);
                const isPast = bookingDate < today;

                // Count if status is 'attended' or 'completed'
                if (booking.status === 'attended' || booking.status === 'completed') {
                  return true;
                }

                // Also count if status is 'booked' but class date is in the past
                if (booking.status === 'booked' && isPast) {
                  return true;
                }

                return false;
              }).length;

              const remaining = total - attended;

              return (
                <div className="mb-8">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Total Classes ({total})</h2>
                  <div className="bg-background-alt border border-border p-4">
                    <div className="grid grid-cols-2 gap-4">
                      {/* Booking Status */}
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-text-muted uppercase">Booking Status</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="px-3 py-2 bg-purple-50 rounded text-center border border-purple-200">
                            <div className="text-xs text-purple-600 font-medium uppercase">Booked</div>
                            <div className="text-xl font-bold text-purple-900">{booked}</div>
                          </div>
                          <div className="px-3 py-2 bg-green-50 rounded text-center border border-green-200">
                            <div className="text-xs text-green-600 font-medium uppercase">Available</div>
                            <div className="text-xl font-bold text-green-900">{available}</div>
                          </div>
                        </div>
                        <div className="text-xs text-center text-text-muted">
                          {booked} + {available} = {total}
                        </div>
                      </div>

                      {/* Attendance Status */}
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-text-muted uppercase">Attendance Status</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="px-3 py-2 bg-gray-50 rounded text-center border border-gray-200">
                            <div className="text-xs text-gray-600 font-medium uppercase">Attended</div>
                            <div className="text-xl font-bold text-gray-900">{attended}</div>
                          </div>
                          <div className="px-3 py-2 bg-blue-50 rounded text-center border border-blue-200">
                            <div className="text-xs text-blue-600 font-medium uppercase">Remaining</div>
                            <div className="text-xl font-bold text-blue-900">{remaining}</div>
                          </div>
                        </div>
                        <div className="text-xs text-center text-text-muted">
                          {attended} + {remaining} = {total}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* My Booked Classes */}
            {myBookings.filter(b => b.status === 'booked' || b.status === 'attended').length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Booked ({myBookings.filter(b => b.status === 'booked' || b.status === 'attended').length})</h2>
                <div className="flex flex-col gap-3">
                  {[...myBookings]
                    .filter(b => b.status === 'booked' || b.status === 'attended')
                    .sort((a, b) => {
                      const dateA = new Date(a.class?.classDate || a.classInstance?.classDate || a.class_date);
                      const dateB = new Date(b.class?.classDate || b.classInstance?.classDate || b.class_date);
                      return dateA - dateB;
                    }).map((booking, index) => {
                    const classDate = booking.class?.classDate || booking.classInstance?.classDate || booking.class_date;
                    const date = new Date(classDate);
                    const classType = booking.class?.classType || booking.classInstance?.classType || booking.class_type;
                    // Get courseIdentifier from multiple possible locations
                    // If not found, use classType as fallback since it often contains the course identifier
                    const courseIdentifier = booking.courseIdentifier ||
                                            booking.course_identifier ||
                                            booking.class?.courseIdentifier ||
                                            booking.class?.course_identifier ||
                                            booking.classInstance?.courseIdentifier ||
                                            booking.classInstance?.course_identifier ||
                                            classType; // Fallback to classType which often is the course identifier
                    const startTime = booking.class?.startTime || booking.classInstance?.startTime || booking.start_time || '7:00pm';
                    const endTime = booking.class?.endTime || booking.classInstance?.endTime || booking.end_time || '9:30pm';
                    const instructor = booking.class?.instructor || booking.classInstance?.instructor || booking.instructor;

                    // Convert class to the format expected by reschedule modal
                    const classItem = {
                      id: booking.class?.id || booking.classInstance?.id || booking.class_id,
                      classDate: classDate,
                      classType: classType,
                      startTime: startTime,
                      endTime: endTime,
                      instructor: instructor,
                      fullCourseIdentifier: courseIdentifier,
                      courseIdentifier: courseIdentifier
                    };

                    // Check if class has completely ended
                    const classEndDateTime = parseClassDateTime(classDate, endTime);
                    const hasEnded = classEndDateTime < new Date();

                    // Check if class is within 24 hours
                    const classStartDateTime = parseClassDateTime(classDate, startTime);
                    const now = new Date();
                    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                    const isWithin24Hours = classStartDateTime < twentyFourHoursFromNow && classStartDateTime > now;

                    // Check if this class's date matches the selected date
                    const isSelectedDate = selectedDate &&
                      date.getFullYear() === selectedDate.getFullYear() &&
                      date.getMonth() === selectedDate.getMonth() &&
                      date.getDate() === selectedDate.getDate();

                    return (
                      <div
                        key={index}
                        className={`bg-blue-50 p-4 flex items-center justify-between ${
                          isSelectedDate ? 'border-2 border-blue-700' : 'border border-blue-200'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="bg-blue-100 text-blue-600 flex flex-col items-center justify-center shrink-0 px-3 py-2">
                            <span className="text-xs font-bold leading-none uppercase">
                              {date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                            </span>
                            <span className="text-2xl font-bold leading-none mt-1">
                              {date.getDate()}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-gray-900">{courseIdentifier || classType}</p>
                              <span className="px-2 py-0.5 bg-blue-500 text-white text-xs font-bold uppercase">Booked</span>
                            </div>
                            <p className="text-sm text-gray-600">
                              {startTime} - {endTime} with {instructor}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (isWithin24Hours) {
                              alert('Cannot reschedule classes within 24 hours of start time. This class will be marked as attended.');
                              return;
                            }
                            setSelectedClass(classItem);
                            setShowRescheduleModal(true);
                            setRescheduleSelectedDate(new Date());
                            setRescheduleCurrentMonth(new Date());
                          }}
                          disabled={hasEnded || isWithin24Hours}
                          className={`px-4 py-2 ${
                            hasEnded || isWithin24Hours ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600 cursor-pointer'
                          } text-white text-sm font-medium`}
                        >
                          {hasEnded ? 'Ended' : isWithin24Hours ? 'Within 24h' : 'Reschedule'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Available Classes Section */}
            {classesForSelectedDate.filter(classItem => !isEnrolled(classItem.id)).length > 0 && (() => {
              const remainingCredits = (studentData?.classes_allocated || 0) - (myBookings?.filter(b => b.status === 'booked' || b.status === 'attended').length || 0);
              return (
                <h2 className="text-xl font-bold text-gray-900 mb-4 mt-4">
                  Available {studentData && remainingCredits > 0 && (
                    <span className="text-green-600">({remainingCredits} {remainingCredits === 1 ? 'credit' : 'credits'})</span>
                  )}
                </h2>
              );
            })()}

            <div className="flex flex-col gap-4">
              {classesForSelectedDate.filter(classItem => !isEnrolled(classItem.id)).length === 0 ? (
                <p className="text-text-muted">No available classes on this date.</p>
              ) : (
                classesForSelectedDate.filter(classItem => !isEnrolled(classItem.id)).map((classItem) => {
                  const enrolled = false; // Already filtered out enrolled classes
                  const isGlazingClass = classItem.fullCourseIdentifier?.endsWith('.6');
                  // Check if class has completely ended (date + end time has passed)
                  const classEndDateTime = parseClassDateTime(classItem.classDate, classItem.endTime);
                  const hasEnded = classEndDateTime < new Date();
                  const isPast = new Date(classItem.classDate) < new Date();
                  // Total capacity is 10 (8 enrollment + 2 makeup slots)
                  // SOLD OUT only when all 10 slots are filled
                  const isSoldOut = classItem.currentEnrollment >= 10;
                  const classCategory = getClassCategory(classItem.classType);
                  const categoryConfig = classTypeConfig[classCategory] || classTypeConfig['wheelthrowing-beginner'];

                  // Debug log for Oct 18 classes
                  if (classItem.classDate?.startsWith('2025-10-18')) {
                    console.log('🔍 Oct 18 class check:', {
                      classType: classItem.classType,
                      classDate: classItem.classDate,
                      endTime: classItem.endTime,
                      classEndDateTime,
                      now: new Date(),
                      hasEnded,
                      enrolled
                    });
                  }

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
                              <span className="px-2 py-0.5 bg-blue-500 text-white text-xs font-bold uppercase">Booked</span>
                            )}
                            {!enrolled && isSoldOut && (
                              <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold uppercase">SOLD OUT</span>
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
                            disabled={hasEnded}
                            className={`flex min-w-[84px] max-w-[480px] items-center justify-center overflow-hidden h-8 px-4 ${
                              hasEnded ? 'bg-text-muted cursor-not-allowed' : 'bg-blue-500 cursor-pointer hover:bg-blue-600'
                            } text-white text-sm font-medium`}
                          >
                            <span className="truncate">{hasEnded ? 'Ended' : 'Reschedule'}</span>
                          </button>
                        ) : isSoldOut ? (
                          <button
                            disabled
                            className="flex min-w-[84px] max-w-[480px] items-center justify-center overflow-hidden h-8 px-4 bg-gray-400 cursor-not-allowed text-white text-sm font-medium"
                          >
                            <span className="truncate">SOLD OUT</span>
                          </button>
                        ) : (() => {
                          // Calculate remaining credits
                          const remainingCredits = (studentData?.classes_allocated || 0) - (myBookings?.filter(b => b.status === 'booked' || b.status === 'attended').length || 0);
                          const hasCredits = remainingCredits > 0;

                          return hasCredits ? (
                            <button
                              onClick={async () => {
                                if (hasEnded) return;
                                try {
                                  const response = await classesAPI.bookMakeupClass(classItem.id);
                                  alert(response.message || 'Class booked successfully!');
                                  // Refresh data
                                  await fetchClasses();
                                  await fetchMyBookings();
                                  await fetchStudentData();
                                } catch (error) {
                                  console.error('Error booking class:', error);
                                  alert(error.response?.data?.error || 'Failed to book class');
                                }
                              }}
                              disabled={hasEnded}
                              className={`flex min-w-[84px] max-w-[480px] items-center justify-center overflow-hidden h-8 px-4 text-white text-sm font-medium ${
                                hasEnded ? 'bg-text-muted cursor-not-allowed' : 'bg-green-600 cursor-pointer hover:bg-green-700'
                              }`}
                            >
                              <span className="truncate">{hasEnded ? 'Ended' : 'Book with Credit'}</span>
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
                              disabled={hasEnded}
                              className={`flex min-w-[84px] max-w-[480px] items-center justify-center overflow-hidden h-8 px-4 text-white text-sm font-medium ${
                                hasEnded ? 'bg-text-muted cursor-not-allowed' : 'bg-accent cursor-pointer'
                              }`}
                            >
                              <span className="truncate">{hasEnded ? 'Ended' : 'Purchase'}</span>
                            </button>
                          );
                        })()}
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
                    <p className="text-sm font-bold text-amber-700">HANDBUILDING COURSE BOOKING</p>
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
                    <p className="text-sm font-bold text-amber-900">6-WEEK COURSE BOOKING</p>
                    <p className="text-xs text-text-muted mt-1">
                      You'll be booked in all 6 weeks of this course ({selectedClass?.startTime} every week with {selectedClass?.instructor})
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
                  Select an available date below to see classes you can reschedule to. Your current booking will be canceled. Only classes starting at least 24 hours from now are shown.
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

    </div>
  );
}
