import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import ClassCalendarGrid from '../components/ClassCalendarGrid';
import ClassDayDetail from '../components/ClassDayDetail';
import { AddSingleClassModal, CreateCourseModal, EditClassModal, RescheduleModal, AddStudentModal } from '../components/ClassModals';

// ─── Design tokens ────────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

// ─── Mobile breakpoint hook ───────────────────────────────────────────────────
function useIsMobile(bp = 768) {
  const [m, setM] = useState(typeof window !== 'undefined' ? window.innerWidth < bp : false);
  useEffect(() => {
    const h = () => setM(window.innerWidth < bp);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [bp]);
  return m;
}

// ─── Calendar helpers ─────────────────────────────────────────────────────────
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function fmtDateShort(d) {
  return `${DN[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()]}`;
}
function buildCalendar(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const pad = (firstDay.getDay() + 6) % 7; // Mon=0
  const days = Array(pad).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Generate calendar months dynamically based on today
function getCalMonths() {
  const today = new Date();
  const months = [];
  for (let i = -1; i <= 3; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    months.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      label: `${MN[d.getMonth()]} ${d.getFullYear()}`,
    });
  }
  return months;
}

// Assign a stable color to a course identifier
const COURSE_COLORS = [TC, TC_DARK, '#3A4A5C', '#9E6200', '#1E6B1E', '#5A2D82', '#1A5276'];
function courseColor(identifier, idx) {
  return COURSE_COLORS[idx % COURSE_COLORS.length];
}

// Label helpers
function shortName(name, max = 10) {
  if (!name || name.length <= max) return name || '';
  const parts = name.trim().split(' ');
  if (parts.length < 2) return name;
  return parts[0] + ' ' + parts.slice(1).map(p => p[0] + '.').join(' ');
}

// ─── Input label style ─────────────────────────────────────────────────────────
const labelSt = { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' };
const inputSt = { width: '100%', padding: '9px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' };
const selectSt = { ...inputSt };

// ─── Main component ───────────────────────────────────────────────────────────
export default function AdminClasses() {
  const navigate = useNavigate();
  useAuth();
  const isMobile = useIsMobile();

  // ── API / data state ────────────────────────────────────────────────────────
  const [courses, setCourses]           = useState([]);
  const [loading, setLoading]           = useState(false);
  const [summaryStats, setSummaryStats] = useState(null);
  const [classMembers, setClassMembers] = useState({});
  const [absentMembers, setAbsentMembers] = useState({});
  const [loadingMembers, setLoadingMembers] = useState({});

  // ── UI state ────────────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate]     = useState(null);
  const [expandedCourse, setExpandedCourse] = useState(null); // course identifier (WT pipeline cards)
  const [expandedHBCard, setExpandedHBCard] = useState(null); // HB course identifier
  const [selectedStudents, setSelectedStudents] = useState(new Set()); // studentIds selected for move
  const [moveTarget, setMoveTarget] = useState(''); // target course identifier
  const [calPage, setCalPage]               = useState(1);    // 0-based index into CAL_MONTHS

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [classTypeFilter, setClassTypeFilter] = useState('all');
  const [cohortFilter, setCohortFilter]       = useState('all');

  // ── Reschedule modal ─────────────────────────────────────────────────────────
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [reschedulingBooking, setReschedulingBooking] = useState(null);
  const [rescheduleData, setRescheduleData] = useState({ newClassInstanceId: null, reason: '', isGlazing: false });
  const [availableClasses, setAvailableClasses] = useState([]);
  const [rescheduling, setRescheduling]       = useState(false);

  // ── Add student modal ────────────────────────────────────────────────────────
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [addingToClassId, setAddingToClassId]         = useState(null);
  const [studentSearchQuery, setStudentSearchQuery]   = useState('');
  const [allStudents, setAllStudents]                 = useState([]);
  const [loadingStudents, setLoadingStudents]         = useState(false);
  const [addingStudent, setAddingStudent]             = useState(false);

  // ── Edit class modal ─────────────────────────────────────────────────────────
  const [showEditClassModal, setShowEditClassModal] = useState(false);
  const [editingClass, setEditingClass]             = useState(null);
  const [editClassData, setEditClassData] = useState({ classDate: '', startTime: '', endTime: '', instructor: '', maxCapacity: 12, classTitle: '', classDescription: '' });
  const [updatingClass, setUpdatingClass] = useState(false);

  // ── Postpone course modal ────────────────────────────────────────────────────
  const [showPostponeModal, setShowPostponeModal] = useState(false);
  const [postponeCourse, setPostponeCourse] = useState(null); // { id, classes }
  const [postponeFromClassId, setPostponeFromClassId] = useState('');
  const [postponeWeeks, setPostponeWeeks] = useState(1);
  const [postponing, setPostponing] = useState(false);

  // ── Create course modal ───────────────────────────────────────────────────────
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);
  const [creatingClass, setCreatingClass] = useState(false);
  const [createClassData, setCreateClassData] = useState({
    startTimeHour: '', startTimeMinute: '', startTimePeriod: 'AM',
    endTimeHour: '', endTimeMinute: '', endTimePeriod: 'PM',
    classType: '', instructor: '', room: '',
    teachingCapacity: 10, makeUpCapacity: 2, glazingCapacity: 14,
    numberOfClasses: 1, classDates: [''],
  });

  // ── Add single class modal (test page design) ─────────────────────────────────
  const [showAddSingleClass, setShowAddSingleClass] = useState(false);


  // ── Cal months ───────────────────────────────────────────────────────────────
  const CAL_MONTHS = getCalMonths();

  // ── Load on mount ────────────────────────────────────────────────────────────
  useEffect(() => {
    // Phase 1: instant summary
    api.get('/admin/classes/summary').then(({ data }) => {
      setSummaryStats(data);
    }).catch(() => {});
    // Phase 2: full data
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/classes');
      const allCourses = data.courses || [];
      setCourses(allCourses);

      // Auto-load members for HB classes so counts are accurate
      allCourses.forEach(c => {
        if (c.classes?.length > 0 && (c.classes[0]?.class_type || '').toUpperCase().startsWith('HB')) {
          c.classes.forEach(cls => {
            api.get(`/admin/classes/${cls.id}/members`).then(({ data: mData }) => {
              setClassMembers(prev => ({ ...prev, [cls.id]: mData.members || [] }));
            }).catch(() => {});
          });
        }
      });
    } catch (error) {
      console.error('Failed to load courses:', error);
    } finally {
      setLoading(false);
    }
  };

  // ── Helper: format date string ────────────────────────────────────────────────
  const formatDate = (dateString) => new Date(dateString).toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });

  // ── Cohort = start month of the course (YYYY-MM of first class) ───────────────
  const getCourseStartMonth = (course) => {
    if (!course.classes || course.classes.length === 0) return null;
    const firstDate = course.classes.map(c => c.class_date).sort()[0];
    if (!firstDate) return null;
    return firstDate.split('T')[0].substring(0, 7); // 'YYYY-MM'
  };

  // Derive cohort options: group courses whose start dates are within 21 days of each other
  const cohortOptions = (() => {
    // Collect unique start dates per course
    const startDates = courses
      .map(c => getCourseStartMonth(c) ? { month: getCourseStartMonth(c), date: new Date(c.classes.map(cl => cl.class_date).sort()[0]) } : null)
      .filter(Boolean);
    if (!startDates.length) return [];

    // Sort by date and group: new cohort when gap > 21 days
    const sorted = startDates.sort((a, b) => a.date - b.date);
    const groups = [];
    sorted.forEach(({ month, date }) => {
      const prev = groups[groups.length - 1];
      if (prev && (date - prev.lastDate) / 86400000 <= 21) {
        if (!prev.months.includes(month)) prev.months.push(month);
        prev.lastDate = date > prev.lastDate ? date : prev.lastDate;
      } else {
        groups.push({ months: [month], lastDate: date });
      }
    });

    const fmt = m => { const [y, mo] = m.split('-'); return new Date(Number(y), Number(mo) - 1).toLocaleDateString('en-GB', { month: 'short' }); };
    return groups.map((g, i) => {
      const uniqueMonths = [...new Set(g.months)].sort();
      const year = uniqueMonths[0].split('-')[0];
      const range = uniqueMonths.length === 1
        ? `${fmt(uniqueMonths[0])} ${year}`
        : `${fmt(uniqueMonths[0])}–${fmt(uniqueMonths[uniqueMonths.length - 1])} ${year}`;
      return { value: uniqueMonths.join(','), label: range };
    });
  })();

  // ── Class category ────────────────────────────────────────────────────────────
  const getClassCategory = (classType) => {
    if (!classType) return 'other';
    const upper = classType.toUpperCase();
    if (upper.startsWith('WT')) return 'wheelthrowing-beginner';
    if (upper.startsWith('HB')) return 'handbuilding';
    if (upper.startsWith('KD')) return 'kids';
    const lower = classType.toLowerCase();
    if (lower.includes('wheelthrowing') && lower.includes('beginner'))     return 'wheelthrowing-beginner';
    if (lower.includes('wheelthrowing') && lower.includes('intermediate')) return 'wheelthrowing-intermediate';
    if (lower.includes('handbuilding')) return 'handbuilding';
    if (lower.includes('kids') || lower.includes('children')) return 'kids';
    return 'other';
  };

  // ── Default display title (matches student-facing logic) ───────────────────────
  const getDefaultClassTitle = (classType) => {
    if (!classType) return 'Class';
    if (classType.includes('6.6') || classType.includes('7.7')) return 'Glazing';
    const cat = getClassCategory(classType);
    if (cat === 'wheelthrowing-beginner') {
      const match = classType.match(/_\w+(\d)\./);
      if (match && match[1] === '7') return 'Wheelthrowing Intermediate 7 Weeks';
      return 'Wheelthrowing Beginners/Ext 6 Weeks';
    }
    if (cat === 'handbuilding') return 'Handbuilding';
    if (cat === 'kids') return 'Kids';
    return classType;
  };

  // ── Week number from class type ────────────────────────────────────────────────
  const getWeekNumberFromClassType = (classType) => {
    const match = classType?.match(/Week (\d)/);
    return match ? parseInt(match[1]) : null;
  };

  // ── Dates for a course (for calendar highlighting) ────────────────────────────
  const getCourseDates = (clickedClass) => {
    if (!clickedClass || !clickedClass.baseCourseIdentifier) return [];
    const matchingCourse = courses.find(c => c.identifier === clickedClass.baseCourseIdentifier);
    if (!matchingCourse) return [];
    const dates = matchingCourse.classes.map(cls => cls.class_date.split('T')[0]);
    return [...new Set(dates)];
  };

  // ── Classes for a given Date object ──────────────────────────────────────────
  const getClassesForDate = (date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const all = [];
    courses.forEach(course => {
      course.classes?.forEach(cls => {
        if (cls.class_date?.startsWith(dateStr)) {
          all.push({
            ...cls,
            baseCourseIdentifier: course.identifier,
            fullCourseIdentifier: cls.courseIdentifier,
          });
        }
      });
    });
    return all.filter(c => {
      if (classTypeFilter !== 'all' && getClassCategory(c.class_type) !== classTypeFilter) return false;
      if (cohortFilter !== 'all') {
        const parentCourse = courses.find(co => co.classes?.some(cl => cl.id === c.id));
        if (parentCourse && !cohortFilter.split(',').includes(getCourseStartMonth(parentCourse))) return false;
      }
      return true;
    });
  };

  // ── Derive WT courses (for pipeline cards) ────────────────────────────────────
  const getWTCourses = () => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const wtCourses = courses.filter(c => {
      if (!c.classes || c.classes.length === 0) return false;
      if (getClassCategory(c.classes[0]?.class_type) === 'handbuilding') return false;
      if (cohortFilter !== 'all' && !cohortFilter.split(',').includes(getCourseStartMonth(c))) return false;
      // Hide courses where ALL classes are in the past (fully completed)
      const hasFutureClass = c.classes.some(cls => new Date(cls.class_date) >= today);
      if (!hasFutureClass) return false;
      return true;
    });

    if (classTypeFilter !== 'all' && classTypeFilter !== 'wheelthrowing-beginner' && classTypeFilter !== 'wheelthrowing-intermediate') {
      return [];
    }

    return wtCourses.map((course, idx) => {
      const sampleClass = course.classes?.[0];
      const maxCap = sampleClass?.max_capacity || 10;
      const allDates = course.classes?.map(cls => cls.class_date).sort() || [];
      const today = new Date();
      today.setHours(0,0,0,0);
      const futureClasses = course.classes?.filter(cls => new Date(cls.class_date) >= today) || [];
      const completedClasses = course.classes?.filter(cls => new Date(cls.class_date) < today).length || 0;
      const currentWeek = completedClasses;
      const nextClassDate = futureClasses.length > 0 ? new Date(futureClasses[0].class_date) : null;
      const color = courseColor(course.identifier, idx);
      return {
        id: course.identifier,
        identifier: course.identifier,
        type: 'WT',
        instructor: sampleClass?.instructor || '',
        dayName: sampleClass ? DN[new Date(sampleClass.class_date).getDay()] : '',
        timeLabel: sampleClass?.start_time || '',
        weeks: course.classes?.length || 0,
        capacity: maxCap,
        enrolled: course.totalEnrollment || 0,
        minPax: 4,
        status: 'confirmed',
        color,
        currentWeek,
        nextClassDate,
        course, // raw API course
        classes: course.classes || [],
        allDates,
      };
    });
  };

  // ── Derive HB courses ──────────────────────────────────────────────────────────
  const getHBCourses = () => {
    const hbCourses = courses.filter(c => {
      if (!c.classes || c.classes.length === 0) return false;
      if (getClassCategory(c.classes[0]?.class_type) !== 'handbuilding') return false;
      // HB is ongoing drop-in — always show regardless of cohort filter
      return true;
    });

    if (classTypeFilter !== 'all' && classTypeFilter !== 'handbuilding') return [];

    return hbCourses.map((course, idx) => {
      const sampleClass = course.classes?.[0];
      const maxCap = sampleClass?.max_capacity || 10;
      const enrolled = course.totalEnrollment || 0;
      const dayOfWeek = sampleClass ? new Date(sampleClass.class_date).getDay() : 0;
      return {
        id: course.identifier,
        identifier: course.identifier,
        dayOfWeek,
        dayName: sampleClass ? DN[new Date(sampleClass.class_date).getDay()] : '',
        timeLabel: sampleClass?.start_time || '',
        shortLabel: course.identifier?.slice(0, 6) || course.identifier,
        capacity: maxCap,
        enrolled,
        instructor: sampleClass?.instructor || '',
        course,
        classes: course.classes || [],
      };
    });
  };

  // ── Events for a calendar day ──────────────────────────────────────────────────
  const getEventsForDay = (date, wtCourses) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const evs = [];

    // WT courses: check if any class in the course falls on this date
    wtCourses.forEach((c, idx) => {
      c.classes.forEach((cls, clsIdx) => {
        if (cls.class_date?.startsWith(dateStr)) {
          evs.push({ kind: 'WT', course: c, courseIdx: idx, cls, weekNum: clsIdx + 1, cancelled: cls.status === 'cancelled' || cls.instructorUnavailable });
        }
      });
    });

    // HB courses: check if any class in the course falls on this date
    getHBCourses().forEach(hb => {
      hb.classes.forEach(cls => {
        if (cls.class_date?.startsWith(dateStr)) {
          evs.push({ kind: 'HB', hb, cancelled: cls.status === 'cancelled' || cls.instructorUnavailable });
        }
      });
    });

    return evs;
  };

  // ── Load class members (fetch only, no expansion toggle) ─────────────────────
  const loadClassMembers = async (classInstance) => {
    if (classMembers[classInstance.id]) return;
    try {
      setLoadingMembers(prev => ({ ...prev, [classInstance.id]: true }));
      const { data } = await api.get(`/admin/classes/${classInstance.id}/members`);
      setClassMembers(prev => ({ ...prev, [classInstance.id]: data.members || [] }));
      setAbsentMembers(prev => ({ ...prev, [classInstance.id]: data.absentMembers || [] }));
    } catch (error) {
      console.error('Failed to load class members:', error);
    } finally {
      setLoadingMembers(prev => ({ ...prev, [classInstance.id]: false }));
    }
  };

  // ── Toggle class member load (used by day-detail panel) ───────────────────────
  const toggleClassMembers = async (classInstance) => {
    if (expandedCourse === classInstance.id) {
      setExpandedCourse(null);
      return;
    }
    setExpandedCourse(classInstance.id);
    await loadClassMembers(classInstance);
  };

  // ── Load available classes for reschedule ──────────────────────────────────────
  const loadAvailableClassesForReschedule = async (currentClass, studentId) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let studentBookingClassIds = [];
    try {
      const { data } = await api.get(`/admin/students/${studentId}/bookings`);
      studentBookingClassIds = data.bookings.map(b => b.class_instance_id);
    } catch (error) {
      console.error('Failed to load student bookings:', error);
    }
    const available = [];
    courses.forEach(course => {
      course.classes?.forEach(cls => {
        const clsDate = new Date(cls.class_date);
        clsDate.setHours(0, 0, 0, 0);
        if (clsDate >= today && cls.bookingCount < cls.max_capacity && cls.id !== currentClass.id && !studentBookingClassIds.includes(cls.id)) {
          available.push({ ...cls, baseCourseIdentifier: course.identifier, fullCourseIdentifier: cls.courseIdentifier });
        }
      });
    });
    available.sort((a, b) => new Date(a.class_date) - new Date(b.class_date));
    setAvailableClasses(available);
  };

  // ── Reschedule handler ────────────────────────────────────────────────────────
  const handleReschedule = async () => {
    if (!rescheduleData.newClassInstanceId) { alert('Please select a new class'); return; }
    if (!confirm(`Reschedule ${reschedulingBooking.studentName} to the selected class?`)) return;
    try {
      setRescheduling(true);
      const selectedClass = availableClasses.find(cls => cls.id === rescheduleData.newClassInstanceId);
      const cohortStart = '2026-01-17', cohortEnd = '2026-03-03';
      const origDate = reschedulingBooking.classInstance.class_date.split('T')[0];
      const newDate  = selectedClass.class_date.split('T')[0];
      const isSame   = origDate >= cohortStart && origDate <= cohortEnd && newDate >= cohortStart && newDate <= cohortEnd;
      const fee = rescheduleData.isGlazing || isSame ? 0 : 40;
      await api.post(`/admin/bookings/${reschedulingBooking.bookingId}/reschedule`, {
        newClassInstanceId: rescheduleData.newClassInstanceId,
        rescheduleReason: rescheduleData.reason,
        fee, isGlazingReschedule: rescheduleData.isGlazing, isAdminReschedule: true,
      });
      await loadCourses();
      setClassMembers(prev => { const u = { ...prev }; delete u[reschedulingBooking.classInstance.id]; delete u[rescheduleData.newClassInstanceId]; return u; });
      alert(`Successfully rescheduled! ${fee > 0 ? `Fee: $${fee}` : 'No fee applied'}`);
      setShowRescheduleModal(false);
      setReschedulingBooking(null);
      setRescheduleData({ newClassInstanceId: null, reason: '', isGlazing: false });
    } catch (error) {
      console.error('Failed to reschedule:', error);
      alert('Failed to reschedule booking. Please try again.');
    } finally {
      setRescheduling(false);
    }
  };

  // ── Load students for add-student modal ────────────────────────────────────────
  const loadStudents = async () => {
    try {
      setLoadingStudents(true);
      const { data } = await api.get('/admin/customers');
      setAllStudents(data.customers || []);
    } catch (error) {
      console.error('Failed to load students:', error);
      alert('Failed to load students');
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleOpenAddStudentModal = (classId) => {
    setAddingToClassId(classId);
    setStudentSearchQuery('');
    setShowAddStudentModal(true);
    if (allStudents.length === 0) loadStudents();
  };

  const handleAddStudent = async (studentId) => {
    if (!confirm('Add this student to the class?')) return;
    try {
      setAddingStudent(true);
      await api.post(`/admin/classes/${addingToClassId}/add-student`, { studentId });
      const classId = addingToClassId;
      if (expandedCourse === classId) {
        try {
          setLoadingMembers(prev => ({ ...prev, [classId]: true }));
          const { data } = await api.get(`/admin/classes/${classId}/members`);
          setClassMembers(prev => ({ ...prev, [classId]: data.members || [] }));
          setAbsentMembers(prev => ({ ...prev, [classId]: data.absentMembers || [] }));
        } catch (e) { console.error('Failed to reload members:', e); }
        finally { setLoadingMembers(prev => ({ ...prev, [classId]: false })); }
      }
      await loadCourses();
      if (expandedCourse !== classId) {
        setClassMembers(prev => { const u = { ...prev }; delete u[classId]; return u; });
      }
      alert('Student added successfully!');
      setShowAddStudentModal(false);
      setAddingToClassId(null);
      setStudentSearchQuery('');
    } catch (error) {
      console.error('Failed to add student:', error);
      alert(error.response?.data?.error || 'Failed to add student. Please try again.');
    } finally {
      setAddingStudent(false);
    }
  };

  const handleRemoveStudent = async (bookingId, classId, studentName) => {
    if (!confirm(`Remove ${studentName} from this class?`)) return;
    try {
      await api.delete(`/admin/bookings/${bookingId}`);
      await new Promise(r => setTimeout(r, 100));
      setClassMembers(prev => { const u = { ...prev }; delete u[classId]; return u; });
      setAbsentMembers(prev => { const u = { ...prev }; delete u[classId]; return u; });
      if (expandedCourse === classId) {
        try {
          setLoadingMembers(prev => ({ ...prev, [classId]: true }));
          const { data } = await api.get(`/admin/classes/${classId}/members?t=${Date.now()}`);
          setClassMembers(prev => ({ ...prev, [classId]: data.members || [] }));
          setAbsentMembers(prev => ({ ...prev, [classId]: data.absentMembers || [] }));
        } catch (e) { console.error('Failed to reload members:', e); }
        finally { setLoadingMembers(prev => ({ ...prev, [classId]: false })); }
      }
      await loadCourses();
      alert('Student removed successfully!');
    } catch (error) {
      console.error('Failed to remove student:', error);
      alert(error.response?.data?.error || 'Failed to remove student. Please try again.');
    }
  };

  const getFilteredStudents = () => {
    if (!studentSearchQuery.trim()) return allStudents;
    const q = studentSearchQuery.toLowerCase();
    return allStudents.filter(s => {
      const name  = `${s.firstName} ${s.lastName}`.toLowerCase();
      const email = s.email.toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  };

  // ── Edit class handlers ────────────────────────────────────────────────────────
  const handleOpenEditClassModal = (classInstance) => {
    setEditingClass(classInstance);
    setEditClassData({
      classDate: classInstance.class_date.split('T')[0],
      startTime: classInstance.start_time,
      endTime: classInstance.end_time,
      instructor: classInstance.instructor,
      maxCapacity: classInstance.max_capacity || 12,
      classTitle: classInstance.class_title || getDefaultClassTitle(classInstance.class_type),
      classDescription: classInstance.class_description || '',
    });
    setShowEditClassModal(true);
  };

  const handleUpdateClass = async () => {
    if (!editClassData.classDate || !editClassData.startTime || !editClassData.endTime || !editClassData.instructor) {
      alert('Please fill in all fields'); return;
    }
    if (!confirm('Update this class? Note: The class identifier will NOT be updated to match the new date/time.')) return;
    try {
      setUpdatingClass(true);
      await api.patch(`/admin/classes/${editingClass.id}`, {
        classDate: editClassData.classDate,
        startTime: editClassData.startTime,
        endTime: editClassData.endTime,
        instructor: editClassData.instructor,
        maxCapacity: editClassData.maxCapacity,
        classTitle: editClassData.classTitle,
        classDescription: editClassData.classDescription,
      });
      await loadCourses();
      alert('Class updated successfully!');
      setShowEditClassModal(false);
      setEditingClass(null);
      setEditClassData({ classDate: '', startTime: '', endTime: '', instructor: '', maxCapacity: 12, classTitle: '', classDescription: '' });
    } catch (error) {
      console.error('Failed to update class:', error);
      alert(error.response?.data?.error || 'Failed to update class. Please try again.');
    } finally {
      setUpdatingClass(false);
    }
  };

  const handleOpenPostponeModal = (classInstance) => {
    // Find the parent course from courses list
    const baseId = classInstance.baseCourseIdentifier || (() => {
      const ct = classInstance.class_type || classInstance.fullCourseIdentifier || '';
      const dot = ct.lastIndexOf('.');
      return dot > 0 ? ct.substring(0, dot) : ct;
    })();
    const course = courses.find(c => c.identifier === baseId);
    if (!course) { alert('Course not found'); return; }
    setPostponeCourse({ id: baseId, classes: course.classes });
    setPostponeFromClassId(String(classInstance.id));
    setPostponeWeeks(1);
    setShowPostponeModal(true);
  };

  const handlePostponeCourse = async () => {
    if (!postponeFromClassId) { alert('Select which class to postpone from'); return; }
    const fromClass = postponeCourse.classes.find(c => c.id === parseInt(postponeFromClassId));
    const affectedCount = postponeCourse.classes.filter(c => new Date(c.class_date) >= new Date(fromClass.class_date)).length;
    if (!confirm(`Postpone ${affectedCount} class${affectedCount > 1 ? 'es' : ''} by ${postponeWeeks} week${postponeWeeks > 1 ? 's' : ''}? All classes from ${new Date(fromClass.class_date).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })} onwards will shift forward.`)) return;
    try {
      setPostponing(true);
      await api.post(`/admin/courses/${encodeURIComponent(postponeCourse.id)}/postpone`, {
        fromClassId: parseInt(postponeFromClassId),
        weeks: postponeWeeks,
      });
      await loadCourses();
      alert('Course postponed successfully!');
      setShowPostponeModal(false);
      setPostponeCourse(null);
      setPostponeFromClassId('');
      setPostponeWeeks(1);
    } catch (error) {
      console.error('Failed to postpone course:', error);
      alert(error.response?.data?.error || 'Failed to postpone course.');
    } finally {
      setPostponing(false);
    }
  };

  // ── Create course handlers ────────────────────────────────────────────────────
  const handleNumberOfClassesChange = (newNumber) => {
    const num = Math.max(1, Math.min(12, parseInt(newNumber) || 1));
    const newDates = Array(num).fill('').map((_, idx) => createClassData.classDates[idx] || '');
    setCreateClassData({ ...createClassData, numberOfClasses: num, classDates: newDates });
  };

  const handleClassDateChange = (index, date) => {
    const newDates = [...createClassData.classDates];
    newDates[index] = date;
    setCreateClassData({ ...createClassData, classDates: newDates });
  };

  const formatTimeForAPI = (hour, minute, period) => {
    if (!hour || !minute || !period) return '';
    return `${hour}:${minute}${period.toLowerCase()}`;
  };

  const handleCreateClass = async () => {
    if (!createClassData.startTimeHour || !createClassData.startTimeMinute ||
        !createClassData.endTimeHour || !createClassData.endTimeMinute ||
        !createClassData.classType || !createClassData.instructor || !createClassData.room) {
      alert('Please fill in all required fields'); return;
    }
    if (createClassData.classDates.some(d => !d)) {
      alert('Please select dates for all classes'); return;
    }
    if (!confirm(`Create new course with ${createClassData.numberOfClasses} class${createClassData.numberOfClasses > 1 ? 'es' : ''}?`)) return;
    try {
      setCreatingClass(true);
      const startTime = formatTimeForAPI(createClassData.startTimeHour, createClassData.startTimeMinute, createClassData.startTimePeriod);
      const endTime   = formatTimeForAPI(createClassData.endTimeHour, createClassData.endTimeMinute, createClassData.endTimePeriod);
      await api.post('/admin/classes', { ...createClassData, startTime, endTime });
      await loadCourses();
      alert(`Course "${createClassData.classType}" created successfully!`);
      setShowCreateClassModal(false);
      setCreateClassData({
        startTimeHour: '', startTimeMinute: '', startTimePeriod: 'AM',
        endTimeHour: '', endTimeMinute: '', endTimePeriod: 'PM',
        classType: '', instructor: '', room: '',
        teachingCapacity: 10, makeUpCapacity: 2, glazingCapacity: 14,
        numberOfClasses: 1, classDates: [''],
      });
    } catch (error) {
      console.error('Failed to create classes:', error);
      alert(error.response?.data?.error || 'Failed to create classes. Please try again.');
    } finally {
      setCreatingClass(false);
    }
  };

  const handleDeleteClass = async (classId, classType) => {
    if (!confirm(`Delete this class (${classType})? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/classes/${classId}`);
      await loadCourses();
    } catch (error) {
      console.error('Failed to delete class:', error);
      alert(error.response?.data?.error || 'Failed to delete class. Please try again.');
    }
  };

  const handleMoveSelectedStudents = async (fromCourseId) => {
    if (!moveTarget || selectedStudents.size === 0) return;
    const names = allMembersForExpanded.filter(s => selectedStudents.has(s.studentId)).map(s => shortName(s.name));
    if (!confirm(`Move ${names.join(', ')} from ${fromCourseId} to ${moveTarget}?`)) return;
    try {
      for (const studentId of selectedStudents) {
        await api.post('/admin/course-emails/move-student', {
          studentId, fromCourseId, toCourseId: moveTarget,
        });
      }
      setSelectedStudents(new Set());
      setMoveTarget('');
      setClassMembers({});
      await loadCourses();
    } catch (error) {
      console.error('Failed to move students:', error);
      alert(error.response?.data?.error || 'Failed to move students.');
    }
  };

  const toggleStudentSelection = (studentId) => {
    setSelectedStudents(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  // Track members of currently expanded course for move confirmation
  const [allMembersForExpanded, setAllMembersForExpanded] = useState([]);

  const handleDeleteCourse = async (courseId, enrolled) => {
    if (enrolled > 0) {
      alert(`Cannot delete ${courseId} — ${enrolled} students enrolled. Remove all students first.`);
      return;
    }
    if (!confirm(`Delete entire course ${courseId} and all its class instances? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/courses/${courseId}`);
      setExpandedCourse(null);
      await loadCourses();
    } catch (error) {
      console.error('Failed to delete course:', error);
      alert(error.response?.data?.error || 'Failed to delete course.');
    }
  };

  // ── Derived data ──────────────────────────────────────────────────────────────
  const wtCourses = getWTCourses();
  const hbCourses = getHBCourses();
  const TODAY     = new Date();
  TODAY.setHours(0, 0, 0, 0);

  // Classes for selected day panel
  const dayClasses = selectedDate ? getClassesForDate(selectedDate) : [];

  // Auto-load students for all classes when a day is selected
  useEffect(() => {
    dayClasses.forEach(cls => {
      if (!classMembers[cls.id] && !loadingMembers[cls.id]) {
        loadClassMembers(cls);
      }
    });
  }, [selectedDate]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────────

  // ── WT course pipeline card ───────────────────────────────────────────────────
  function renderWTCard(course, i) {
    const isExpanded  = expandedCourse === course.id;
    const isPending   = course.status === 'pending';
    const cols        = isMobile ? 2 : 4;
    const rightBorder = (i + 1) % cols !== 0 ? `1px solid ${RULE}` : 'none';
    const borderColor = isPending ? '#E6A817' : course.color;
    const bgColor     = isPending ? '#FFFCF4' : '#FFFFFF';
    const hoverBg     = isPending ? '#FFF3DC' : TC_LIGHT;

    // Course enrollment roster — only students enrolled in THIS course (not makeups from other courses)
    // Rescheduled students are still part of the course (class-level reschedules don't affect course enrollment)
    const allMembersForCourse = [];
    const seenIds = new Set();
    course.classes.forEach(cls => {
      const members = classMembers[cls.id] || [];
      members.filter(m => !m.isMakeup).forEach(m => {
        if (!seenIds.has(m.studentId)) {
          seenIds.add(m.studentId);
          allMembersForCourse.push({ name: `${m.firstName} ${m.lastName}`, orders: m.returningCount || 1, studentId: m.studentId, email: m.email, bookingId: m.bookingId, classInstance: cls });
        }
      });
      // Include rescheduled students as regular enrolled (still in the course)
      const absent = absentMembers[cls.id] || [];
      absent.forEach(m => {
        if (!seenIds.has(m.studentId)) {
          seenIds.add(m.studentId);
          allMembersForCourse.push({ name: `${m.firstName} ${m.lastName}`, orders: m.returningCount || 1, studentId: m.studentId, email: m.email, bookingId: m.bookingId, classInstance: cls });
        }
      });
    });

    // Build open slots: use first class capacity minus enrolled count
    const enrolled  = allMembersForCourse.length > 0 ? allMembersForCourse.length : course.enrolled;
    const openSlots = Math.max(0, course.capacity - enrolled);

    return (
      <div key={course.id} style={{ borderBottom: `1px solid ${RULE}`, borderRight: rightBorder }}>
        {/* Card header */}
        <div
          onClick={() => { if (isExpanded) { setExpandedCourse(null); } else { setExpandedCourse(course.id); setSelectedStudents(new Set()); setMoveTarget(''); course.classes.forEach(cls => loadClassMembers(cls)); } }}
          style={{ borderLeft: `3px solid ${borderColor}`, backgroundColor: isExpanded ? hoverBg : bgColor, padding: '12px 12px 12px 11px', cursor: 'pointer', transition: 'background-color 0.1s' }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = hoverBg; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = isExpanded ? hoverBg : bgColor; }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '4px', marginBottom: '5px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, letterSpacing: '0.03em', lineHeight: 1.3 }}>{course.id}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 5px', backgroundColor: course.enrolled < 4 ? '#FFF7E6' : TC_LIGHT, color: course.enrolled < 4 ? '#9E6200' : TC_DARK }}>{course.enrolled < 4 ? 'Standby' : 'On'}</span>
              {course.enrolled < 4 && (
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteCourse(course.id, enrolled); }}
                  style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 5px', backgroundColor: '#FDECEA', color: '#D93025', border: 'none', cursor: 'pointer' }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
          <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '1px' }}>{course.dayName} · {course.timeLabel}</div>
          <div style={{ fontSize: '10px', color: MUTED, marginBottom: '10px' }}>{course.instructor}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '4px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>{enrolled}</span>
            <span style={{ fontSize: '10px', color: MUTED }}>/ {course.capacity}</span>
          </div>
          <div style={{ height: '4px', backgroundColor: ALT, position: 'relative', marginBottom: '8px' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(100, (enrolled / course.capacity) * 100)}%`, backgroundColor: course.color }} />
          </div>
          <div style={{ fontSize: '10px', color: MUTED }}>
            Wk {course.currentWeek}/{course.weeks}
            {course.nextClassDate ? ` · Next: ${fmtDateShort(course.nextClassDate)}` : ''}
          </div>
        </div>

        {/* Expanded panel */}
        {isExpanded && (
          <div style={{ padding: '10px 12px 12px', backgroundColor: TC_LIGHT, borderTop: `1px solid rgba(196,98,45,0.15)` }}>
            {/* Header with enrolled count and move controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TC_DARK }}>
                Enrolled — {enrolled}/{course.capacity}
              </div>
              {selectedStudents.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={e => e.stopPropagation()}>
                  <select
                    value={moveTarget}
                    onChange={e => setMoveTarget(e.target.value)}
                    style={{ fontSize: '9px', padding: '2px 4px', border: `1px solid ${RULE}`, fontFamily: 'inherit', color: INK }}
                  >
                    <option value="">Move {selectedStudents.size} to…</option>
                    {wtCourses.filter(c => c.id !== course.id).map(c => (
                      <option key={c.id} value={c.id}>{c.id}</option>
                    ))}
                  </select>
                  {moveTarget && (
                    <button
                      onClick={() => { setAllMembersForExpanded(allMembersForCourse); handleMoveSelectedStudents(course.id); }}
                      style={{ fontSize: '8px', fontWeight: 700, padding: '3px 8px', backgroundColor: TC, color: '#FFF', border: 'none', cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase' }}
                    >
                      Confirm
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Student grid — 2 columns, sorted by most orders */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', marginBottom: '10px', backgroundColor: RULE }}>
              {[...allMembersForCourse].sort((a, b) => (b.orders || 1) - (a.orders || 1)).map((s, j) => (
                <div
                  key={j}
                  onClick={() => navigate(`/admin/students/${encodeURIComponent(s.email)}`)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', backgroundColor: '#FFF', cursor: 'pointer', fontSize: '12px' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = TC_LIGHT}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FFF'}
                >
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span style={{ fontSize: '11px', color: s.orders > 1 ? TC_DARK : MUTED, fontWeight: 600 }}>{s.orders || 1}</span>
                </div>
              ))}
              {Array.from({ length: openSlots }).map((_, j) => (
                <div key={`open-${j}`} style={{ padding: '8px 10px', backgroundColor: '#FFF', fontSize: '10px', color: MUTED, fontStyle: 'italic' }}>
                  open
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={e => { e.stopPropagation(); if (course.classes[0]) handleOpenAddStudentModal(course.classes[0].id); }}
                style={{ flex: 1, padding: '7px', border: 'none', backgroundColor: course.color, color: '#FFF', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                + Add Student
              </button>
              <button
                onClick={e => { e.stopPropagation(); if (course.classes[0]) handleOpenEditClassModal(course.classes[0]); }}
                style={{ padding: '7px 10px', border: `1px solid ${RULE}`, backgroundColor: '#FFF', color: INK, fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
              >
                Edit
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── HB card ───────────────────────────────────────────────────────────────────
  function renderHBCard(hb, i) {
    const isExpanded  = expandedHBCard === hb.id;
    const cols        = isMobile ? 2 : 3;
    const rightBorder = (i + 1) % cols !== 0 ? `1px solid ${RULE}` : 'none';

    const allMembers = [];
    const seenIds = new Set();
    hb.classes.forEach(cls => {
      (classMembers[cls.id] || []).forEach(m => {
        if (!seenIds.has(m.studentId)) {
          seenIds.add(m.studentId);
          // Filter out completed students (all credits used)
          if (m.creditsAllocated != null && m.creditsUsed >= m.creditsAllocated) return;
          allMembers.push(m);
        }
      });
    });

    // Use filtered active member count if loaded, otherwise backend total
    const membersLoaded = hb.classes.some(cls => classMembers[cls.id]);
    const count       = membersLoaded ? allMembers.length : hb.enrolled;
    const atCap       = count >= hb.capacity;
    const nearCap     = count >= hb.capacity - 2 && !atCap;
    const fillColor   = atCap ? '#D93025' : nearCap ? '#E6A817' : '#888';
    const borderColor = atCap ? '#D93025' : '#888';

    return (
      <div key={hb.id} style={{ borderBottom: `1px solid ${RULE}`, borderRight: rightBorder }}>
        <div
          onClick={() => { if (isExpanded) { setExpandedHBCard(null); } else { setExpandedHBCard(hb.id); hb.classes.forEach(cls => loadClassMembers(cls)); } }}
          style={{ borderLeft: `3px solid ${borderColor}`, backgroundColor: isExpanded ? ALT : '#FFFFFF', padding: '12px 12px 12px 11px', cursor: 'pointer', transition: 'background-color 0.1s' }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = ALT; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = isExpanded ? ALT : '#FFFFFF'; }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '4px', marginBottom: '5px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, letterSpacing: '0.03em', lineHeight: 1.3 }}>{hb.id}</span>
            <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 5px', backgroundColor: ALT, color: MUTED, flexShrink: 0 }}>Drop-in</span>
          </div>
          <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '1px' }}>{hb.dayName} · {hb.timeLabel}</div>
          <div style={{ fontSize: '10px', color: MUTED, marginBottom: '10px' }}>{hb.instructor}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '4px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: atCap ? '#D93025' : INK }}>{count}</span>
            <span style={{ fontSize: '10px', color: MUTED }}>/ {hb.capacity}</span>
            {atCap   && <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 5px', backgroundColor: '#FDECEA', color: '#D93025' }}>Full</span>}
            {nearCap && <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 5px', backgroundColor: '#FFF7E6', color: '#9E6200' }}>Near cap</span>}
          </div>
          <div style={{ height: '4px', backgroundColor: ALT, position: 'relative', marginBottom: '8px' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(100, (count / hb.capacity) * 100)}%`, backgroundColor: fillColor }} />
          </div>
          <div style={{ fontSize: '10px', color: MUTED }}>credit-based · ongoing</div>
        </div>

        {isExpanded && (
          <div style={{ padding: '10px 12px 12px', backgroundColor: ALT, borderTop: `1px solid rgba(0,0,0,0.06)` }}>
            <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '8px' }}>
              Enrolled — {count}/{hb.capacity}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
              {allMembers.map((m, j) => (
                <div
                  key={j}
                  onClick={() => navigate(`/admin/students/${encodeURIComponent(m.email)}`)}
                  style={{ fontSize: '10px', fontWeight: 600, padding: '5px 8px', backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3px', cursor: 'pointer' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortName(`${m.firstName} ${m.lastName}`)}</span>
                  {m.creditsAllocated != null ? (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: m.creditsUsed >= m.creditsAllocated ? '#D93025' : MUTED, flexShrink: 0, fontFamily: 'monospace' }}>{m.creditsAllocated}.{m.creditsUsed}</span>
                  ) : (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: MUTED, flexShrink: 0 }}>{m.returningCount || 1}</span>
                  )}
                </div>
              ))}
              {Array.from({ length: Math.max(0, hb.capacity - count) }).map((_, j) => (
                <span key={`open-${j}`} style={{ fontSize: '10px', padding: '5px 8px', border: `1px dashed ${RULE}`, color: '#CCC' }}>open</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
              <button
                onClick={e => { e.stopPropagation(); if (hb.classes[0]) handleOpenAddStudentModal(hb.classes[0].id); }}
                style={{ flex: 1, padding: '7px', border: 'none', backgroundColor: INK, color: '#FFF', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                + Add Student
              </button>
              <button
                onClick={e => { e.stopPropagation(); if (hb.classes[0]) handleOpenEditClassModal(hb.classes[0]); }}
                style={{ padding: '7px 10px', border: `1px solid ${RULE}`, backgroundColor: '#FFF', color: INK, fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
              >
                Edit
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Calendar cell ──────────────────────────────────────────────────────────────
  function renderCalCell(day, idx) {
    if (!day) {
      return (
        <div key={`pad-${idx}`} style={{ minHeight: isMobile ? '50px' : '76px', borderRight: idx % 7 < 6 ? `1px solid ${RULE}` : 'none', borderBottom: `1px solid ${RULE}`, backgroundColor: '#F9F9F8' }} />
      );
    }
    const isToday    = sameDay(day, TODAY);
    const isSelected = selectedDate && sameDay(day, selectedDate);
    const events     = getEventsForDay(day, wtCourses);
    const hasEvents  = events.length > 0;

    return (
      <div
        key={day.toISOString()}
        onClick={() => { if (hasEvents || isSelected) setSelectedDate(isSelected ? null : day); }}
        style={{
          minHeight: isMobile ? '50px' : '76px',
          borderRight: idx % 7 < 6 ? `1px solid ${RULE}` : 'none',
          borderBottom: `1px solid ${RULE}`,
          padding: isMobile ? '4px 3px' : '5px 4px',
          cursor: hasEvents ? 'pointer' : 'default',
          backgroundColor: isSelected ? TC_LIGHT : isToday ? '#FFFDF4' : '#FFFFFF',
          transition: 'background-color 0.1s',
        }}
        onMouseEnter={e => { if (hasEvents && !isSelected) e.currentTarget.style.backgroundColor = ALT; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = isToday ? '#FFFDF4' : '#FFFFFF'; }}
      >
        <div style={{ marginBottom: '3px' }}>
          {isToday ? (
            <span style={{ width: '18px', height: '18px', backgroundColor: TC, color: '#FFF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700 }}>
              {day.getDate()}
            </span>
          ) : (
            <span style={{ fontSize: '11px', color: hasEvents ? INK : '#CCC', fontWeight: hasEvents ? 600 : 400 }}>
              {day.getDate()}
            </span>
          )}
        </div>

        {isMobile ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
            {events.map((ev, j) => {
              const col = ev.kind === 'WT' ? ev.course.color : '#B8B3AB';
              return <span key={j} style={{ width: '7px', height: '7px', display: 'inline-block', backgroundColor: ev.cancelled ? '#CCC' : col, opacity: ev.cancelled ? 0.5 : 1 }} />;
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {events.map((ev, j) => {
              if (ev.kind === 'WT') {
                return (
                  <div key={j} style={{
                    fontSize: '8px', fontWeight: 700, letterSpacing: '0.02em',
                    padding: '1px 3px', lineHeight: 1.5,
                    backgroundColor: ev.cancelled ? '#CCC' : ev.course.color,
                    color: '#FFF',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    textDecoration: ev.cancelled ? 'line-through' : 'none',
                    opacity: ev.cancelled ? 0.7 : 1,
                  }}>
                    {ev.cancelled ? '✕ ' : ''}{ev.course.id?.slice(0, 8)} {ev.weekNum}/{ev.course.weeks}
                  </div>
                );
              }
              return (
                <div key={j} style={{ fontSize: '8px', fontWeight: 600, padding: '1px 3px', lineHeight: 1.5, backgroundColor: ev.cancelled ? '#CCC' : '#E2DFD9', color: ev.cancelled ? '#999' : '#555', whiteSpace: 'nowrap', textDecoration: ev.cancelled ? 'line-through' : 'none', opacity: ev.cancelled ? 0.7 : 1 }}>
                  {ev.cancelled ? '✕ ' : ''}{ev.hb.shortLabel}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Day detail: student table (for a given class instance from API) ────────────
  // Update booking type (enrolled/makeup) with optional course identifier
  const handleUpdateBookingType = async (bookingId, classInstanceId, newType, originalCourseIdentifier) => {
    try {
      await api.put(`/admin/bookings/${bookingId}/type`, { bookingType: newType, originalCourseIdentifier: originalCourseIdentifier || null });
      // Refresh members for this class
      setClassMembers(prev => ({ ...prev, [classInstanceId]: null }));
      const { data } = await api.get(`/admin/classes/${classInstanceId}/members`);
      setClassMembers(prev => ({ ...prev, [classInstanceId]: data.members || [] }));
      setAbsentMembers(prev => ({ ...prev, [classInstanceId]: data.absentMembers || [] }));
    } catch (error) {
      console.error('Failed to update booking type:', error);
    }
  };

  // State for editing makeup course identifier
  const [editingMakeupId, setEditingMakeupId] = useState(null);
  const [makeupCourseInput, setMakeupCourseInput] = useState('');

  function renderDayDetailMemberTable(classInstance) {
    const members = classMembers[classInstance.id] || [];
    const regular = members.filter(m => !m.isMakeup);
    const makeup  = members.filter(m => m.isMakeup);
    const absent  = absentMembers[classInstance.id] || [];

    const renderMemberRow = (m, j, isMakeup, rowNum) => {
      const bgColor = isMakeup ? '#FAF8FF' : '#FFFFFF';
      const hoverBg = isMakeup ? '#F3EEFF' : TC_LIGHT;
      const nameColor = isMakeup ? '#5A2D82' : TC_DARK;
      return (
        <div
          key={m.bookingId || j}
          style={{ display: 'grid', gridTemplateColumns: '22px 1fr 50px 100px 80px', padding: '9px 12px', borderTop: `1px solid ${RULE}`, backgroundColor: bgColor, alignItems: 'center' }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = hoverBg}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = bgColor}
        >
          <span style={{ fontSize: '10px', color: MUTED, fontWeight: 600 }}>{rowNum}.</span>
          <span
            onClick={() => navigate(`/admin/students/${encodeURIComponent(m.email)}`)}
            style={{ fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: nameColor, textDecoration: 'underline' }}
          >
            {m.firstName} {m.lastName}
          </span>
          <span style={{ fontSize: '11px', fontWeight: 600, textAlign: 'right', color: m.returningCount > 1 ? TC_DARK : MUTED }}>{m.returningCount || 1}</span>
          <div style={{ textAlign: 'center' }}>
            <select
              value={isMakeup ? 'makeup' : 'enrolled'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'makeup') {
                  setEditingMakeupId(m.bookingId);
                  setMakeupCourseInput(m.originalClassIdentifier || '');
                } else {
                  setEditingMakeupId(null);
                  handleUpdateBookingType(m.bookingId, classInstance.id, 'enrolled', null);
                }
              }}
              style={{ fontSize: '10px', padding: '2px 4px', border: `1px solid ${RULE}`, backgroundColor: isMakeup ? 'rgba(90,45,130,0.06)' : '#FFF', color: isMakeup ? '#5A2D82' : INK, cursor: 'pointer', fontWeight: 600 }}
            >
              <option value="enrolled">Enrolled</option>
              <option value="makeup">Makeup</option>
            </select>
            {isMakeup && editingMakeupId === m.bookingId ? (
              <div style={{ display: 'flex', gap: '3px', marginTop: '3px' }}>
                <input
                  type="text"
                  value={makeupCourseInput}
                  onChange={(e) => setMakeupCourseInput(e.target.value)}
                  placeholder="e.g. WT2301AM_JL6"
                  style={{ fontSize: '9px', padding: '2px 4px', border: `1px solid ${RULE}`, width: '110px' }}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') { handleUpdateBookingType(m.bookingId, classInstance.id, 'makeup', makeupCourseInput); setEditingMakeupId(null); } }}
                />
                <button
                  onClick={() => { handleUpdateBookingType(m.bookingId, classInstance.id, 'makeup', makeupCourseInput); setEditingMakeupId(null); }}
                  style={{ fontSize: '9px', padding: '2px 6px', border: 'none', backgroundColor: TC, color: '#FFF', cursor: 'pointer', fontWeight: 700 }}
                >
                  ✓
                </button>
              </div>
            ) : isMakeup && m.originalClassIdentifier ? (
              <div
                onClick={() => { setEditingMakeupId(m.bookingId); setMakeupCourseInput(m.originalClassIdentifier || ''); }}
                style={{ fontSize: '9px', color: '#8B6AAE', marginTop: '2px', cursor: 'pointer' }}
                title="Click to edit"
              >
                from {m.originalClassIdentifier}
              </div>
            ) : isMakeup ? (
              <div
                onClick={() => { setEditingMakeupId(m.bookingId); setMakeupCourseInput(''); }}
                style={{ fontSize: '9px', color: '#8B6AAE', marginTop: '2px', cursor: 'pointer', fontStyle: 'italic' }}
              >
                + add source
              </div>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                setReschedulingBooking({ bookingId: m.bookingId, studentName: `${m.firstName} ${m.lastName}`, studentId: m.studentId, classInstance, weekNumber: getWeekNumberFromClassType(classInstance.class_type) });
                setRescheduleData({ newClassInstanceId: null, reason: '', isGlazing: classInstance.class_type?.toLowerCase().includes('glazing') });
                loadAvailableClassesForReschedule(classInstance, m.studentId);
                setShowRescheduleModal(true);
              }}
              style={{ fontSize: '9px', padding: '3px 6px', border: `1px solid ${RULE}`, backgroundColor: '#FFF', color: INK, cursor: 'pointer', fontWeight: 700 }}
            >
              Reschedule
            </button>
            <button
              onClick={() => handleRemoveStudent(m.bookingId, classInstance.id, `${m.firstName} ${m.lastName}`)}
              style={{ fontSize: '9px', padding: '3px 6px', border: 'none', backgroundColor: '#FDECEA', color: '#D93025', cursor: 'pointer', fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        </div>
      );
    };

    return (
      <div style={{ border: `1px solid ${RULE}`, marginTop: '4px' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 50px 100px 80px', backgroundColor: ALT, padding: '6px 12px' }}>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>#</span>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>Student</span>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, textAlign: 'right' }}>Orders</span>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, textAlign: 'center' }}>Type</span>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, textAlign: 'center' }}>Actions</span>
        </div>

        {loadingMembers[classInstance.id] && (
          <div style={{ padding: '12px', textAlign: 'center', color: MUTED, fontSize: '12px' }}>Loading...</div>
        )}

        {regular.map((m, j) => renderMemberRow(m, j, false, j + 1))}
        {makeup.map((m, j) => renderMemberRow(m, j, true, regular.length + j + 1))}

        {absent.map((m, j) => (
          <div
            key={`ab-${m.bookingId || j}`}
            style={{ display: 'grid', gridTemplateColumns: '22px 1fr 50px 100px 80px', padding: '9px 12px', borderTop: `1px solid ${RULE}`, backgroundColor: '#FFFBF0', alignItems: 'center' }}
          >
            <span />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#9E6200' }}>{m.firstName} {m.lastName}</span>
            <span />
            <span style={{ fontSize: '10px', color: '#9E6200', minWidth: '80px', textAlign: 'center' }}>{m.status === 'rescheduled' ? 'Rescheduled' : m.status === 'absent' ? 'Absent' : 'No-show'}</span>
            <div />
          </div>
        ))}

        {!loadingMembers[classInstance.id] && members.length === 0 && (
          <div style={{ padding: '9px 12px', borderTop: `1px solid ${RULE}` }}>
            <span style={{ fontSize: '12px', color: MUTED }}>No students enrolled</span>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: isMobile ? '20px 16px 60px' : '32px 24px 60px' }}>

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>Admin</div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '48px', color: MUTED, fontSize: '13px' }}>
            {summaryStats ? `Loading ${summaryStats.totalClasses} classes...` : 'Loading...'}
          </div>
        )}

        {!loading && (
          <>
            {/* ── COURSE ENROLLMENT ────────────────────────────────────── */}
            <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: `2px solid ${INK}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: 700, margin: 0, letterSpacing: '-0.2px' }}>Course Enrollment</h2>
                <div style={{ fontSize: '10px', color: MUTED, marginTop: '2px' }}>Students enrolled in each course — permanent roster</div>
              </div>
              <button
                onClick={() => setShowCreateClassModal(true)}
                style={{ padding: isMobile ? '8px 12px' : '9px 16px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                + Add Course
              </button>
            </div>
            <div style={{ marginBottom: '32px', marginTop: '14px' }}>
              {/* WT */}
              {wtCourses.length > 0 && (
                <>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>Wheelthrowing Courses</div>
                  <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : `repeat(${Math.min(4, wtCourses.length)}, 1fr)` }}>
                    {wtCourses.map((course, i) => renderWTCard(course, i))}
                  </div>
                </>
              )}

              {/* HB */}
              {hbCourses.length > 0 && (
                <>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, margin: '16px 0 12px' }}>Handbuilding Classes</div>
                  <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)' }}>
                    {[...hbCourses].sort((a, b) => ((a.dayOfWeek + 6) % 7) - ((b.dayOfWeek + 6) % 7)).map((hb, i) => renderHBCard(hb, i))}
                  </div>
                </>
              )}

              {wtCourses.length === 0 && hbCourses.length === 0 && (
                <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
                  No courses found.
                </div>
              )}
            </div>

            {/* ── CLASS SCHEDULE ────────────────────────────────────── */}
            <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: `2px solid ${INK}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: 700, margin: 0, letterSpacing: '-0.2px' }}>Class Schedule</h2>
                <div style={{ fontSize: '10px', color: MUTED, marginTop: '2px' }}>Individual class sessions for attendance — includes makeups and reschedules</div>
              </div>
              <button
                onClick={() => setShowAddSingleClass(true)}
                style={{ padding: isMobile ? '8px 12px' : '9px 16px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                + Add Class
              </button>
            </div>

            {/* ── FILTERS ────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '14px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div>
                <label style={labelSt}>Type</label>
                <select value={classTypeFilter} onChange={e => setClassTypeFilter(e.target.value)} style={{ ...selectSt, width: 'auto', padding: '7px 10px' }}>
                  <option value="all">All</option>
                  <option value="wheelthrowing-beginner">WT Beginner</option>
                  <option value="wheelthrowing-intermediate">WT Intermediate</option>
                  <option value="handbuilding">Handbuilding</option>
                  <option value="kids">Kids</option>
                </select>
              </div>
              <div>
                <label style={labelSt}>Cohort</label>
                <select value={cohortFilter} onChange={e => setCohortFilter(e.target.value)} style={{ ...selectSt, width: 'auto', padding: '7px 10px' }}>
                  <option value="all">All</option>
                  {cohortOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ── CALENDAR ───────────────────────────────────────────── */}
            <ClassCalendarGrid
              isMobile={isMobile}
              calPage={calPage}
              setCalPage={setCalPage}
              CAL_MONTHS={CAL_MONTHS}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              TODAY={TODAY}
              getEventsForDay={getEventsForDay}
              wtCourses={wtCourses}
              hbCourses={hbCourses}
              renderCalCell={renderCalCell}
            />

            {/* ── DAY DETAIL PANEL ────────────────────────────────────── */}
            {selectedDate && (
              <ClassDayDetail
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                dayClasses={dayClasses}
                isMobile={isMobile}
                getClassCategory={getClassCategory}
                wtCourses={wtCourses}
                loadingMembers={loadingMembers}
                classMembers={classMembers}
                handleOpenAddStudentModal={handleOpenAddStudentModal}
                handleOpenEditClassModal={handleOpenEditClassModal}
                handleDeleteClass={handleDeleteClass}
                handleOpenPostponeModal={handleOpenPostponeModal}
                renderDayDetailMemberTable={renderDayDetailMemberTable}
              />
            )}
          </>
        )}
      </main>

      {/* ═══ MODALS ═══════════════════════════════════════════════════════════ */}

      <AddSingleClassModal
        show={showAddSingleClass}
        onClose={() => setShowAddSingleClass(false)}
        isMobile={isMobile}
        courses={courses}
      />

      <CreateCourseModal
        show={showCreateClassModal}
        onClose={() => setShowCreateClassModal(false)}
        isMobile={isMobile}
        createClassData={createClassData}
        setCreateClassData={setCreateClassData}
        handleNumberOfClassesChange={handleNumberOfClassesChange}
        handleClassDateChange={handleClassDateChange}
        handleCreateClass={handleCreateClass}
        creatingClass={creatingClass}
      />

      <EditClassModal
        show={showEditClassModal}
        editingClass={editingClass}
        onClose={() => setShowEditClassModal(false)}
        isMobile={isMobile}
        editClassData={editClassData}
        setEditClassData={setEditClassData}
        handleUpdateClass={handleUpdateClass}
        updatingClass={updatingClass}
      />

      <RescheduleModal
        show={showRescheduleModal}
        reschedulingBooking={reschedulingBooking}
        onClose={() => setShowRescheduleModal(false)}
        isMobile={isMobile}
        availableClasses={availableClasses}
        rescheduleData={rescheduleData}
        setRescheduleData={setRescheduleData}
        handleReschedule={handleReschedule}
        rescheduling={rescheduling}
        formatDate={formatDate}
      />

      {/* Postpone Course Modal */}
      {showPostponeModal && postponeCourse && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#FFFFFF', padding: isMobile ? '24px 20px' : '32px', width: '440px', maxWidth: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>Postpone Course</div>
              <button onClick={() => setShowPostponeModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: '#888', lineHeight: 1, padding: '0 0 0 16px' }}>&#10005;</button>
            </div>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '22px' }}>
              Push classes forward when instructor is unavailable
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, marginBottom: '16px', padding: '8px 10px', backgroundColor: '#F9EDE6', color: '#9E4A1E' }}>
              {postponeCourse.id}
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', display: 'block', marginBottom: '5px' }}>Postpone from</label>
              <select
                value={postponeFromClassId}
                onChange={e => setPostponeFromClassId(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid rgba(40,40,40,0.09)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }}
              >
                <option value="">Select class...</option>
                {postponeCourse.classes
                  .filter(c => new Date(c.class_date) >= new Date(new Date().setHours(0,0,0,0)))
                  .sort((a, b) => new Date(a.class_date) - new Date(b.class_date))
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      {c.class_type} — {new Date(c.class_date).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </option>
                  ))}
              </select>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888', display: 'block', marginBottom: '5px' }}>Push forward by</label>
              <select
                value={postponeWeeks}
                onChange={e => setPostponeWeeks(parseInt(e.target.value))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid rgba(40,40,40,0.09)', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }}
              >
                <option value={1}>1 week</option>
                <option value={2}>2 weeks</option>
                <option value={3}>3 weeks</option>
              </select>
            </div>

            {postponeFromClassId && (
              <div style={{ padding: '10px 12px', backgroundColor: '#FFF7E6', marginBottom: '18px', fontSize: '11px', color: '#9E6200' }}>
                {(() => {
                  const fromClass = postponeCourse.classes.find(c => c.id === parseInt(postponeFromClassId));
                  if (!fromClass) return null;
                  const affected = postponeCourse.classes
                    .filter(c => new Date(c.class_date) >= new Date(fromClass.class_date))
                    .sort((a, b) => new Date(a.class_date) - new Date(b.class_date));
                  return (
                    <>
                      <div style={{ fontWeight: 700, marginBottom: '6px' }}>{affected.length} class{affected.length > 1 ? 'es' : ''} will shift:</div>
                      {affected.map(c => {
                        const oldDate = new Date(c.class_date);
                        const newDate = new Date(oldDate);
                        newDate.setDate(newDate.getDate() + postponeWeeks * 7);
                        return (
                          <div key={c.id} style={{ display: 'flex', gap: '6px', marginBottom: '2px' }}>
                            <span>{c.class_type}:</span>
                            <span style={{ textDecoration: 'line-through' }}>{oldDate.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span>
                            <span>&rarr;</span>
                            <span style={{ fontWeight: 700 }}>{newDate.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}</span>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            )}

            <button
              onClick={handlePostponeCourse}
              disabled={postponing || !postponeFromClassId}
              style={{
                width: '100%', padding: '11px', border: 'none',
                backgroundColor: postponeFromClassId ? '#C4622D' : '#ccc',
                color: '#FFF', fontSize: '12px', fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                cursor: postponeFromClassId ? 'pointer' : 'not-allowed',
              }}
            >
              {postponing ? 'Postponing...' : 'Confirm Postpone'}
            </button>
          </div>
        </div>
      )}

      <AddStudentModal
        show={showAddStudentModal}
        onClose={() => setShowAddStudentModal(false)}
        studentSearchQuery={studentSearchQuery}
        setStudentSearchQuery={setStudentSearchQuery}
        loadingStudents={loadingStudents}
        getFilteredStudents={getFilteredStudents}
        handleAddStudent={handleAddStudent}
        addingStudent={addingStudent}
      />

      {/* OLD MODALS REMOVED — replaced by ClassModals components above */}
    </div>
  );
}
