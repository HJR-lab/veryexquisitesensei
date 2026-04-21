import { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api, { classesAPI } from '../utils/api';
import ImpersonationBanner from '../components/ImpersonationBanner';
import { STUDIO_POLICIES } from '../utils/courseDetails';

// ─── Design tokens ────────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

// ─── Date helpers ─────────────────────────────────────────────────────────────
const DAY_LABELS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function fmtKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ─── Small helpers ────────────────────────────────────────────────────────────
function SectionLabel({ children, action, actionLabel, onAction }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED }}>
        {children}
      </span>
      {action && (
        <button
          onClick={onAction}
          style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: TC, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          {actionLabel} →
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ClassScheduleNew() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Instructors see their own calendar at /my-classes, not the student booking page
  if (user?.role === 'instructor') return <Navigate to="/my-classes" replace />;

  // ── API state (preserved from production) ──────────────────────────────────
  const [classes, setClasses] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const myWaitlistEntries = []; // waitlist disabled
  const [studentData, setStudentData] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [hbEnrollment, setHbEnrollment] = useState(null);
  const [bookingNotes, setBookingNotes] = useState('');
  const [courseWeeks, setCourseWeeks] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleSelectedDate, setRescheduleSelectedDate] = useState(new Date());
  const [rescheduleCurrentMonth, setRescheduleCurrentMonth] = useState(new Date());
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseCalculation, setPauseCalculation] = useState(null);

  // ── UI state (new design) ───────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(new Date());
  const stripRef = useRef(null);
  const rescheduleStripRef = useRef(null);
  const [showBookSheet, setShowBookSheet]     = useState(null); // class item to confirm booking
  const [showDetailSheet, setShowDetailSheet] = useState(null); // class item to view details
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [filterType, setFilterType]           = useState('all'); // 'all' | 'wheelthrowing' | 'handbuilding'
  const [filterInstructor, setFilterInstructor] = useState('all');
  // ── Confirmation modal state ────────────────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState(null); // { title, message, onConfirm }
  const [showWaitlistModal, setShowWaitlistModal] = useState(null); // class item for waitlist confirm

  // 60-day strip starting from today (covers ~2 months)
  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);
  const strip = Array.from({ length: 60 }, (_, i) => addDays(TODAY, i));

  // ── Instructor list derived from real data ──────────────────────────────────
  const allInstructors = (() => {
    const set = new Set();
    classes.forEach(course => {
      course.classes?.forEach(cls => {
        if (cls.instructor) set.add(cls.instructor);
      });
    });
    return Array.from(set).sort();
  })();

  // ── Data fetching (preserved from production) ───────────────────────────────
  useEffect(() => {
    fetchClasses();
    fetchMyBookings();
    fetchStudentData();
    fetchDashboardData();
  }, []);

  const fetchStudentData = async () => {
    try {
      const response = await api.get('/students/me');
      setStudentData(response.data.student);
    } catch (error) {
      console.error('Error fetching student data:', error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const response = await api.get('/students/me/dashboard');
      setDashboardData(response.data);
      if (response.data.hbEnrollments && response.data.hbEnrollments.length > 0) {
        setHbEnrollment(response.data.hbEnrollments[0]);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  // When reschedule modal opens, auto-select first available date
  useEffect(() => {
    if (showRescheduleModal && selectedClass) {
      const makeupClasses = getAvailableMakeupClasses();
      if (makeupClasses.length > 0) {
        const uniqueDates = [...new Set(makeupClasses.map(c => c.classDate.split('T')[0]))];
        const sortedDates = uniqueDates.sort();
        const firstDate = new Date(sortedDates[0] + 'T12:00:00');
        setRescheduleSelectedDate(firstDate);
        setRescheduleCurrentMonth(new Date(firstDate.getFullYear(), firstDate.getMonth(), 1));
      }
    }
  }, [showRescheduleModal, selectedClass]);

  const fetchClasses = async () => {
    try {
      // Use public endpoint — works for both admin and students
      const response = await api.get('/classes/available');
      const flatClasses = response.data.classes || [];
      const courseGroups = {};
      flatClasses.forEach(cls => {
        const clsDate = new Date(cls.classDate);
        const dayOfWeek = clsDate.getDay();
        const signature = `${cls.classType}_${cls.startTime}_${cls.instructor}_${dayOfWeek}`;
        if (!courseGroups[signature]) {
          courseGroups[signature] = { classes: [], identifier: `${cls.classType.substring(0,2).toUpperCase()}_${cls.startTime.replace(/[^0-9]/g,'')}` };
        }
        courseGroups[signature].classes.push({
          id: cls.id,
          class_date: cls.classDate,
          class_type: cls.classType,
          class_title: cls.classTitle,
          class_description: cls.classDescription,
          start_time: cls.startTime,
          end_time: cls.endTime,
          instructor: cls.instructor,
          room: cls.room,
          max_capacity: cls.maxCapacity || 10,
          bookingCount: cls.currentEnrollment || 0,
          course_identifier: cls.classType,
        });
      });
      setClasses(Object.values(courseGroups));
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const fetchMyBookings = async () => {
    try {
      const bookingsRes = await api.get('/classes/my-bookings');
      setMyBookings(bookingsRes.data.bookings || []);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    }
  };

  // ── Business logic helpers (preserved from production) ─────────────────────
  const isEnrolled = (classId) =>
    myBookings.some(b => b.class?.id === classId && b.status === 'booked');

  const getClassCategory = (classType) => {
    if (!classType) return 'other';
    const upper = classType.toUpperCase();
    if (upper.startsWith('WT')) return 'wheelthrowing';
    if (upper.startsWith('HB')) return 'handbuilding';
    if (upper.startsWith('KD')) return 'kids';
    const lower = classType.toLowerCase();
    if (lower.includes('wheelthrowing')) return 'wheelthrowing';
    if (lower.includes('handbuilding')) return 'handbuilding';
    if (lower.includes('kids') || lower.includes('children')) return 'kids';
    return 'other';
  };

  const parseClassDateTime = (classDateStr, timeStr) => {
    try {
      const datePart = classDateStr.split('T')[0];
      let hour24, minutes;
      const time24Match = timeStr?.trim().match(/^(\d{1,2}):(\d{2})$/);
      if (time24Match) {
        hour24 = parseInt(time24Match[1]);
        minutes = parseInt(time24Match[2]);
      } else {
        const normalizedTime = (timeStr || '').toUpperCase().trim();
        const match = normalizedTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
        if (!match) throw new Error(`Invalid time format: ${timeStr}`);
        const hours = parseInt(match[1]);
        minutes = parseInt(match[2]);
        const period = match[3];
        hour24 = hours;
        if (period === 'PM' && hours !== 12) hour24 = hours + 12;
        else if (period === 'AM' && hours === 12) hour24 = 0;
      }
      const [year, month, day] = datePart.split('-').map(Number);
      return new Date(year, month - 1, day, hour24, minutes);
    } catch (error) {
      console.error('Error parsing class datetime:', classDateStr, timeStr, error);
      return new Date(NaN);
    }
  };

  const formatDate = (date) =>
    new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);

  // Flatten all class instances for a given date string
  const getClassesForDate = (date) => {
    const dateStr = fmtKey(date);
    const all = [];
    classes.forEach(course => {
      course.classes?.forEach(cls => {
        if (cls.class_date?.startsWith(dateStr)) {
          all.push({
            ...cls,
            id: cls.id,
            classDate: cls.class_date,
            classType: cls.class_type,
            classTitle: cls.class_title,
            classDescription: cls.class_description,
            startTime: cls.start_time,
            endTime: cls.end_time,
            instructor: cls.instructor,
            room: cls.room,
            maxCapacity: cls.max_capacity,
            currentEnrollment: cls.bookingCount,
            isFull: cls.bookingCount >= cls.max_capacity,
            baseCourseIdentifier: course.identifier,
            fullCourseIdentifier: cls.course_identifier,
            courseIdentifier: cls.course_identifier,
          });
        }
      });
    });
    return all;
  };

  // Classes for the selected date, filtered by UI filters
  const classesForSelectedDate = (() => {
    const all = getClassesForDate(selectedDate);
    const now = new Date();
    return all.filter(c => {
      const cat = getClassCategory(c.classType);
      const typeMatch = filterType === 'all' || cat === filterType;
      const instMatch = filterInstructor === 'all' || c.instructor === filterInstructor;
      if (!typeMatch || !instMatch) return false;
      // Hide today's classes that have already ended
      const classDate = new Date(c.classDate);
      classDate.setHours(0, 0, 0, 0);
      const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
      if (classDate.getTime() === todayMid.getTime() && c.endTime) {
        const endDT = parseClassDateTime(c.classDate, c.endTime);
        if (endDT < now) return false;
      }
      return true;
    });
  })();

  const filtersActive = filterType !== 'all' || filterInstructor !== 'all';

  // Check if a given date has any classes / any booked
  const dateHasClasses  = (date) => getClassesForDate(date).length > 0;
  const dateHasBooked   = (date) => getClassesForDate(date).some(c => isEnrolled(c.id));

  // My upcoming bookings (booked status, future) + waitlisted entries
  const now = new Date();
  const bookedUpcoming = myBookings
    .filter(b => b.status === 'booked')
    .filter(b => {
      const classDate = b.class?.classDate || b.classInstance?.classDate || b.class_date;
      const endTime   = b.class?.endTime || b.classInstance?.endTime || b.end_time || '23:59';
      const endDT = parseClassDateTime(classDate, endTime);
      return endDT >= now;
    })
    .map(b => ({ ...b, _isWaitlist: false }));

  const waitlistUpcoming = myWaitlistEntries
    .filter(w => !w.claimed && w.class)
    .filter(w => {
      const d = new Date(w.class.classDate);
      d.setHours(0,0,0,0);
      const today = new Date();
      today.setHours(0,0,0,0);
      return d >= today;
    })
    .map(w => ({
      _isWaitlist: true,
      status: 'waitlisted',
      class: w.class,
    }));

  const myUpcomingBookings = [...bookedUpcoming, ...waitlistUpcoming]
    .sort((a, b) => {
      const da = new Date(a.class?.classDate || a.classInstance?.classDate || a.class_date);
      const db = new Date(b.class?.classDate || b.classInstance?.classDate || b.class_date);
      return da - db;
    });

  const getBookingFields = (booking) => {
    const classDate = booking.class?.classDate || booking.classInstance?.classDate || booking.class_date;
    const date = new Date(classDate + (classDate?.includes('T') ? '' : 'T12:00:00'));
    const classType = booking.class?.classType || booking.classInstance?.classType || booking.class_type;
    const courseIdentifier = booking.courseIdentifier || booking.course_identifier ||
      booking.class?.courseIdentifier || booking.class?.course_identifier ||
      booking.classInstance?.courseIdentifier || booking.classInstance?.course_identifier || classType;
    const startTime = booking.class?.startTime || booking.classInstance?.startTime || booking.start_time || '7:00pm';
    const endTime   = booking.class?.endTime   || booking.classInstance?.endTime   || booking.end_time   || '9:30pm';
    const instructor= booking.class?.instructor|| booking.classInstance?.instructor|| booking.instructor;
    const classTitle = booking.class?.classTitle || booking.classInstance?.classTitle || booking.class_title;
    const classDescription = booking.class?.classDescription || booking.classInstance?.classDescription || booking.class_description;
    const isGlazingClass = classType?.includes('6.6');
    const weekLabel = (() => { const m = classType?.match(/\.(\d+)$/); return m ? `Wk ${m[1]}` : ''; })();
    return { classDate, date, classType, classTitle, classDescription, courseIdentifier, startTime, endTime, instructor, isGlazingClass, weekLabel };
  };

  // Reschedule helpers (preserved from production)
  const getAvailableMakeupClasses = () => {
    if (!selectedClass) return [];
    const classCategory = getClassCategory(selectedClass.classType);
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const allClasses = [];
    classes.forEach(course => {
      (course.classes || []).forEach(cls => {
        allClasses.push({
          ...cls,
          id: cls.id,
          classDate: cls.class_date,
          classType: cls.class_type,
          classTitle: cls.class_title,
          classDescription: cls.class_description,
          startTime: cls.start_time,
          endTime: cls.end_time,
          instructor: cls.instructor,
          maxCapacity: cls.max_capacity,
          currentEnrollment: cls.bookingCount,
          fullCourseIdentifier: cls.course_identifier,
          courseIdentifier: cls.course_identifier,
        });
      });
    });

    // Simple filter: future classes with space, same category (or any for 10-class), not glazing unless glazing
    // Server validates all complex rules on submit
    return allClasses.filter(c => {
      const isDifferentClass = c.id !== selectedClass.id;
      const hasSpace = (c.currentEnrollment || 0) < 10;
      const classDateTime = parseClassDateTime(c.classDate, c.startTime);
      const isAtLeast24HoursAway = classDateTime >= twentyFourHoursFromNow;
      const isValidTime = !isNaN(classDateTime.getTime());
      const sameCategory = getClassCategory(c.classType) === classCategory;
      const categoryOK = is10ClassPackage || sameCategory;
      return isDifferentClass && hasSpace && isAtLeast24HoursAway && isValidTime && categoryOK;
    });
  };

  const getRescheduleClassesForDate = (date) => {
    const makeupClasses = getAvailableMakeupClasses();
    const dateStr = fmtKey(date);
    return makeupClasses.filter(c => c.classDate?.startsWith(dateStr));
  };

  // ── Reusable confirm-before-action helper ─────────────────────────────────
  const confirmAction = (title, message, onConfirm) => {
    setConfirmModal({ title, message, onConfirm });
  };

  const handleReschedule = (newClassId) => {
    confirmAction('Confirm Reschedule', 'Are you sure you want to reschedule? You must reschedule more than 24 hours before class. Missed makeup classes incur a $20 no-show fee. Makeup classes outside your cohort schedule incur a $40 fee (glazing excluded).', async () => {
      try {
        await api.post('/classes/reschedule', { oldClassId: selectedClass.id, newClassId });
        alert('Successfully rescheduled your class!');
        setShowRescheduleModal(false);
        setSelectedClass(null);
        fetchClasses();
        fetchMyBookings();
      } catch (error) {
        console.error('Error rescheduling:', error);
        alert(error.response?.data?.error || 'Failed to reschedule class');
      }
    });
  };

  const handlePauseRequest = async () => {
    try {
      const response = await api.post('/classes/pause/calculate', { classId: selectedClass.id });
      setPauseCalculation(response.data);
      setShowPauseModal(true);
    } catch (error) {
      console.error('Error calculating pause:', error);
      alert(error.response?.data?.error || 'Failed to calculate pause fee. You may have already used your pause for this course.');
    }
  };

  const confirmPause = async () => {
    try {
      const response = await api.post('/classes/pause', { classId: selectedClass.id });
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

  const handleJoinWaitlist = async () => {
    try {
      const response = await api.post('/classes/waitlist/join', { classInstanceId: selectedClass.id });
      alert(response.data.waitlist?.message || 'Successfully joined the waitlist!');
      setSelectedClass(null);
      fetchClasses();
    } catch (error) {
      console.error('Error joining waitlist:', error);
      alert(error.response?.data?.error || 'Failed to join waitlist');
    }
  };

  // ── Booking action for a class card ────────────────────────────────────────
  const handleBookClass = (classItem) => {
    setShowBookSheet(classItem);
  };

  const confirmBook = async () => {
    if (!showBookSheet) return;
    const classItem = showBookSheet;
    setBookingLoading(true);
    try {
      const isHB = getClassCategory(classItem.classType) === 'handbuilding';
      if (isHB && hbEnrollment && hbEnrollment.creditsRemaining > 0) {
        // HB single-class booking — 1 credit per class
        await classesAPI.bookHBSchedule(hbEnrollment.id, classItem.id, 1);
        alert('Handbuilding class booked successfully!');
      } else {
        const cat = getClassCategory(classItem.classType);
        // Cross-type booking restriction (exception: 10-class package)
        const allEnrollments = [
          ...(dashboardData?.enrollments?.active || []),
          ...(dashboardData?.enrollments?.upcoming || []),
          ...(dashboardData?.enrollments?.pending || []),
        ];
        const getCT = (e) => (e.courseType || e.course_type || '').toLowerCase();
        const has10ClassPkg = allEnrollments.some(e => e.number_of_weeks === 10 || getCT(e).includes('10 classes'));
        const hasHBEnrollment = allEnrollments.some(e => getCT(e).includes('handbuilding'));
        const hasWTEnrollment = allEnrollments.some(e => getCT(e).includes('wheelthrowing'));

        if (!has10ClassPkg) {
          if (cat === 'wheelthrowing' && hasHBEnrollment && !hasWTEnrollment) {
            alert('Your enrollment is for Handbuilding classes only. Please book a Handbuilding class.');
            setBookingLoading(false);
            return;
          }
          if (cat === 'handbuilding' && hasWTEnrollment && !hasHBEnrollment) {
            alert('Your enrollment is for Wheelthrowing classes only. Please book a Wheelthrowing class.');
            setBookingLoading(false);
            return;
          }
        }
        // Check if student has credits for a makeup / single class
        const remaining = (studentData?.classes_allocated || 0) -
          (myBookings?.filter(b => b.status === 'booked' || b.status === 'attended').length || 0);
        if (remaining > 0) {
          const response = await classesAPI.bookMakeupClass(classItem.id);
          alert(response.message || 'Class booked successfully!');
        } else {
          // No credits — redirect to purchase
          const url = cat === 'handbuilding'
            ? 'https://ves.sg/products/handbuilding-pottery-course'
            : 'https://ves.sg/products/wheelthrowing-pottery-course';
          window.location.href = url;
          return;
        }
      }
      setShowBookSheet(null);
      setCourseWeeks(null);
      setBookingNotes('');
      await fetchClasses();
      await fetchMyBookings();
      await fetchStudentData();
      await fetchDashboardData();
    } catch (error) {
      console.error('Error booking class:', error);
      alert(error.response?.data?.error || error.message || 'Failed to book class');
    } finally {
      setBookingLoading(false);
    }
  };

  // ── Remaining credits helper ────────────────────────────────────────────────
  const remainingCredits = (studentData?.classes_allocated || 0) -
    (myBookings?.filter(b => b.status === 'booked' || b.status === 'attended').length || 0);

  // ── 10-class package: extra credits beyond the 6 scheduled classes ────────
  const allEnrollments = [...(dashboardData?.enrollments?.active || []), ...(dashboardData?.enrollments?.upcoming || []), ...(dashboardData?.enrollments?.pending || [])];
  const tenClassEnrollment = allEnrollments.find(e => e.number_of_weeks === 10);
  const is10ClassPackage = !!tenClassEnrollment;
  const extraCreditsTotal = is10ClassPackage ? 4 : 0;
  const tenClassBookings = is10ClassPackage ? (tenClassEnrollment.bookings || []).filter(b => b.status === 'booked' || b.status === 'attended').length : 0;
  const extraCreditsUsed = is10ClassPackage ? Math.max(0, tenClassBookings - 6) : 0;

  // Detect last HB booking as glazing (when all credits are booked)
  const hbLastBookingId = (() => {
    if (!hbEnrollment || hbEnrollment.creditsRemaining > 0) return null;
    const hbUpcoming = myUpcomingBookings
      .filter(b => {
        const ct = b.class?.classType || b.classInstance?.classType || b.class_type || '';
        return ct.startsWith('HB');
      })
      .sort((a, b) => {
        const da = new Date(a.class?.classDate || a.classInstance?.classDate || a.class_date);
        const db = new Date(b.class?.classDate || b.classInstance?.classDate || b.class_date);
        return da - db;
      });
    return hbUpcoming.length > 0 ? (hbUpcoming[hbUpcoming.length - 1].id || hbUpcoming[hbUpcoming.length - 1].bookingId) : null;
  })();

  // ── Helper: display label for class type ───────────────────────────────────
  const displayClassType = (classType, classTitle, bookingId) => {
    if (bookingId && bookingId === hbLastBookingId) return 'Glazing';
    if (classTitle) return classTitle;
    if (!classType) return 'Class';
    if (classType.includes('6.6') || classType.includes('7.7')) return 'Glazing';
    const cat = getClassCategory(classType);
    if (cat === 'wheelthrowing') {
      // 7-week courses (e.g. WT1104AM_DL7.1) are intermediate
      const match = classType.match(/_\w+(\d)\./);
      if (match && match[1] === '7') return 'Wheelthrowing Intermediate 7 Weeks';
      return 'Wheelthrowing Beginners/Ext 6 Weeks';
    }
    if (cat === 'handbuilding')  return 'Handbuilding';
    if (cat === 'kids')          return 'Kids';
    return classType;
  };

  // ── Helper: display level from classType ───────────────────────────────────
  const displayLevel = (classType) => {
    if (!classType) return '';
    const lower = classType.toLowerCase();
    if (lower.includes('beginner'))     return 'Beginners';
    if (lower.includes('intermediate')) return 'Intermediate';
    if (lower.includes('advanced'))     return 'Advanced';
    return 'All Levels';
  };

  // ── Glazing date: find the student's glazing class date ─────────────────────
  const glazingDate = (() => {
    if (is10ClassPackage) return null; // 10-class students can book after glazing
    const glazingBooking = myBookings.find(b => {
      if (b.status !== 'booked' && b.status !== 'attended') return false;
      const ct = b.class?.classType || b.classInstance?.classType || b.class_type || '';
      const weekMatch = ct.match(/\.(\d+)$/);
      return weekMatch && (weekMatch[1] === '6' || weekMatch[1] === '7');
    });
    if (!glazingBooking) return null;
    const d = new Date(glazingBooking.class?.classDate || glazingBooking.classInstance?.classDate || glazingBooking.class_date);
    d.setHours(0, 0, 0, 0);
    return d;
  })();

  // Check if a class date is blocked by glazing rules
  const isBlockedByGlazing = (classDate) => {
    if (!glazingDate) return false;
    const d = new Date(classDate);
    d.setHours(0, 0, 0, 0);
    if (d > glazingDate) return true; // after glazing
    const daysBefore = (glazingDate - d) / (1000 * 60 * 60 * 24);
    if (daysBefore > 0 && daysBefore < 5) return true; // within 5 days before glazing
    return false;
  };

  // ── Determine action for a card ────────────────────────────────────────────
  // Returns 'booked' | 'full' | 'book' | 'purchase' | 'blocked'
  const getCardAction = (classItem) => {
    if (isEnrolled(classItem.id)) return 'booked';
    if (classItem.isFull)         return 'full';
    if (isBlockedByGlazing(classItem.classDate)) return 'blocked';
    if (remainingCredits > 0)     return 'book';
    return 'purchase';
  };

  // ── Spots left label ───────────────────────────────────────────────────────
  const spotsLeft = (classItem) => {
    const total = classItem.maxCapacity || 10;
    const used  = classItem.currentEnrollment || 0;
    return Math.max(0, total - used);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#FFFFFF', minHeight: '100vh' }}>

      <ImpersonationBanner />

      {/* ── TOP BAR ─────────────────────────────────────────────────────────── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: '#FFFFFF', borderBottom: `1px solid ${RULE}` }}>
        <div style={{ maxWidth: '520px', margin: '0 auto', padding: '0 20px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
            alt="VES"
            style={{ height: '26px', width: 'auto' }}
          />
        </div>
      </header>

      <main style={{ maxWidth: '520px', margin: '0 auto', padding: '0 0 88px' }}>

        {/* ── PAGE TITLE + FILTER BUTTON ────────────────────────────────────── */}
        <div style={{ padding: '28px 20px 10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>Classes</h1>
            <div style={{ fontSize: '13px', color: MUTED, marginTop: '4px' }}>Manage your classes here</div>
          </div>
          <button
            onClick={() => setShowFilterSheet(true)}
            style={{ display: 'flex', alignItems: 'center', padding: '7px', marginTop: '4px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', position: 'relative' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '22px', color: filtersActive ? TC : MUTED }}>tune</span>
            {filtersActive && (
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: TC, position: 'absolute', top: '-3px', right: '-3px' }} />
            )}
          </button>
        </div>

        {/* ── PACKAGE PROGRESS ──────────────────────────────────────────── */}
        {/* ── 10 CLASS PACKAGE CARD ─────────────────────────────────────── */}
        {is10ClassPackage && (() => {
          const booked = tenClassBookings;
          const total = 10;
          const creditsRemaining = tenClassEnrollment?.class_credits_remaining || (extraCreditsTotal - extraCreditsUsed);
          return (
            <div style={{ padding: '6px 20px 8px' }}>
              <div style={{ padding: '14px', backgroundColor: '#FFF8F0', border: `1px solid ${RULE}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: TC_DARK, letterSpacing: '0.03em' }}>
                    10 Class Package · Booked {booked} of {total}
                  </span>
                </div>
                <div style={{ height: '4px', backgroundColor: RULE, borderRadius: '2px', position: 'relative', marginBottom: '6px' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '4px', borderRadius: '2px', width: `${Math.round((booked / total) * 100)}%`, backgroundColor: TC }} />
                </div>
                <div style={{ fontSize: '11px', color: MUTED }}>
                  {creditsRemaining} Class Credit{creditsRemaining !== 1 ? 's' : ''} remaining
                </div>
              </div>
            </div>
          );
        })()}

        {dashboardData?.packageInfo?.totalCourses > 1 && (() => {
          const pkg = dashboardData.packageInfo;
          const currentCourse = pkg.currentCourse || (pkg.totalCourses - (pkg.coursesRemaining || 0));
          return (
            <div style={{ padding: '6px 20px 8px' }}>
              <div style={{ padding: '14px', backgroundColor: '#FFF8F0', border: `1px solid ${RULE}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: TC_DARK, letterSpacing: '0.03em' }}>
                    {pkg.totalCourses}-Course Package · Course {currentCourse} of {pkg.totalCourses}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                  {Array.from({ length: pkg.totalCourses }).map((_, i) => (
                    <div key={i} style={{
                      flex: 1, height: '4px', borderRadius: '2px',
                      backgroundColor: i < currentCourse - 1 ? TC
                        : i < currentCourse ? TC_DARK
                        : RULE,
                    }} />
                  ))}
                </div>
                {pkg.coursesRemaining > 0 && (
                  <div style={{ fontSize: '11px', color: MUTED }}>
                    {pkg.coursesRemaining} more course{pkg.coursesRemaining > 1 ? 's' : ''} remaining ({pkg.coursesRemaining * 6} classes)
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── HB CREDITS CARD ───────────────────────────────────────────── */}
        {hbEnrollment && hbEnrollment.creditsRemaining > 0 && (
          <div style={{ padding: '6px 20px 8px' }}>
            <div style={{ padding: '14px', backgroundColor: '#FFF8F0', border: `1px solid ${RULE}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: TC_DARK, letterSpacing: '0.03em' }}>
                  Handbuilding · {hbEnrollment.creditsUsed} of {hbEnrollment.creditsAllocated} used
                </span>
              </div>
              <div style={{ height: '4px', backgroundColor: RULE, borderRadius: '2px', position: 'relative', marginBottom: '6px' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, height: '4px', borderRadius: '2px', width: `${Math.round((hbEnrollment.creditsUsed / hbEnrollment.creditsAllocated) * 100)}%`, backgroundColor: TC }} />
              </div>
              <div style={{ fontSize: '11px', color: MUTED }}>
                {hbEnrollment.creditsRemaining} Class Credit{hbEnrollment.creditsRemaining !== 1 ? 's' : ''} remaining
              </div>
            </div>
          </div>
        )}

        {/* ── DATE STRIP ────────────────────────────────────────────────────── */}
        <div>
          {/* Month label + nav arrows */}
          <div style={{ padding: '8px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>
              {MONTH_LABELS[selectedDate.getMonth()]} {selectedDate.getFullYear()}
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => { if (stripRef.current) stripRef.current.scrollBy({ left: -200, behavior: 'smooth' }); }}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: MUTED }}>chevron_left</span>
              </button>
              <button
                onClick={() => { if (stripRef.current) stripRef.current.scrollBy({ left: 200, behavior: 'smooth' }); }}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: MUTED }}>chevron_right</span>
              </button>
            </div>
          </div>
          {/* Scrollable strip */}
          <div ref={stripRef} style={{ display: 'flex', overflowX: 'auto', padding: '0 20px 8px', gap: '6px', scrollbarWidth: 'none' }}>
            {strip.map((d, i) => {
              const isSelected = fmtKey(d) === fmtKey(selectedDate);
              const hasClasses = dateHasClasses(d);
              const hasBooked  = dateHasBooked(d);
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(d)}
                  style={{
                    flexShrink: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: '3px', padding: '8px 6px',
                    minWidth: '40px',
                    border: isSelected ? `1px solid ${TC}` : '1px solid transparent',
                    backgroundColor: isSelected ? TC_LIGHT : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: isSelected ? TC_DARK : MUTED }}>
                    {DAY_LABELS[d.getDay()]}
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: isSelected ? TC : INK }}>
                    {d.getDate()}
                  </span>
                  <span style={{
                    width:  hasBooked ? '6px' : '4px',
                    height: hasBooked ? '6px' : '4px',
                    borderRadius: '50%',
                    backgroundColor: hasBooked
                      ? TC
                      : hasClasses
                        ? 'rgba(40,40,40,0.18)'
                        : 'transparent',
                    boxShadow: hasBooked && !isSelected ? `0 0 0 2px ${TC_LIGHT}` : 'none',
                  }} />
                </button>
              );
            })}
          </div>
        </div>

        {/* ── CLASS LIST FOR SELECTED DATE ──────────────────────────────────── */}
        <div style={{ padding: '12px 20px 8px' }}>
          {classesForSelectedDate.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: MUTED }}>No classes on this day.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '28px' }}>
              {(() => {
                // Determine cross-type restriction
                const enrollList = [...(dashboardData?.enrollments?.active || []), ...(dashboardData?.enrollments?.upcoming || []), ...(dashboardData?.enrollments?.pending || [])];
                const getCourseType = (e) => (e.courseType || e.course_type || '').toLowerCase();
                const has10ClassPkg = enrollList.some(e => e.number_of_weeks === 10 || getCourseType(e).includes('10 classes'));
                const hasHBEnroll = enrollList.some(e => getCourseType(e).includes('handbuilding'));
                const hasWTEnroll = enrollList.some(e => getCourseType(e).includes('wheelthrowing'));
                const hasEnrollments = enrollList.length > 0;

                return [...classesForSelectedDate].sort((a, b) => {
                  const aWT = getClassCategory(a.classType) === 'wheelthrowing';
                  const bWT = getClassCategory(b.classType) === 'wheelthrowing';
                  return aWT === bWT ? 0 : aWT ? -1 : 1;
                }).map(cls => {
                  const enrolled = isEnrolled(cls.id);
                  const isFull   = !enrolled && cls.isFull;
                  const action   = getCardAction(cls);
                  const typeLabel  = displayClassType(cls.classType, cls.classTitle);
                  const levelLabel = displayLevel(cls.classType);
                  const cat = getClassCategory(cls.classType);

                  // Grey out classes the student can't book due to enrollment type mismatch
                  const crossTypeBlocked = hasEnrollments && !has10ClassPkg && (
                    (cat === 'wheelthrowing' && hasHBEnroll && !hasWTEnroll) ||
                    (cat === 'handbuilding' && hasWTEnroll && !hasHBEnroll)
                  );

                  // Grey out intermediate WT classes for students with < 3 course purchases
                  const weekMatch = cls.classType?.match(/_\w+(\d)\.\d+$/);
                  const isIntermediate = cat === 'wheelthrowing' && weekMatch && parseInt(weekMatch[1]) === 7;
                  const intermediateBlocked = isIntermediate && (studentData?.course_purchase_count || 0) < 3;

                  // Grey out classes after glazing or within 5 days of glazing
                  const glazingBlocked = !enrolled && isBlockedByGlazing(cls.classDate);

                  const blocked = crossTypeBlocked || intermediateBlocked || glazingBlocked;

                  return (
                    <div
                      key={cls.id}
                      onClick={() => !blocked && setShowDetailSheet(cls)}
                      style={{
                        padding: '12px',
                        border: `1px solid ${enrolled ? TC : RULE}`,
                        backgroundColor: blocked ? '#F5F5F5' : enrolled ? TC_LIGHT : ALT,
                        opacity: blocked ? 0.5 : 1,
                        display: 'flex', alignItems: 'center', gap: '14px',
                        cursor: blocked ? 'default' : 'pointer',
                      }}
                    >
                      {/* Date mini-cal */}
                      <div style={{ width: '36px', flexShrink: 0, textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: enrolled ? TC_DARK : MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>
                          {DAY_LABELS[selectedDate.getDay()]}
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.1 }}>{selectedDate.getDate()}</div>
                        <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>
                          {MONTH_LABELS[selectedDate.getMonth()]}
                        </div>
                      </div>

                      {/* Divider */}
                      <div style={{ width: '1px', height: '42px', backgroundColor: enrolled ? 'rgba(196,98,45,0.2)' : RULE, flexShrink: 0 }} />

                      {/* Detail */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700 }}>{typeLabel}</div>
                        <div style={{ fontSize: '11px', color: MUTED }}>{cls.startTime} – {cls.endTime} · {cls.instructor}</div>
                      </div>

                      {/* Action */}
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        {blocked ? (
                          <div style={{ fontSize: '10px', color: MUTED }}>{spotsLeft(cls)} left</div>
                        ) : enrolled ? (
                          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 10px', backgroundColor: TC, color: '#FFF' }}>
                            Booked
                          </span>
                        ) : isFull ? (
                          <span
                            style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 10px', backgroundColor: '#EBEBEB', color: MUTED }}
                          >
                            Full
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={e => { e.stopPropagation(); handleBookClass(cls); }}
                              style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 12px', border: `1px solid ${TC}`, backgroundColor: 'transparent', color: TC, cursor: 'pointer', display: 'block', marginBottom: '3px' }}
                            >
                              {action === 'purchase' ? 'Purchase' : 'Book'}
                            </button>
                            {action !== 'purchase' && (
                              <div style={{ fontSize: '10px', color: MUTED }}>{spotsLeft(cls)} left</div>
                            )}
                          </>
                        )}
                      </div>

                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'rgba(40,40,40,0.2)', flexShrink: 0 }}>chevron_right</span>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* ── UNBOOKED WARNING ─────────────────────────────────────────── */}
          {(() => {
            const activeEnrollments = [...(dashboardData?.enrollments?.active || []), ...(dashboardData?.enrollments?.upcoming || [])];
            const regularCourse = activeEnrollments.find(e => e.number_of_weeks && e.number_of_weeks !== 10);
            if (!regularCourse) return null;
            const totalClasses = regularCourse.number_of_weeks || 6;
            const activeBookings = (regularCourse.bookings || []).filter(b => b.status === 'booked' || b.status === 'attended' || b.status === 'completed' || b.status === 'rescheduled' || b.status === 'absent' || b.status === 'forfeited').length;
            const waitlisted = myWaitlistEntries.filter(w => !w.claimed && w.class).length;
            const unbooked = totalClasses - activeBookings - waitlisted;
            if (unbooked <= 0) return null;
            return (
              <div style={{ backgroundColor: '#FFF0F0', border: '1px solid #F0C0C0', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#C03030', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  You have {unbooked} class{unbooked !== 1 ? 'es' : ''} unbooked
                </span>
                <a href="/classes" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '6px 14px', backgroundColor: '#C03030', color: '#FFF', textDecoration: 'none' }}>
                  Book Now
                </a>
              </div>
            );
          })()}

          {/* ── MY UPCOMING ────────────────────────────────────────────────── */}
          <div style={{ borderTop: `1px solid ${RULE}`, paddingTop: '24px' }}>
            <SectionLabel>My Upcoming</SectionLabel>
            {myUpcomingBookings.length === 0 ? (
              <div style={{ fontSize: '13px', color: MUTED, padding: '16px 0' }}>No upcoming bookings.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {myUpcomingBookings.map((booking, i) => {
                  const f = getBookingFields(booking);
                  const classItem = {
                    id: booking.class?.id || booking.classInstance?.id || booking.class_id,
                    classDate: f.classDate,
                    classType: f.classType,
                    startTime: f.startTime,
                    endTime: f.endTime,
                    instructor: f.instructor,
                    fullCourseIdentifier: f.courseIdentifier,
                    courseIdentifier: f.courseIdentifier,
                  };
                  const startDT  = parseClassDateTime(f.classDate, f.startTime);
                  const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                  const isWithin24Hours = startDT < twentyFourHoursFromNow && startDT > now;

                  return (
                    <div
                      key={`upcoming-${i}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '14px',
                        padding: '12px',
                        borderBottom: i < myUpcomingBookings.length - 1 ? `1px solid ${RULE}` : 'none',
                        borderLeft: `3px solid ${booking._isWaitlist ? '#D4A017' : TC}`,
                        backgroundColor: booking._isWaitlist ? '#FFF7E6' : TC_LIGHT,
                        marginLeft: '-1px',
                      }}
                    >
                      {/* Date mini-cal */}
                      <div style={{ width: '36px', flexShrink: 0, textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: TC_DARK, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>
                          {DAY_LABELS[f.date.getDay()]}
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.1 }}>{f.date.getDate()}</div>
                        <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>
                          {MONTH_LABELS[f.date.getMonth()]}
                        </div>
                      </div>

                      <div style={{ width: '1px', height: '42px', backgroundColor: 'rgba(196,98,45,0.2)', flexShrink: 0 }} />

                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700 }}>{displayClassType(f.classType, f.classTitle, booking.id || booking.bookingId)}</div>
                        <div style={{ fontSize: '11px', color: MUTED }}>{f.startTime} – {f.endTime} · {f.instructor}</div>
                      </div>

                      {/* Reschedule / Waitlisted button */}
                      {booking._isWaitlist ? (
                        <span
                          style={{
                            fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                            padding: '4px 8px',
                            backgroundColor: '#FFF7E6',
                            color: '#9E6200',
                            border: 'none', flexShrink: 0,
                          }}
                        >
                          Waitlisted
                        </span>
                      ) : (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                          <button
                            onClick={() => {
                              if (booking.status !== 'booked') {
                                alert(`Cannot reschedule: This class booking is ${booking.status}. Please refresh the page.`);
                                fetchMyBookings();
                                return;
                              }
                              if (isWithin24Hours) {
                                alert('Cannot reschedule classes within 24 hours of start time.');
                                return;
                              }
                              setSelectedClass(classItem);
                              setShowRescheduleModal(true);
                              setRescheduleSelectedDate(new Date());
                              setRescheduleCurrentMonth(new Date());
                            }}
                            style={{
                              fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                              padding: '4px 8px',
                              backgroundColor: isWithin24Hours ? MUTED : '#EBEBEB',
                              color: isWithin24Hours ? '#FFF' : INK,
                              border: 'none', cursor: 'pointer',
                            }}
                          >
                            {isWithin24Hours ? 'Within 24h' : 'Reschedule'}
                          </button>
                          {is10ClassPackage && !isWithin24Hours && (
                            <button
                              onClick={async () => {
                                if (booking.status !== 'booked') {
                                  alert(`Cannot cancel: This class booking is ${booking.status}. Please refresh the page.`);
                                  fetchMyBookings();
                                  return;
                                }
                                if (!confirm('Cancel this booking? The class credit will be returned to your account.\n\nNote: Cancellations must be made at least 24 hours before class.')) return;
                                try {
                                  await api.post('/classes/cancel', { bookingId: booking.id || booking.bookingId });
                                  fetchMyBookings();
                                  fetchDashboardData();
                                } catch (err) {
                                  alert(err.response?.data?.error || 'Failed to cancel');
                                }
                              }}
                              style={{
                                fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                                padding: '4px 8px',
                                backgroundColor: 'transparent', color: '#C62828',
                                border: '1px solid #C62828', cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── STUDIO POLICY ─────────────────────────────────────────────────── */}
          <div style={{ marginTop: '32px' }}>
            <SectionLabel>Studio Policy</SectionLabel>
          </div>
          <div
            onClick={() => setShowPolicyModal(true)}
            style={{
              padding: '14px 16px',
              backgroundColor: TC_LIGHT,
              border: `1px solid ${TC}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px', color: TC_DARK }}>gavel</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: TC_DARK, letterSpacing: '0.04em' }}>Studio Policy</div>
              <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>MUST READ: All studio rules and regulations apply</div>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: '16px', color: TC }}>chevron_right</span>
          </div>

        </div>
      </main>

      {/* ── STUDIO POLICY MODAL ──────────────────────────────────────────────── */}
      {showPolicyModal && (
        <>
          <div onClick={() => setShowPolicyModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 70 }} />
          <div style={{
            position: 'fixed', inset: '5vh 0', zIndex: 71,
            maxWidth: '520px', margin: '0 auto', backgroundColor: '#fff',
            borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${RULE}`, flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: INK }}>Rules and Regulations</h2>
              <button onClick={() => setShowPolicyModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: MUTED }}>close</span>
              </button>
            </div>
            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', fontSize: '13px', lineHeight: '1.7', color: INK }}>
              {Object.values(STUDIO_POLICIES).map((section, i) => (
                <div key={i} style={{ marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 6px', color: INK }}>{section.title}</h3>
                  {section.content && <p style={{ margin: 0, color: '#555' }}>{section.content}</p>}
                  {section.items && (
                    <ul style={{ margin: '4px 0 0', paddingLeft: '16px', listStyleType: 'disc' }}>
                      {section.items.map((item, j) => <li key={j} style={{ marginBottom: '1px', color: '#555' }}>{item}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── CLASS DETAIL SHEET ───────────────────────────────────────────────── */}
      {showDetailSheet && (
        <>
          <div onClick={() => setShowDetailSheet(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 60 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 61, backgroundColor: '#FFFFFF', borderTop: `2px solid ${INK}`, maxWidth: '520px', margin: '0 auto', padding: '24px 20px 48px' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '6px' }}>Class Details</div>
                <div style={{ fontSize: '22px', fontWeight: 700 }}>{displayClassType(showDetailSheet.classType, showDetailSheet.classTitle)}</div>
                {showDetailSheet.classDescription && (
                  <div style={{ fontSize: '13px', color: MUTED, marginTop: '4px' }}>{showDetailSheet.classDescription}</div>
                )}
              </div>
              <button onClick={() => setShowDetailSheet(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: MUTED }}>close</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0', border: `1px solid ${RULE}`, marginBottom: '20px' }}>
              {[
                { label: 'Date',       value: `${DAY_LABELS[selectedDate.getDay()]}, ${selectedDate.getDate()} ${MONTH_LABELS[selectedDate.getMonth()]}` },
                { label: 'Time',       value: `${showDetailSheet.startTime} – ${showDetailSheet.endTime}` },
                { label: 'Level',      value: displayLevel(showDetailSheet.classType) },
                { label: 'Instructor', value: showDetailSheet.instructor },
                { label: 'Spots left', value: showDetailSheet.isFull ? 'Full' : `${spotsLeft(showDetailSheet)}` },
              ].map((row, i, arr) => (
                <div
                  key={i}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 14px', borderBottom: i < arr.length - 1 ? `1px solid ${RULE}` : 'none', backgroundColor: i % 2 === 0 ? '#FFF' : ALT }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED }}>{row.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: INK }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Book CTA from detail sheet */}
            {!isEnrolled(showDetailSheet.id) && !showDetailSheet.isFull && (() => {
              const detailWeekMatch = showDetailSheet.classType?.match(/_\w+(\d)\.\d+$/);
              const detailIsInter = getClassCategory(showDetailSheet.classType) === 'wheelthrowing' && detailWeekMatch && parseInt(detailWeekMatch[1]) === 7;
              return !(detailIsInter && (studentData?.course_purchase_count || 0) < 3);
            })() && (
              showDetailSheet.isFull ? (
                <button
                  onClick={() => { setShowDetailSheet(null); setShowWaitlistModal(showDetailSheet); }}
                  style={{ width: '100%', padding: '13px', border: 'none', backgroundColor: '#9E6200', color: '#FFF', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  Join Waitlist
                </button>
              ) : (
                <button
                  onClick={() => { setShowDetailSheet(null); handleBookClass(showDetailSheet); }}
                  style={{ width: '100%', padding: '13px', border: 'none', backgroundColor: TC, color: '#FFF', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  {remainingCredits > 0 ? 'Book This Class' : 'Purchase to Book'}
                </button>
              )
            )}
          </div>
        </>
      )}

      {/* ── FILTER SHEET ─────────────────────────────────────────────────────── */}
      {showFilterSheet && (
        <>
          <div onClick={() => setShowFilterSheet(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 60 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 61, backgroundColor: '#FFFFFF', borderTop: `2px solid ${INK}`, maxWidth: '520px', margin: '0 auto', padding: '24px 20px 48px' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>Filter &amp; Sort</span>
              {filtersActive && (
                <button
                  onClick={() => { setFilterType('all'); setFilterInstructor('all'); }}
                  style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: TC, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Class Type */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '10px' }}>Class Type</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { val: 'all',          label: 'All' },
                  { val: 'wheelthrowing', label: 'Wheel' },
                  { val: 'handbuilding', label: 'Handbuild' },
                  { val: 'kids',         label: 'Kids' },
                ].map(opt => (
                  <button
                    key={opt.val}
                    onClick={() => setFilterType(opt.val)}
                    style={{
                      padding: '8px 14px', cursor: 'pointer',
                      border: `1px solid ${filterType === opt.val ? TC : RULE}`,
                      backgroundColor: filterType === opt.val ? TC_LIGHT : 'transparent',
                      fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
                      color: filterType === opt.val ? TC_DARK : MUTED,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Instructor */}
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '10px' }}>Instructor</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['all', ...allInstructors].map(opt => (
                  <button
                    key={opt}
                    onClick={() => setFilterInstructor(opt)}
                    style={{
                      padding: '8px 14px', cursor: 'pointer',
                      border: `1px solid ${filterInstructor === opt ? TC : RULE}`,
                      backgroundColor: filterInstructor === opt ? TC_LIGHT : 'transparent',
                      fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
                      color: filterInstructor === opt ? TC_DARK : MUTED,
                    }}
                  >
                    {opt === 'all' ? 'All' : opt}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShowFilterSheet(false)}
              style={{ width: '100%', padding: '13px', border: 'none', backgroundColor: INK, color: '#FFF', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              Show Results
            </button>
          </div>
        </>
      )}

      {/* ── BOOKING CONFIRMATION SHEET ────────────────────────────────────────── */}
      {showBookSheet && (
        <>
          <div onClick={() => { setShowBookSheet(null); setCourseWeeks(null); }} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 60 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 61, backgroundColor: '#FFFFFF', borderTop: `2px solid ${TC}`, maxWidth: '520px', margin: '0 auto', padding: '24px 20px 40px' }}>

            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>
              Confirm Booking
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>{displayClassType(showBookSheet.classType, showBookSheet.classTitle)}</div>
            <div style={{ fontSize: '14px', color: MUTED, marginBottom: '20px' }}>
              {DAY_LABELS[selectedDate.getDay()]}, {selectedDate.getDate()} {MONTH_LABELS[selectedDate.getMonth()]} · {showBookSheet.startTime} – {showBookSheet.endTime}
            </div>

            {/* Credit info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', backgroundColor: ALT, marginBottom: '20px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: MUTED }}>info</span>
              <span style={{ fontSize: '12px', color: MUTED }}>
                {getClassCategory(showBookSheet.classType) === 'handbuilding' && hbEnrollment && hbEnrollment.creditsRemaining > 0
                  ? `This will use 1 credit. You have ${hbEnrollment.creditsRemaining} remaining.`
                  : remainingCredits > 0
                    ? `This will use 1 class credit. You currently have ${remainingCredits} remaining.`
                    : `You have no credits. You will need to purchase a class.`}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setShowBookSheet(null); setCourseWeeks(null); }}
                style={{ flex: 1, padding: '13px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', color: MUTED }}
              >
                Cancel
              </button>
              <button
                onClick={confirmBook}
                disabled={bookingLoading}
                style={{
                  flex: 2, padding: '13px', border: 'none',
                  backgroundColor: bookingLoading ? MUTED : TC,
                  color: '#FFF', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: bookingLoading ? 'wait' : 'pointer',
                  opacity: bookingLoading ? 0.5 : 1,
                }}
              >
                {bookingLoading ? 'Booking…' : remainingCredits > 0 || (hbEnrollment && hbEnrollment.creditsRemaining > 0) ? 'Confirm Booking' : 'Go to Purchase'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── RESCHEDULE SHEET ─────────────────────────────────────────────────── */}
      {showRescheduleModal && selectedClass && (
        <>
          <div onClick={() => { setShowRescheduleModal(false); setSelectedClass(null); }} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 60 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 61, backgroundColor: '#FFFFFF', borderTop: `2px solid ${INK}`, maxWidth: '520px', margin: '0 auto', padding: '24px 20px 40px', maxHeight: '80vh', overflowY: 'auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '6px' }}>Reschedule</div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>{displayClassType(selectedClass.classType, selectedClass.classTitle)}</div>
                <div style={{ fontSize: '12px', color: MUTED, marginTop: '2px' }}>{formatDate(new Date(selectedClass.classDate))} · {selectedClass.startTime}</div>
              </div>
              <button onClick={() => { setShowRescheduleModal(false); setSelectedClass(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: MUTED }}>close</span>
              </button>
            </div>

            <div style={{ padding: '10px 12px', backgroundColor: TC_LIGHT, marginBottom: '16px', fontSize: '12px', color: TC_DARK }}>
              Select an available date below. Classes must start at least 24 hours from now.
            </div>

            {/* Date strip for reschedule */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px', marginBottom: '6px' }}>
              <button
                onClick={() => { if (rescheduleStripRef.current) rescheduleStripRef.current.scrollBy({ left: -200, behavior: 'smooth' }); }}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: MUTED }}>chevron_left</span>
              </button>
              <button
                onClick={() => { if (rescheduleStripRef.current) rescheduleStripRef.current.scrollBy({ left: 200, behavior: 'smooth' }); }}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: MUTED }}>chevron_right</span>
              </button>
            </div>
            <div ref={rescheduleStripRef} style={{ display: 'flex', overflowX: 'auto', gap: '6px', paddingBottom: '8px', scrollbarWidth: 'none', marginBottom: '16px' }}>
              {Array.from({ length: 60 }, (_, i) => addDays(new Date(), i)).map((d, i) => {
                const rescheduleClasses = getRescheduleClassesForDate(d);
                const hasClasses = rescheduleClasses.length > 0;
                const isSelected = fmtKey(d) === fmtKey(rescheduleSelectedDate);
                return (
                  <button
                    key={i}
                    onClick={() => setRescheduleSelectedDate(d)}
                    style={{
                      flexShrink: 0,
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      gap: '3px', padding: '8px 6px', minWidth: '40px',
                      border: isSelected ? `1px solid ${TC}` : '1px solid transparent',
                      backgroundColor: isSelected ? TC_LIGHT : hasClasses ? '#F5F3F0' : 'transparent',
                      cursor: 'pointer', opacity: hasClasses ? 1 : 0.4,
                    }}
                  >
                    <span style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', color: isSelected ? TC_DARK : MUTED }}>{DAY_LABELS[d.getDay()]}</span>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: isSelected ? TC : INK }}>{d.getDate()}</span>
                    <span style={{
                      width: '4px', height: '4px', borderRadius: '50%',
                      backgroundColor: hasClasses ? (isSelected ? TC : 'rgba(40,40,40,0.18)') : 'transparent',
                    }} />
                  </button>
                );
              })}
            </div>

            {/* Available classes for reschedule date */}
            {(() => {
              const cls = getRescheduleClassesForDate(rescheduleSelectedDate);
              if (cls.length === 0) {
                return <div style={{ fontSize: '13px', color: MUTED, textAlign: 'center', padding: '16px 0' }}>No available classes on this date.</div>;
              }
              // Check if student is rescheduling their glazing class
              const isReschedulingGlazing = selectedClass && (selectedClass.classType || '').match(/\.(6|7)$/);
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {cls.map(classItem => {
                    // Block reschedule targets after glazing or within 5 days (unless rescheduling glazing itself)
                    const reschBlocked = !isReschedulingGlazing && isBlockedByGlazing(classItem.classDate);
                    return (
                    <div
                      key={classItem.id}
                      style={{ padding: '12px', border: `1px solid ${RULE}`, backgroundColor: reschBlocked ? '#F5F5F5' : ALT, opacity: reschBlocked ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '14px' }}
                    >
                      {/* Date mini-cal */}
                      <div style={{ width: '36px', flexShrink: 0, textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>
                          {DAY_LABELS[rescheduleSelectedDate.getDay()]}
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.1 }}>{rescheduleSelectedDate.getDate()}</div>
                        <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>
                          {MONTH_LABELS[rescheduleSelectedDate.getMonth()]}
                        </div>
                      </div>
                      <div style={{ width: '1px', height: '42px', backgroundColor: RULE, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700 }}>{displayClassType(classItem.classType, classItem.classTitle)}</div>
                        <div style={{ fontSize: '11px', color: MUTED }}>{classItem.startTime} – {classItem.endTime} · {classItem.instructor}</div>
                      </div>
                      {reschBlocked ? (
                        <span style={{ fontSize: '10px', color: MUTED, flexShrink: 0 }}>Unavailable</span>
                      ) : (
                      <button
                        onClick={() => handleReschedule(classItem.id)}
                        style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '6px 14px', border: 'none', backgroundColor: TC, color: '#FFF', cursor: 'pointer', flexShrink: 0 }}
                      >
                        Select
                      </button>
                      )}
                    </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Pause course button */}
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${RULE}` }}>
              <button
                onClick={handlePauseRequest}
                style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, background: 'none', border: `1px solid ${RULE}`, padding: '8px 14px', cursor: 'pointer' }}
              >
                Pause Course
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── PAUSE MODAL ───────────────────────────────────────────────────────── */}
      {showPauseModal && pauseCalculation && (
        <>
          <div onClick={() => { setShowPauseModal(false); setPauseCalculation(null); }} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 70 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 71, backgroundColor: '#FFFFFF', borderTop: `2px solid ${INK}`, maxWidth: '520px', margin: '0 auto', padding: '24px 20px 48px' }}>

            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>Pause Course</div>
            <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>Confirm Pause</div>

            <div style={{ padding: '12px', backgroundColor: '#FFF8E1', border: `1px solid #F59E0B`, marginBottom: '16px', fontSize: '12px', color: '#92400E' }}>
              <div style={{ fontWeight: 700, marginBottom: '6px' }}>Important</div>
              <ul style={{ margin: 0, paddingLeft: '16px', lineHeight: 1.8 }}>
                <li>You can only pause once per course</li>
                <li>Pause is valid for 30 days maximum</li>
                <li>You can resume in the next available {pauseCalculation.courseType} course</li>
              </ul>
            </div>

            <div style={{ border: `1px solid ${RULE}`, marginBottom: '20px' }}>
              {[
                { label: 'Remaining Classes', value: pauseCalculation.remainingClasses },
                { label: 'Fee per Class',     value: '$40.00' },
                { label: 'Total Pause Fee',   value: `$${pauseCalculation.totalFee?.toFixed(2)}` },
              ].map((row, i, arr) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 14px', borderBottom: i < arr.length - 1 ? `1px solid ${RULE}` : 'none', backgroundColor: i % 2 === 0 ? '#FFF' : ALT }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{row.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: INK }}>{row.value}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setShowPauseModal(false); setPauseCalculation(null); }}
                style={{ flex: 1, padding: '13px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', color: MUTED }}
              >
                Cancel
              </button>
              <button
                onClick={confirmPause}
                style={{ flex: 2, padding: '13px', border: 'none', backgroundColor: '#F59E0B', color: '#FFF', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                Confirm Pause
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── CONFIRM MODAL ──────────────────────────────────────────────────────── */}
      {/* ── WAITLIST CONFIRMATION MODAL (disabled — waitlist feature off) ──── */}
      {false && showWaitlistModal && (
        <>
          <div onClick={() => setShowWaitlistModal(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 80 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 81, backgroundColor: '#FFFFFF', padding: '28px 24px', maxWidth: '380px', width: '90%' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9E6200', marginBottom: '12px' }}>Join Waitlist</div>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>{displayClassType(showWaitlistModal.classType, showWaitlistModal.classTitle)}</div>
            <div style={{ fontSize: '12px', color: MUTED, marginBottom: '16px' }}>
              {(() => { const d = new Date(showWaitlistModal.classDate); return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); })()}
              {' · '}{showWaitlistModal.startTime} – {showWaitlistModal.endTime}
            </div>
            <div style={{ backgroundColor: '#FFF7E6', padding: '14px', marginBottom: '20px', fontSize: '12px', lineHeight: 1.6, color: '#5A3D00' }}>
              <p style={{ margin: '0 0 8px', fontWeight: 700 }}>How the waitlist works:</p>
              <p style={{ margin: '0 0 4px' }}>1. You'll be added to the waitlist for this class.</p>
              <p style={{ margin: '0 0 4px' }}>2. If a spot opens up, you'll be automatically booked in.</p>
              <p style={{ margin: 0 }}>3. A confirmation email will be sent to you once confirmed.</p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowWaitlistModal(null)}
                style={{ flex: 1, padding: '10px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', border: `1px solid ${RULE}`, backgroundColor: 'transparent', color: MUTED, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await api.post('/classes/waitlist/join', { classInstanceId: showWaitlistModal.id });
                    setShowWaitlistModal(null);
                    fetchMyBookings();
                    alert('You have been added to the waitlist! We will notify you if a spot opens up.');
                  } catch (error) {
                    alert(error.response?.data?.error || 'Failed to join waitlist');
                  }
                }}
                style={{ flex: 1, padding: '10px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', border: 'none', backgroundColor: '#9E6200', color: '#FFF', cursor: 'pointer' }}
              >
                Join Waitlist
              </button>
            </div>
          </div>
        </>
      )}

      {confirmModal && (
        <>
          <div onClick={() => setConfirmModal(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 80 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 81, backgroundColor: '#FFFFFF', padding: '28px 24px', maxWidth: '340px', width: '90%', textAlign: 'center' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>{confirmModal.title}</div>
            <div style={{ fontSize: '13px', color: MUTED, marginBottom: '24px' }}>{confirmModal.message}</div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setConfirmModal(null)}
                style={{ flex: 1, padding: '10px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', border: `1px solid ${RULE}`, backgroundColor: 'transparent', color: MUTED, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmModal(null); confirmModal.onConfirm(); }}
                style={{ flex: 1, padding: '10px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', border: 'none', backgroundColor: TC, color: '#FFF', cursor: 'pointer' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
