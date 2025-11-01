import { useState, useEffect } from 'react';
import axios from 'axios';
import Navigation from '../components/Navigation';

const API_URL = 'http://localhost:3000';

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
      const response = await axios.get(`${API_URL}/api/classes/available`);
      console.log('Fetched classes:', response.data.classes?.length, 'classes');
      setClasses(response.data.classes || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
      console.error('Error details:', error.response?.data || error.message);
    }
  };

  const fetchMyBookings = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return; // Not logged in

      const response = await axios.get(`${API_URL}/api/classes/my-bookings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMyBookings(response.data.bookings || []);
    } catch (error) {
      console.error('Error fetching bookings:', error);
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
    // Format date as YYYY-MM-DD in local timezone (not UTC)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    console.log('Looking for classes on:', dateStr);
    console.log('Total classes available:', classes.length);

    let filtered = classes.filter(c => c.classDate?.startsWith(dateStr));
    console.log('Classes found for date:', filtered.length);

    // Apply class type filter
    if (classTypeFilter !== 'all') {
      filtered = filtered.filter(c => getClassCategory(c.classType) === classTypeFilter);
    }

    return filtered;
  };

  // Remove availability status - students don't see capacity numbers

  const handleBooking = async () => {
    if (!courseWeeks) {
      alert('Please select a course length');
      return;
    }

    try {
      const token = localStorage.getItem('token');

      await axios.post(`${API_URL}/api/classes/enroll-course`, {
        firstClassId: selectedClass.id,
        courseWeeks: courseWeeks
      }, {
        headers: { Authorization: `Bearer ${token}` }
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

  // Get all dates in a 6-week course given any class in that course
  const getCourseDates = (clickedClass) => {
    if (!clickedClass) return [];

    const weekNumber = getWeekNumberFromClassType(clickedClass.classType);
    if (!weekNumber) return []; // Not a week-based course

    // Find the instructor and time slot for this course
    const instructor = clickedClass.instructor;
    const startTime = clickedClass.startTime;
    const classCategory = getClassCategory(clickedClass.classType);

    // Get the day of week from the clicked class to distinguish Sat/Sun courses
    const clickedDate = new Date(clickedClass.classDate.split('T')[0] + 'T12:00:00');
    const clickedDayOfWeek = clickedDate.getDay(); // 0=Sunday, 6=Saturday, etc.

    // Find all classes with the same instructor, time, category, AND day of week (same course)
    const courseClasses = classes.filter(c => {
      const sameInstructor = c.instructor === instructor;
      const sameTime = c.startTime === startTime;
      const sameCategory = getClassCategory(c.classType) === classCategory;
      const hasWeekNumber = getWeekNumberFromClassType(c.classType) !== null;

      // Check day of week matches
      const classDate = new Date(c.classDate.split('T')[0] + 'T12:00:00');
      const classDayOfWeek = classDate.getDay();
      const sameDayOfWeek = classDayOfWeek === clickedDayOfWeek;

      return sameInstructor && sameTime && sameCategory && hasWeekNumber && sameDayOfWeek;
    });

    // Extract unique dates (YYYY-MM-DD format)
    // Use the classDate string directly instead of parsing it
    const dates = courseClasses.map(c => {
      // classDate is already in YYYY-MM-DD format from the database
      // Extract just the date part (first 10 characters) to avoid timezone issues
      return c.classDate.split('T')[0]; // Get YYYY-MM-DD part before the time
    });

    return [...new Set(dates)]; // Remove duplicates
  };

  const getClassCategory = (classType) => {
    if (!classType) return 'other';
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
    const isGlazingClass = selectedClass.classType?.includes('Week 6/6') && selectedClass.classType?.includes('Glazing');

    // Filter out classes starting in less than 30 minutes
    const now = new Date();
    const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);

    console.log('=== RESCHEDULE DEBUG ===');
    console.log('Selected class:', selectedClass.classType, selectedClass.classDate);
    console.log('Class category:', classCategory);
    console.log('Is selected class a glazing class?', isGlazingClass);
    console.log('Total classes available:', classes.length);

    // For handbuilding (continuous classes), show any other handbuilding class on a different date
    if (classCategory === 'handbuilding') {
      return classes.filter(c => {
        const isHandbuilding = getClassCategory(c.classType) === 'handbuilding';
        const isDifferentClass = c.id !== selectedClass.id;
        // Use isCompletelyFull (or check against maxCapacity) for makeup bookings
        const hasSpace = !c.isCompletelyFull && c.currentEnrollment < c.maxCapacity;

        // Check if class starts at least 30 minutes from now
        const classDateTime = parseClassDateTime(c.classDate, c.startTime);
        const isAtLeast30MinAway = classDateTime >= thirtyMinutesFromNow;

        return isHandbuilding && isDifferentClass && hasSpace && isAtLeast30MinAway;
      });
    }

    // For glazing classes (Week 6/6), only show other glazing classes
    if (isGlazingClass) {
      return classes.filter(c => {
        const isOtherGlazingClass = c.classType?.includes('Week 6/6') && c.classType?.includes('Glazing');
        const isDifferentClass = c.id !== selectedClass.id;
        const hasSpace = !c.isCompletelyFull && c.currentEnrollment < c.maxCapacity;

        // Check if class starts at least 30 minutes from now
        const classDateTime = parseClassDateTime(c.classDate, c.startTime);
        const isAtLeast30MinAway = classDateTime >= thirtyMinutesFromNow;

        return isOtherGlazingClass && isDifferentClass && hasSpace && isAtLeast30MinAway;
      });
    }

    // For wheelthrowing (week-based courses), show classes from ANY week 1-5 (excluding Week 6/Glazing)
    const currentWeek = getWeekNumberFromClassType(selectedClass.classType);
    console.log('Current week number:', currentWeek);
    if (!currentWeek) return [];

    const filtered = classes.filter(c => {
      // FIRST: Check if this is a Week 6/6 Glazing class - if so, exclude it immediately
      const isWeek6Glazing = c.classType?.includes('Week 6/6') && c.classType?.includes('Glazing');
      if (isWeek6Glazing) {
        console.log(`🚨 EXCLUDED Week 6/6 Glazing class: ${c.classType} on ${c.classDate.split('T')[0]}`);
        return false; // Always exclude Week 6/6 Glazing classes for Week 1-5 students
      }

      const classWeek = getWeekNumberFromClassType(c.classType);
      const sameCategory = getClassCategory(c.classType) === classCategory;
      // Same category, has week number (1-5), different class, and has availability
      const hasSpace = !c.isCompletelyFull && c.currentEnrollment < c.maxCapacity;

      // Check if class starts at least 30 minutes from now
      const classDateTime = parseClassDateTime(c.classDate, c.startTime);
      const isAtLeast30MinAway = classDateTime >= thirtyMinutesFromNow;

      const passes = classWeek !== null &&
             classWeek >= 1 && classWeek <= 5 &&
             sameCategory &&
             c.id !== selectedClass.id &&
             hasSpace &&
             isAtLeast30MinAway;

      if (classWeek !== null && classWeek >= 1 && classWeek <= 5 && sameCategory) {
        console.log(`✅ Week ${classWeek}: ${c.classType} on ${c.classDate.split('T')[0]} at ${c.startTime} - Space: ${c.currentEnrollment}/${c.maxCapacity}, Passes: ${passes}`);
      }

      return passes;
    });

    console.log('Filtered makeup classes:', filtered.length);
    return filtered;
  };

  const handleReschedule = async (newClassId) => {
    try {
      const token = localStorage.getItem('token');

      await axios.post(`${API_URL}/api/classes/reschedule`, {
        oldClassId: selectedClass.id,
        newClassId: newClassId
      }, {
        headers: { Authorization: `Bearer ${token}` }
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
      const token = localStorage.getItem('token');

      const response = await axios.post(`${API_URL}/api/classes/waitlist/join`, {
        classInstanceId: selectedClass.id
      }, {
        headers: { Authorization: `Bearer ${token}` }
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

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentMonth);
  const classesForSelectedDate = getClassesForDate(selectedDate);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  // Helper function to render a calendar month
  const renderCalendarMonth = (monthDate, isFirstMonth) => {
    const { daysInMonth, startingDayOfWeek } = getDaysInMonth(monthDate);

    return (
      <div className="bg-background-alt border border-border p-4">
        <div className="flex items-center justify-between">
          {isFirstMonth ? (
            <button
              className="p-2 hover:bg-background"
              onClick={() => {
                setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
                setHighlightedCourseDates([]);
                setShowCourseMenu(false);
              }}
            >
              <span className="material-symbols-outlined text-text-muted">chevron_left</span>
            </button>
          ) : (
            <div className="w-10" />
          )}
          <p className="text-lg font-bold uppercase">{monthNames[monthDate.getMonth()]} {monthDate.getFullYear()}</p>
          {!isFirstMonth ? (
            <button
              className="p-2 hover:bg-background"
              onClick={() => {
                setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
                setHighlightedCourseDates([]);
                setShowCourseMenu(false);
              }}
            >
              <span className="material-symbols-outlined text-text-muted">chevron_right</span>
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>

        <div className="grid grid-cols-7 gap-1 mt-4">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
            <p key={i} className="text-center text-xs font-bold text-text-muted py-2">{day}</p>
          ))}

          {Array.from({ length: startingDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
            const isSelected = date.toDateString() === selectedDate.toDateString();

            // Get ALL classes for this date (unfiltered) to check for glazing classes
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const dayStr = String(date.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${dayStr}`;
            const allDayClasses = classes.filter(c => c.classDate?.startsWith(dateStr));

            // Get filtered classes for display
            const dayClasses = getClassesForDate(date);
            const hasClasses = dayClasses.length > 0;

            // Check if this date is part of the highlighted course
            const isPartOfHighlightedCourse = highlightedCourseDates.includes(dateStr);

            // Check if this date has multiple course classes with DIFFERENT times
            // Use dayClasses (filtered) instead of allDayClasses so filter works correctly
            const courseClasses = dayClasses.filter(c => getWeekNumberFromClassType(c.classType) !== null);
            // Get unique start times
            const uniqueStartTimes = [...new Set(courseClasses.map(c => c.startTime))];
            const hasMultipleCourses = uniqueStartTimes.length > 1;

            let isEnrolledDay = false;
            let hasGlazingClass = false;
            let bgColorClass = '';

            if (hasClasses) {
              // Check if student is enrolled in any class on this day
              isEnrolledDay = dayClasses.some(c => isEnrolled(c.id));

              // Check if any class is Week 6/6 Glazing (check ALL classes, not just filtered)
              hasGlazingClass = allDayClasses.some(c => c.classType?.includes('Week 6/6') && c.classType?.includes('Glazing'));

              // If "All" is selected and there are multiple class types, show mixed indicator
              if (classTypeFilter === 'all' && dayClasses.length > 0) {
                const classCategories = [...new Set(dayClasses.map(c => getClassCategory(c.classType)))];
                if (classCategories.length > 1) {
                  // Multiple types - show gray background for mixed
                  bgColorClass = 'bg-gray-400/20';
                } else {
                  // Single type - show that type's color
                  const config = classTypeConfig[classCategories[0]];
                  if (config) {
                    bgColorClass = isSelected ? '' : config.bgLight;
                  }
                }
              } else if (classTypeFilter !== 'all') {
                // Filtered view - show filter color
                const config = classTypeConfig[classTypeFilter];
                if (config) {
                  bgColorClass = isSelected ? '' : config.bgLight;
                }
              }

              // Special background for glazing classes (always override)
              if (hasGlazingClass) {
                bgColorClass = isSelected ? '' : 'bg-amber-900/20';
              }

              // Override with blue background for enrolled days
              if (isEnrolledDay) {
                bgColorClass = isSelected ? 'bg-blue-700 text-white' : 'bg-blue-700/20';
              }
            }

            return (
              <button
                key={day}
                onClick={(e) => {
                  setSelectedDate(date);

                  // When clicking a date, check for course classes (use filtered classes)
                  const classesOnDate = dayClasses;
                  if (classesOnDate.length > 0) {
                    // Get all 6-week course classes on this date
                    const courseClassesOnDate = classesOnDate.filter(c => getWeekNumberFromClassType(c.classType) !== null);

                    // Re-check for multiple courses with different times
                    const uniqueTimesOnClick = [...new Set(courseClassesOnDate.map(c => c.startTime))];
                    const hasMultipleCoursesOnClick = uniqueTimesOnClick.length > 1;

                    if (hasMultipleCoursesOnClick) {
                      // Multiple courses - show dropdown menu
                      // Group by start time
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
                      const rect = e.currentTarget.getBoundingClientRect();

                      // Calculate position with better viewport handling
                      let menuX = rect.left;
                      let menuY = rect.bottom;

                      // Ensure menu doesn't go off-screen horizontally
                      const menuWidth = 200; // minWidth from the menu style
                      if (menuX + menuWidth > window.innerWidth) {
                        menuX = window.innerWidth - menuWidth - 10;
                      }

                      setCourseMenuPosition({
                        x: menuX,
                        y: menuY
                      });
                      setShowCourseMenu(true);
                    } else if (courseClassesOnDate.length === 1) {
                      // Only one course class - highlight its dates immediately
                      const courseDates = getCourseDates(courseClassesOnDate[0]);
                      setHighlightedCourseDates(courseDates);
                      setShowCourseMenu(false);

                      // Check if course starts before currently displayed months
                      if (courseDates.length > 0) {
                        const firstCourseDate = new Date(courseDates[0] + 'T12:00:00');
                        const currentMonthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);

                        // If course starts before the current month being displayed, adjust view
                        if (firstCourseDate < currentMonthStart) {
                          setCurrentMonth(new Date(firstCourseDate.getFullYear(), firstCourseDate.getMonth(), 1));
                        }
                      }
                    } else {
                      setHighlightedCourseDates([]);
                      setShowCourseMenu(false);
                    }
                  } else {
                    setHighlightedCourseDates([]);
                    setShowCourseMenu(false);
                  }
                }}
                className={`h-10 w-full text-sm font-medium relative ${
                  isEnrolledDay ? bgColorClass : (isSelected || isPartOfHighlightedCourse ? 'bg-accent text-white' : bgColorClass)
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    );
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

            {/* First Month */}
            {renderCalendarMonth(currentMonth, true)}

            {/* Second Month */}
            <div className="mt-4">
              {renderCalendarMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1), false)}
            </div>
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
                  const isGlazingClass = classItem.classType?.includes('Week 6/6') && classItem.classType?.includes('Glazing');
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
                              setSelectedClass(classItem);
                              // Auto-select 6 weeks for wheelthrowing, null for handbuilding (user must choose)
                              const category = getClassCategory(classItem.classType);
                              setCourseWeeks(category === 'handbuilding' ? null : 6);
                              setShowModal(true);
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
                {/* Calendar Section */}
                <div>
                  <div className="bg-background-alt border border-border p-4">
                    <div className="flex items-center justify-between mb-4">
                      <button
                        className="p-2 hover:bg-background"
                        onClick={() => {
                          setRescheduleCurrentMonth(new Date(rescheduleCurrentMonth.getFullYear(), rescheduleCurrentMonth.getMonth() - 1));
                        }}
                      >
                        <span className="material-symbols-outlined text-text-muted">chevron_left</span>
                      </button>
                      <p className="text-lg font-bold uppercase">{monthNames[rescheduleCurrentMonth.getMonth()]} {rescheduleCurrentMonth.getFullYear()}</p>
                      <button
                        className="p-2 hover:bg-background"
                        onClick={() => {
                          setRescheduleCurrentMonth(new Date(rescheduleCurrentMonth.getFullYear(), rescheduleCurrentMonth.getMonth() + 1));
                        }}
                      >
                        <span className="material-symbols-outlined text-text-muted">chevron_right</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                        <p key={i} className="text-center text-xs font-bold text-text-muted py-2">{day}</p>
                      ))}

                      {Array.from({ length: getDaysInMonth(rescheduleCurrentMonth).startingDayOfWeek }).map((_, i) => (
                        <div key={`empty-${i}`} />
                      ))}

                      {Array.from({ length: getDaysInMonth(rescheduleCurrentMonth).daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const date = new Date(rescheduleCurrentMonth.getFullYear(), rescheduleCurrentMonth.getMonth(), day);
                        const isSelected = date.toDateString() === rescheduleSelectedDate.toDateString();
                        const classesOnDate = getRescheduleClassesForDate(date);
                        const hasClasses = classesOnDate.length > 0;

                        return (
                          <button
                            key={day}
                            onClick={() => setRescheduleSelectedDate(date)}
                            disabled={!hasClasses}
                            className={`h-10 w-full text-sm font-medium ${
                              isSelected
                                ? 'bg-accent text-white'
                                : hasClasses
                                ? 'bg-blue-500/20 hover:bg-blue-500/30'
                                : 'text-text-muted cursor-not-allowed'
                            }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
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

            <div className="p-6 bg-background border-t border-border flex justify-end">
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
