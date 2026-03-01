import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import AdminNav from '../components/AdminNav';

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
  const [classMembers, setClassMembers] = useState({});
  const [absentMembers, setAbsentMembers] = useState({});
  const [loadingMembers, setLoadingMembers] = useState({});

  // ── UI state ────────────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate]     = useState(null);
  const [expandedCourse, setExpandedCourse] = useState(null); // course identifier (WT pipeline cards)
  const [expandedHBCard, setExpandedHBCard] = useState(null); // HB course identifier
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
  const [editClassData, setEditClassData] = useState({ classDate: '', startTime: '', endTime: '', instructor: '', maxCapacity: 12 });
  const [updatingClass, setUpdatingClass] = useState(false);

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
  useEffect(() => { loadCourses(); }, []);

  const loadCourses = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/classes');
      setCourses(data.courses || []);
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
    const wtCourses = courses.filter(c => {
      if (!c.classes || c.classes.length === 0) return false;
      if (getClassCategory(c.classes[0]?.class_type) === 'handbuilding') return false;
      if (cohortFilter !== 'all' && !cohortFilter.split(',').includes(getCourseStartMonth(c))) return false;
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
          evs.push({ kind: 'WT', course: c, courseIdx: idx, cls, weekNum: clsIdx + 1 });
        }
      });
    });

    // HB courses: check if any class in the course falls on this date
    getHBCourses().forEach(hb => {
      hb.classes.forEach(cls => {
        if (cls.class_date?.startsWith(dateStr)) {
          evs.push({ kind: 'HB', hb });
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
      });
      await loadCourses();
      alert('Class updated successfully!');
      setShowEditClassModal(false);
      setEditingClass(null);
      setEditClassData({ classDate: '', startTime: '', endTime: '', instructor: '', maxCapacity: 12 });
    } catch (error) {
      console.error('Failed to update class:', error);
      alert(error.response?.data?.error || 'Failed to update class. Please try again.');
    } finally {
      setUpdatingClass(false);
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
      alert('Class deleted successfully!');
    } catch (error) {
      console.error('Failed to delete class:', error);
      alert(error.response?.data?.error || 'Failed to delete class. Please try again.');
    }
  };

  // ── Derived data ──────────────────────────────────────────────────────────────
  const wtCourses = getWTCourses();
  const hbCourses = getHBCourses();
  const TODAY     = new Date();
  TODAY.setHours(0, 0, 0, 0);

  // Classes for selected day panel
  const dayClasses = selectedDate ? getClassesForDate(selectedDate) : [];

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

    // Find all members from classMembers cache (from the day detail expanded state)
    const allMembersForCourse = [];
    const seenIds = new Set();
    course.classes.forEach(cls => {
      const members = classMembers[cls.id] || [];
      members.filter(m => !m.isMakeup && m.courseEnrollmentId !== null).forEach(m => {
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
          onClick={() => { if (isExpanded) { setExpandedCourse(null); } else { setExpandedCourse(course.id); if (course.classes[0]) loadClassMembers(course.classes[0]); } }}
          style={{ borderLeft: `3px solid ${borderColor}`, backgroundColor: isExpanded ? hoverBg : bgColor, padding: '12px 12px 12px 11px', cursor: 'pointer', transition: 'background-color 0.1s' }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = hoverBg; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = isExpanded ? hoverBg : bgColor; }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '4px', marginBottom: '5px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, letterSpacing: '0.03em', lineHeight: 1.3 }}>{course.id}</span>
            <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 5px', backgroundColor: course.enrolled < 4 ? '#FFF7E6' : TC_LIGHT, color: course.enrolled < 4 ? '#9E6200' : TC_DARK, flexShrink: 0 }}>{course.enrolled < 4 ? 'Standby' : 'On'}</span>
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
            <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TC_DARK, marginBottom: '8px' }}>
              Enrolled — {enrolled}/{course.capacity}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', marginBottom: '10px' }}>
              {allMembersForCourse.map((s, j) => (
                <div
                  key={j}
                  onClick={e => { e.stopPropagation(); navigate(`/admin/students/${encodeURIComponent(s.email)}`); }}
                  style={{ fontSize: '10px', fontWeight: 600, padding: '5px 8px', backgroundColor: '#FFFFFF', border: `1px solid rgba(196,98,45,0.2)`, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3px', cursor: 'pointer' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortName(s.name)}</span>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: TC, flexShrink: 0 }}>{s.orders}</span>
                </div>
              ))}
              {Array.from({ length: openSlots }).map((_, j) => (
                <span key={`open-${j}`} style={{ fontSize: '10px', padding: '5px 8px', border: `1px dashed ${RULE}`, color: MUTED }}>open</span>
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
    const count       = hb.enrolled;
    const atCap       = count >= hb.capacity;
    const nearCap     = count >= hb.capacity - 2 && !atCap;
    const fillColor   = atCap ? '#D93025' : nearCap ? '#E6A817' : '#888';
    const borderColor = atCap ? '#D93025' : '#888';
    const isExpanded  = expandedHBCard === hb.id;
    const cols        = isMobile ? 2 : 3;
    const rightBorder = (i + 1) % cols !== 0 ? `1px solid ${RULE}` : 'none';

    const allMembers = [];
    const seenIds = new Set();
    hb.classes.forEach(cls => {
      (classMembers[cls.id] || []).forEach(m => {
        if (!seenIds.has(m.studentId)) {
          seenIds.add(m.studentId);
          allMembers.push(m);
        }
      });
    });

    return (
      <div key={hb.id} style={{ borderBottom: `1px solid ${RULE}`, borderRight: rightBorder }}>
        <div
          onClick={() => { if (isExpanded) { setExpandedHBCard(null); } else { setExpandedHBCard(hb.id); if (hb.classes[0]) loadClassMembers(hb.classes[0]); } }}
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
                  <span style={{ fontSize: '10px', fontWeight: 700, color: MUTED, flexShrink: 0 }}>{m.returningCount || 1}</span>
                </div>
              ))}
              {Array.from({ length: Math.max(0, hb.capacity - count) }).map((_, j) => (
                <span key={`open-${j}`} style={{ fontSize: '10px', padding: '5px 8px', border: `1px dashed ${RULE}`, color: '#CCC' }}>open</span>
              ))}
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
              return <span key={j} style={{ width: '7px', height: '7px', display: 'inline-block', backgroundColor: col }} />;
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
                    backgroundColor: ev.course.color,
                    color: '#FFF',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {ev.course.id?.slice(0, 8)} {ev.weekNum}/{ev.course.weeks}
                  </div>
                );
              }
              return (
                <div key={j} style={{ fontSize: '8px', fontWeight: 600, padding: '1px 3px', lineHeight: 1.5, backgroundColor: '#E2DFD9', color: '#555', whiteSpace: 'nowrap' }}>
                  {ev.hb.shortLabel}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Day detail: student table (for a given class instance from API) ────────────
  function renderDayDetailMemberTable(classInstance) {
    const members = classMembers[classInstance.id] || [];
    const regular = members.filter(m => !m.isMakeup);
    const makeup  = members.filter(m => m.isMakeup);
    const absent  = absentMembers[classInstance.id] || [];

    return (
      <div style={{ border: `1px solid ${RULE}`, marginTop: '4px' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 60px', backgroundColor: ALT, padding: '6px 12px' }}>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>Student</span>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>Type</span>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, textAlign: 'right' }}>Actions</span>
        </div>

        {loadingMembers[classInstance.id] && (
          <div style={{ padding: '12px', textAlign: 'center', color: MUTED, fontSize: '12px' }}>Loading...</div>
        )}

        {regular.map((m, j) => (
          <div
            key={m.bookingId || j}
            style={{ display: 'grid', gridTemplateColumns: '1fr 80px 60px', padding: '9px 12px', borderTop: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', alignItems: 'center' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = TC_LIGHT}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FFFFFF'}
          >
            <span
              onClick={() => navigate(`/admin/students/${encodeURIComponent(m.email)}`)}
              style={{ fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: TC_DARK, textDecoration: 'underline' }}
            >
              {m.firstName} {m.lastName}
              {m.returningCount > 1 && <span style={{ fontSize: '10px', color: MUTED, fontWeight: 400, marginLeft: '4px' }}>({m.returningCount}x)</span>}
            </span>
            <span style={{ fontSize: '10px', color: MUTED }}>Enrolled</span>
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
        ))}

        {makeup.map((m, j) => (
          <div
            key={`mu-${m.bookingId || j}`}
            style={{ display: 'grid', gridTemplateColumns: '1fr 80px 60px', padding: '9px 12px', borderTop: `1px solid ${RULE}`, backgroundColor: '#FAF8FF', alignItems: 'center' }}
          >
            <span
              onClick={() => navigate(`/admin/students/${encodeURIComponent(m.email)}`)}
              style={{ fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: '#5A2D82', textDecoration: 'underline' }}
            >
              {m.firstName} {m.lastName}
            </span>
            <span style={{ fontSize: '10px', color: '#5A2D82' }}>Makeup</span>
            <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => handleRemoveStudent(m.bookingId, classInstance.id, `${m.firstName} ${m.lastName}`)}
                style={{ fontSize: '9px', padding: '3px 6px', border: 'none', backgroundColor: '#FDECEA', color: '#D93025', cursor: 'pointer', fontWeight: 700 }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}

        {absent.map((m, j) => (
          <div
            key={`ab-${m.bookingId || j}`}
            style={{ display: 'grid', gridTemplateColumns: '1fr 80px 60px', padding: '9px 12px', borderTop: `1px solid ${RULE}`, backgroundColor: '#FFFBF0', alignItems: 'center' }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#9E6200' }}>{m.firstName} {m.lastName}</span>
            <span style={{ fontSize: '10px', color: '#9E6200' }}>{m.status === 'rescheduled' ? 'Rescheduled' : 'Absent'}</span>
            <div />
          </div>
        ))}

        {!loadingMembers[classInstance.id] && members.length === 0 && (
          <div
            style={{ padding: '9px 12px', borderTop: `1px solid ${RULE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span style={{ fontSize: '12px', color: MUTED }}>No students enrolled</span>
            <button
              onClick={() => toggleClassMembers(classInstance)}
              style={{ fontSize: '9px', padding: '4px 8px', border: `1px solid ${RULE}`, backgroundColor: '#FFF', color: MUTED, cursor: 'pointer' }}
            >
              Load
            </button>
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
      <AdminNav active="classes" onSyncComplete={loadCourses} />

      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: isMobile ? '20px 16px 60px' : '32px 24px 60px' }}>

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>Admin</div>
            <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>Class Schedule</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowAddSingleClass(true)}
              style={{ padding: isMobile ? '9px 14px' : '10px 18px', backgroundColor: 'transparent', color: TC, border: `1px solid ${TC}`, fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              + Add Class
            </button>
            <button
              onClick={() => setShowCreateClassModal(true)}
              style={{ padding: isMobile ? '9px 14px' : '10px 18px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              + New Course
            </button>
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '48px', color: MUTED, fontSize: '13px' }}>Loading...</div>
        )}

        {!loading && (
          <>
            {/* ── COURSE PIPELINE ────────────────────────────────────── */}
            <div style={{ marginBottom: '28px' }}>
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
                  <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)' }}>
                    {hbCourses.map((hb, i) => renderHBCard(hb, i))}
                  </div>
                </>
              )}

              {wtCourses.length === 0 && hbCourses.length === 0 && (
                <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
                  No courses found.
                </div>
              )}
            </div>

            {/* ── FILTERS ────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
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
            <div style={{ marginBottom: selectedDate ? '20px' : '0' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Calendar</span>
                <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: MUTED }}>
                  — {isMobile ? 'Tap' : 'Click'} any day to see classes
                </span>
              </div>

              {isMobile ? (
                /* Mobile: single month + prev/next */
                <div>
                  <div style={{ backgroundColor: '#FFFFFF', border: `1px solid ${RULE}` }}>
                    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <button
                        onClick={() => { setCalPage(p => Math.max(0, p - 1)); setSelectedDate(null); }}
                        disabled={calPage === 0}
                        style={{ padding: '5px 12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '14px', fontWeight: 700, cursor: calPage === 0 ? 'default' : 'pointer', color: calPage === 0 ? '#CCC' : INK }}
                      >←</button>
                      <span style={{ fontSize: '13px', fontWeight: 700 }}>{CAL_MONTHS[calPage]?.label}</span>
                      <button
                        onClick={() => { setCalPage(p => Math.min(CAL_MONTHS.length - 1, p + 1)); setSelectedDate(null); }}
                        disabled={calPage === CAL_MONTHS.length - 1}
                        style={{ padding: '5px 12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '14px', fontWeight: 700, cursor: calPage === CAL_MONTHS.length - 1 ? 'default' : 'pointer', color: calPage === CAL_MONTHS.length - 1 ? '#CCC' : INK }}
                      >→</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${RULE}` }}>
                      {WEEKDAY_LABELS.map(d => (
                        <div key={d} style={{ textAlign: 'center', padding: '5px 0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{d.charAt(0)}</div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                      {CAL_MONTHS[calPage] && buildCalendar(CAL_MONTHS[calPage].year, CAL_MONTHS[calPage].month).map((day, idx) => renderCalCell(day, idx))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '10px' }}>
                    {CAL_MONTHS.map((_, i) => (
                      <button key={i} onClick={() => { setCalPage(i); setSelectedDate(null); }} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: calPage === i ? TC : '#CCC', border: 'none', cursor: 'pointer', padding: 0 }} />
                    ))}
                  </div>
                </div>
              ) : (
                /* Desktop: 3-month grid */
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  {CAL_MONTHS.slice(1, 4).map(({ year, month, label }) => {
                    const calDays = buildCalendar(year, month);
                    return (
                      <div key={`${year}-${month}`} style={{ backgroundColor: '#FFFFFF', border: `1px solid ${RULE}` }}>
                        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, fontSize: '13px', fontWeight: 700 }}>{label}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${RULE}` }}>
                          {WEEKDAY_LABELS.map(d => (
                            <div key={d} style={{ textAlign: 'center', padding: '5px 0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{d}</div>
                          ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                          {calDays.map((day, idx) => renderCalCell(day, idx))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Legend */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '10px', alignItems: 'center' }}>
                {wtCourses.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '10px', height: '10px', flexShrink: 0, display: 'inline-block', backgroundColor: c.color }} />
                    <span style={{ fontFamily: 'monospace', fontSize: '10px', color: MUTED }}>{c.id}</span>
                  </div>
                ))}
                {hbCourses.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '10px', height: '10px', backgroundColor: '#E2DFD9', display: 'inline-block' }} />
                    <span style={{ fontSize: '10px', color: MUTED }}>HB drop-in</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── DAY DETAIL PANEL ────────────────────────────────────── */}
            {selectedDate && (
              <div style={{ marginTop: '24px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span>{fmtDateShort(selectedDate)}</span>
                  <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: MUTED }}>— {dayClasses.length} class{dayClasses.length !== 1 ? 'es' : ''}</span>
                  <button onClick={() => setSelectedDate(null)} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', fontSize: '10px', color: MUTED, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Close ✕</button>
                </div>

                {dayClasses.length === 0 ? (
                  <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', padding: '24px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No classes scheduled.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(dayClasses.length, 2)}, 1fr)`, gap: '12px' }}>
                    {dayClasses.map((classInstance, i) => {
                      const isWT = getClassCategory(classInstance.class_type) !== 'handbuilding';
                      const courseIdx = wtCourses.findIndex(c => c.id === classInstance.baseCourseIdentifier);
                      const color = isWT && courseIdx >= 0 ? wtCourses[courseIdx].color : '#888';
                      const booked = classInstance.bookingCount || 0;
                      const cap    = classInstance.max_capacity || 10;

                      return (
                        <div key={classInstance.id} style={{ border: `1px solid ${RULE}`, borderLeft: `3px solid ${color}`, backgroundColor: '#FFFFFF' }}>
                          {/* Class header */}
                          <div style={{ padding: '14px 14px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, marginBottom: '3px' }}>{classInstance.fullCourseIdentifier || classInstance.baseCourseIdentifier}</div>
                              <div style={{ fontSize: '11px', color: MUTED }}>
                                {classInstance.start_time} – {classInstance.end_time} · {classInstance.instructor}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '3px', color: booked >= cap ? '#D93025' : INK }}>{booked}/{cap}</div>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                <button
                                  onClick={() => { handleOpenAddStudentModal(classInstance.id); }}
                                  style={{ fontSize: '9px', padding: '3px 8px', border: 'none', backgroundColor: TC, color: '#FFF', cursor: 'pointer', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                                >
                                  + Add
                                </button>
                                <button
                                  onClick={() => handleOpenEditClassModal(classInstance)}
                                  style={{ fontSize: '9px', padding: '3px 8px', border: `1px solid ${RULE}`, backgroundColor: '#FFF', color: INK, cursor: 'pointer', fontWeight: 700 }}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteClass(classInstance.id, classInstance.class_type)}
                                  disabled={booked > 0}
                                  style={{ fontSize: '9px', padding: '3px 8px', border: 'none', backgroundColor: booked > 0 ? '#EEE' : '#FDECEA', color: booked > 0 ? '#CCC' : '#D93025', cursor: booked > 0 ? 'not-allowed' : 'pointer', fontWeight: 700 }}
                                >
                                  Del
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Load members button if not loaded */}
                          {!classMembers[classInstance.id] && (
                            <div style={{ padding: '0 14px 12px' }}>
                              <button
                                onClick={() => toggleClassMembers(classInstance)}
                                style={{ fontSize: '10px', color: TC, border: `1px solid rgba(196,98,45,0.3)`, backgroundColor: TC_LIGHT, padding: '5px 10px', cursor: 'pointer', fontWeight: 700 }}
                              >
                                Load students ↓
                              </button>
                            </div>
                          )}

                          {/* Member table */}
                          {classMembers[classInstance.id] && renderDayDetailMemberTable(classInstance)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* ═══ MODALS ═══════════════════════════════════════════════════════════ */}

      {/* ── Add Single Class Modal ─────────────────────────────────────────── */}
      {showAddSingleClass && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#FFFFFF', padding: isMobile ? '24px 20px' : '32px', width: '480px', maxWidth: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>Add Single Class</div>
              <button onClick={() => setShowAddSingleClass(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: MUTED, lineHeight: 1, padding: '0 0 0 16px' }}>✕</button>
            </div>
            <div style={{ fontSize: '12px', color: MUTED, marginBottom: '22px' }}>One-off session — holiday replacement or instructor unavailability</div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div>
                <label style={labelSt}>Date</label>
                <input type="date" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Time Slot</label>
                <select style={selectSt}>
                  <option>AM — 9:30am</option>
                  <option>PM — 1:00pm</option>
                  <option>NT — 7:00pm</option>
                  <option>EV — 4:00pm</option>
                </select>
              </div>
              <div>
                <label style={labelSt}>Class Type</label>
                <select style={selectSt}>
                  <option>WT — Wheel Throwing</option>
                  <option>HB — Handbuilding</option>
                </select>
              </div>
              <div>
                <label style={labelSt}>Instructor</label>
                <select style={selectSt}>
                  <option>JL — Joyce Lim</option>
                  <option>DL — Dillon Lin</option>
                  <option>LT — Lynette Ting</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelSt}>Link to Course</label>
              <select style={selectSt}>
                <option value="">— Standalone (not linked) —</option>
                {courses.map(c => (
                  <option key={c.identifier} value={c.identifier}>{c.identifier}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelSt}>Reason</label>
              <select style={selectSt}>
                <option>Holiday replacement</option>
                <option>Instructor unavailable</option>
                <option>Extra / makeup session</option>
                <option>Other</option>
              </select>
            </div>

            <div style={{ padding: '10px 14px', backgroundColor: '#FFF7E6', border: '1px solid #E6A817', marginBottom: '18px', fontSize: '12px', color: '#7A4E00' }}>
              <span style={{ fontWeight: 700 }}>Note:</span> This adds a single class only — students enrolled in the linked course will not be auto-booked. Notify them separately.
            </div>

            <div style={{ display: 'flex', gap: '8px', flexDirection: isMobile ? 'column' : 'row' }}>
              <button onClick={() => setShowAddSingleClass(false)} style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
              <button style={{ flex: 1, padding: '12px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Add Class</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Course Modal ─────────────────────────────────────────────── */}
      {showCreateClassModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#FFFFFF', width: '540px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ padding: isMobile ? '20px 20px 0' : '28px 32px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>Create New Course</div>
                <div style={{ fontSize: '12px', color: MUTED, marginTop: '3px' }}>Min 4 students required to confirm schedule</div>
              </div>
              <button onClick={() => setShowCreateClassModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: MUTED, lineHeight: 1, padding: '0 0 0 16px' }}>✕</button>
            </div>

            <div style={{ padding: isMobile ? '16px 20px 20px' : '16px 32px 28px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                {/* Class Type */}
                <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
                  <label style={labelSt}>Class Type / Identifier *</label>
                  <input
                    type="text"
                    value={createClassData.classType}
                    onChange={e => setCreateClassData({ ...createClassData, classType: e.target.value })}
                    placeholder="e.g., WT1210AM_DL6"
                    style={{ ...inputSt, fontFamily: 'monospace' }}
                  />
                  <div style={{ fontSize: '10px', color: MUTED, marginTop: '3px' }}>Format: [WT/HB][MMDD][AM/PM/NT]_[INSTRUCTOR][WEEKS]</div>
                </div>

                {/* Instructor */}
                <div>
                  <label style={labelSt}>Instructor *</label>
                  <input
                    type="text"
                    value={createClassData.instructor}
                    onChange={e => setCreateClassData({ ...createClassData, instructor: e.target.value })}
                    placeholder="e.g., Dillon Lin"
                    style={inputSt}
                  />
                </div>

                {/* Room / Type */}
                <div>
                  <label style={labelSt}>Type *</label>
                  <input
                    type="text"
                    value={createClassData.room}
                    onChange={e => setCreateClassData({ ...createClassData, room: e.target.value })}
                    placeholder="e.g., Wheelthrowing, Handbuilding"
                    style={inputSt}
                  />
                </div>
              </div>

              {/* Number of classes */}
              <div style={{ marginBottom: '14px' }}>
                <label style={labelSt}>Number of Classes *</label>
                <input
                  type="number" min="1" max="12"
                  value={createClassData.numberOfClasses}
                  onChange={e => handleNumberOfClassesChange(e.target.value)}
                  style={{ ...inputSt, width: '100px' }}
                />
              </div>

              {/* Class dates */}
              <div style={{ marginBottom: '14px' }}>
                <label style={labelSt}>Class Dates *</label>
                <div style={{ border: `1px solid ${RULE}`, backgroundColor: ALT, padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                  {createClassData.classDates.map((date, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#FFF', padding: '6px 10px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: MUTED, width: '52px', flexShrink: 0 }}>Week {index + 1}</span>
                      <input
                        type="date"
                        value={date}
                        onChange={e => handleClassDateChange(index, e.target.value)}
                        style={{ ...inputSt, flex: 1, padding: '5px 8px' }}
                      />
                      {date && <span style={{ color: TC, fontSize: '12px' }}>✓</span>}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: '10px', color: MUTED, marginTop: '4px' }}>
                  {createClassData.classDates.filter(d => d).length} of {createClassData.numberOfClasses} dates selected
                </div>
              </div>

              {/* Start / End time */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={labelSt}>Start Time *</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <select value={createClassData.startTimeHour} onChange={e => setCreateClassData({ ...createClassData, startTimeHour: e.target.value })} style={{ ...selectSt, flex: 1, padding: '7px 6px' }}>
                      <option value="">H</option>
                      {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                    </select>
                    <select value={createClassData.startTimeMinute} onChange={e => setCreateClassData({ ...createClassData, startTimeMinute: e.target.value })} style={{ ...selectSt, flex: 1, padding: '7px 6px' }}>
                      <option value="">M</option>
                      <option value="00">00</option><option value="15">15</option><option value="30">30</option><option value="45">45</option>
                    </select>
                    <select value={createClassData.startTimePeriod} onChange={e => setCreateClassData({ ...createClassData, startTimePeriod: e.target.value })} style={{ ...selectSt, width: '52px', padding: '7px 4px' }}>
                      <option value="AM">AM</option><option value="PM">PM</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={labelSt}>End Time *</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <select value={createClassData.endTimeHour} onChange={e => setCreateClassData({ ...createClassData, endTimeHour: e.target.value })} style={{ ...selectSt, flex: 1, padding: '7px 6px' }}>
                      <option value="">H</option>
                      {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                    </select>
                    <select value={createClassData.endTimeMinute} onChange={e => setCreateClassData({ ...createClassData, endTimeMinute: e.target.value })} style={{ ...selectSt, flex: 1, padding: '7px 6px' }}>
                      <option value="">M</option>
                      <option value="00">00</option><option value="15">15</option><option value="30">30</option><option value="45">45</option>
                    </select>
                    <select value={createClassData.endTimePeriod} onChange={e => setCreateClassData({ ...createClassData, endTimePeriod: e.target.value })} style={{ ...selectSt, width: '52px', padding: '7px 4px' }}>
                      <option value="AM">AM</option><option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Capacity fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                <div>
                  <label style={labelSt}>Teaching Cap</label>
                  <input type="number" min="1" max="50" value={createClassData.teachingCapacity} onChange={e => setCreateClassData({ ...createClassData, teachingCapacity: parseInt(e.target.value) || 10 })} style={inputSt} />
                  <div style={{ fontSize: '9px', color: MUTED, marginTop: '2px' }}>typically 8–10</div>
                </div>
                <div>
                  <label style={labelSt}>Makeup Cap</label>
                  <input type="number" min="0" max="20" value={createClassData.makeUpCapacity} onChange={e => setCreateClassData({ ...createClassData, makeUpCapacity: parseInt(e.target.value) || 2 })} style={inputSt} />
                  <div style={{ fontSize: '9px', color: MUTED, marginTop: '2px' }}>typically 2</div>
                </div>
                <div>
                  <label style={labelSt}>Glazing Cap</label>
                  <input type="number" min="1" max="50" value={createClassData.glazingCapacity} onChange={e => setCreateClassData({ ...createClassData, glazingCapacity: parseInt(e.target.value) || 14 })} style={inputSt} />
                  <div style={{ fontSize: '9px', color: MUTED, marginTop: '2px' }}>typically 14</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexDirection: isMobile ? 'column' : 'row' }}>
                <button onClick={() => setShowCreateClassModal(false)} disabled={creatingClass} style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', opacity: creatingClass ? 0.5 : 1 }}>Cancel</button>
                <button onClick={handleCreateClass} disabled={creatingClass} style={{ flex: 1, padding: '12px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: creatingClass ? 'not-allowed' : 'pointer', opacity: creatingClass ? 0.7 : 1 }}>
                  {creatingClass ? 'Creating...' : 'Create Course'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Class Modal ────────────────────────────────────────────────── */}
      {showEditClassModal && editingClass && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#FFFFFF', padding: isMobile ? '24px 20px' : '32px', width: '480px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>Edit Class</div>
                <div style={{ fontFamily: 'monospace', fontSize: '11px', color: MUTED, marginTop: '3px' }}>{editingClass.fullCourseIdentifier}</div>
              </div>
              <button onClick={() => setShowEditClassModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: MUTED, lineHeight: 1, padding: '0 0 0 16px' }}>✕</button>
            </div>

            <div style={{ padding: '10px 14px', backgroundColor: '#FFF7E6', border: '1px solid #E6A817', marginBottom: '18px', marginTop: '12px', fontSize: '12px', color: '#7A4E00' }}>
              <span style={{ fontWeight: 700 }}>Note:</span> Changing date/time will NOT update the class identifier. This may cause mismatches.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={labelSt}>Class Date *</label>
                <input type="date" value={editClassData.classDate} onChange={e => setEditClassData({ ...editClassData, classDate: e.target.value })} style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Start Time *</label>
                <input type="text" value={editClassData.startTime} onChange={e => setEditClassData({ ...editClassData, startTime: e.target.value })} placeholder="e.g., 9:30 AM" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>End Time *</label>
                <input type="text" value={editClassData.endTime} onChange={e => setEditClassData({ ...editClassData, endTime: e.target.value })} placeholder="e.g., 12:00 PM" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Instructor *</label>
                <input type="text" value={editClassData.instructor} onChange={e => setEditClassData({ ...editClassData, instructor: e.target.value })} placeholder="e.g., Dillon Lin" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Max Capacity *</label>
                <input type="number" min="1" max="50" value={editClassData.maxCapacity} onChange={e => setEditClassData({ ...editClassData, maxCapacity: parseInt(e.target.value) || 12 })} style={inputSt} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexDirection: isMobile ? 'column' : 'row' }}>
              <button onClick={() => setShowEditClassModal(false)} disabled={updatingClass} style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', opacity: updatingClass ? 0.5 : 1 }}>Cancel</button>
              <button onClick={handleUpdateClass} disabled={updatingClass} style={{ flex: 1, padding: '12px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: updatingClass ? 'not-allowed' : 'pointer', opacity: updatingClass ? 0.7 : 1 }}>
                {updatingClass ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reschedule Modal ────────────────────────────────────────────────── */}
      {showRescheduleModal && reschedulingBooking && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#FFFFFF', width: '560px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ padding: '24px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>Reschedule Class</div>
                <div style={{ fontSize: '12px', color: MUTED, marginTop: '3px' }}>{reschedulingBooking.studentName} · {reschedulingBooking.classInstance.class_type}</div>
              </div>
              <button onClick={() => setShowRescheduleModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: MUTED, lineHeight: 1, padding: '0 0 0 16px' }}>✕</button>
            </div>

            <div style={{ padding: '0 28px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Current class info */}
              <div style={{ padding: '10px 14px', backgroundColor: TC_LIGHT, border: `1px solid rgba(196,98,45,0.25)`, fontSize: '12px' }}>
                <div style={{ fontWeight: 700, color: TC_DARK, marginBottom: '3px' }}>Current Class</div>
                <div style={{ color: INK }}>{formatDate(reschedulingBooking.classInstance.class_date)} · {reschedulingBooking.classInstance.start_time} – {reschedulingBooking.classInstance.end_time}</div>
                <div style={{ fontFamily: 'monospace', fontSize: '11px', color: MUTED, marginTop: '2px' }}>{reschedulingBooking.classInstance.fullCourseIdentifier}</div>
              </div>

              {/* Fee note */}
              <div style={{ padding: '10px 14px', backgroundColor: '#FFF7E6', border: '1px solid #E6A817', fontSize: '12px', color: '#7A4E00' }}>
                <span style={{ fontWeight: 700 }}>Fee policy:</span> FREE within cohort period (Jan 17 – Mar 3, 2026). $40 outside this period.
              </div>

              {/* Select new class */}
              <div>
                <label style={labelSt}>Select New Class *</label>
                {availableClasses.length === 0 ? (
                  <div style={{ padding: '16px', border: `1px solid ${RULE}`, textAlign: 'center', color: MUTED, fontSize: '12px' }}>No available classes found</div>
                ) : (
                  <div style={{ maxHeight: '240px', overflowY: 'auto', border: `1px solid ${RULE}` }}>
                    {availableClasses.map(cls => {
                      const cohortStart = '2026-01-17', cohortEnd = '2026-03-03';
                      const origDate = reschedulingBooking.classInstance.class_date.split('T')[0];
                      const newDate  = cls.class_date.split('T')[0];
                      const isSame   = origDate >= cohortStart && origDate <= cohortEnd && newDate >= cohortStart && newDate <= cohortEnd;
                      const hasFee   = !rescheduleData.isGlazing && !isSame;
                      const isSel    = rescheduleData.newClassInstanceId === cls.id;
                      return (
                        <button
                          key={cls.id}
                          onClick={() => setRescheduleData({ ...rescheduleData, newClassInstanceId: cls.id })}
                          style={{
                            width: '100%', textAlign: 'left', padding: '10px 14px', borderBottom: `1px solid ${RULE}`,
                            backgroundColor: isSel ? TC_LIGHT : '#FFFFFF',
                            borderLeft: isSel ? `3px solid ${TC}` : '3px solid transparent',
                            cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', border: 'none', borderBottom: `1px solid ${RULE}`,
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 700 }}>{formatDate(cls.class_date)}</div>
                            <div style={{ fontSize: '11px', color: MUTED }}>{cls.start_time} – {cls.end_time} · {cls.class_type}</div>
                            <div style={{ fontFamily: 'monospace', fontSize: '10px', color: MUTED }}>{cls.fullCourseIdentifier}</div>
                            <div style={{ fontSize: '10px', color: MUTED }}>{cls.bookingCount}/{cls.max_capacity} enrolled</div>
                          </div>
                          <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', backgroundColor: hasFee ? '#FFF7E6' : TC_LIGHT, color: hasFee ? '#9E6200' : TC_DARK, flexShrink: 0 }}>
                            {hasFee ? '$40 fee' : 'Free'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Reason */}
              <div>
                <label style={labelSt}>Reason (optional)</label>
                <textarea
                  value={rescheduleData.reason}
                  onChange={e => setRescheduleData({ ...rescheduleData, reason: e.target.value })}
                  rows={3}
                  placeholder="Optional note..."
                  style={{ ...inputSt, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowRescheduleModal(false)} disabled={rescheduling} style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', opacity: rescheduling ? 0.5 : 1 }}>Cancel</button>
                <button onClick={handleReschedule} disabled={rescheduling || !rescheduleData.newClassInstanceId} style={{ flex: 1, padding: '12px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: (rescheduling || !rescheduleData.newClassInstanceId) ? 'not-allowed' : 'pointer', opacity: (rescheduling || !rescheduleData.newClassInstanceId) ? 0.6 : 1 }}>
                  {rescheduling ? 'Rescheduling...' : 'Confirm Reschedule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Student Modal ───────────────────────────────────────────────── */}
      {showAddStudentModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#FFFFFF', width: '520px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ padding: '24px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>Add Student to Class</div>
                <div style={{ fontSize: '12px', color: MUTED, marginTop: '3px' }}>Search for a student to add</div>
              </div>
              <button onClick={() => setShowAddStudentModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: MUTED, lineHeight: 1, padding: '0 0 0 16px' }}>✕</button>
            </div>

            <div style={{ padding: '0 28px 24px' }}>
              {/* Search */}
              <div style={{ marginBottom: '14px' }}>
                <label style={labelSt}>Search Student</label>
                <input
                  type="text"
                  value={studentSearchQuery}
                  onChange={e => setStudentSearchQuery(e.target.value)}
                  placeholder="Name or email..."
                  style={inputSt}
                />
              </div>

              {/* List */}
              <div>
                <label style={labelSt}>Select Student</label>
                {loadingStudents ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '12px' }}>Loading students...</div>
                ) : getFilteredStudents().length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '12px' }}>
                    {studentSearchQuery ? 'No students found' : 'No students available'}
                  </div>
                ) : (
                  <div style={{ maxHeight: '320px', overflowY: 'auto', border: `1px solid ${RULE}` }}>
                    {getFilteredStudents().map(student => (
                      <button
                        key={student.dbId}
                        onClick={() => handleAddStudent(student.dbId)}
                        disabled={addingStudent}
                        style={{
                          width: '100%', textAlign: 'left', padding: '10px 14px', borderBottom: `1px solid ${RULE}`,
                          backgroundColor: '#FFFFFF', border: 'none', borderBottom: `1px solid ${RULE}`,
                          cursor: addingStudent ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
                          opacity: addingStudent ? 0.6 : 1,
                        }}
                        onMouseEnter={e => { if (!addingStudent) e.currentTarget.style.backgroundColor = TC_LIGHT; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#FFFFFF'; }}
                      >
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 700 }}>{student.firstName} {student.lastName}</div>
                          <div style={{ fontSize: '11px', color: MUTED }}>{student.email}</div>
                        </div>
                        <span style={{ fontSize: '18px', color: TC }}>+</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowAddStudentModal(false)} disabled={addingStudent} style={{ padding: '10px 20px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', opacity: addingStudent ? 0.5 : 1 }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
