import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import StudentInfoCard from '../components/StudentInfoCard';
import StudentBookingsTab from '../components/StudentBookingsTab';
import StudentFeesTab from '../components/StudentFeesTab';
import StudentRescheduleModal from '../components/StudentRescheduleModal';
import StudentCreditsTab from '../components/StudentCreditsTab';

// ─── Design tokens ───────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

// ─── Month names for CalendarWidget ──────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ─── Shared style objects ─────────────────────────────────────────────────────
const BOOKING_STYLE = {
  booked:    { bg: TC_LIGHT,  text: TC_DARK    },
  attended:  { bg: ALT,       text: MUTED      },
  completed: { bg: ALT,       text: MUTED      },
  missed:    { bg: '#FFF0F0', text: '#C03030'  },
  cancelled: { bg: ALT,       text: MUTED      },
  unbooked:  { bg: '#FFFBEA', text: '#9E6200'  },
};

const FEE_STYLE = {
  paid:    { bg: TC_LIGHT,  text: TC_DARK  },
  pending: { bg: '#FFF7E6', text: '#9E6200' },
  waived:  { bg: ALT,       text: MUTED    },
};

// ─── useIsMobile hook ─────────────────────────────────────────────────────────
function useIsMobile(bp = 768) {
  const [mobile, setMobile] = useState(() => window.innerWidth < bp);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < bp);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [bp]);
  return mobile;
}

// ─── CalendarWidget ───────────────────────────────────────────────────────────
// Self-contained calendar; receives availSet (Set of 'YYYY-MM-DD' strings) from parent
function CalendarWidget({ month, onMonthChange, selectedDate, onDateSelect, availSet }) {
  const year     = month.getFullYear();
  const mon      = month.getMonth();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const startDow = (new Date(year, mon, 1).getDay() + 6) % 7; // Mon = 0

  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return (
    <div style={{ border: `1px solid ${RULE}`, backgroundColor: ALT, padding: '16px', userSelect: 'none' }}>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <button
          onClick={() => onMonthChange(new Date(year, mon - 1))}
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: MUTED, padding: '4px 8px' }}
        >‹</button>
        <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {MONTH_NAMES[mon]} {year}
        </span>
        <button
          onClick={() => onMonthChange(new Date(year, mon + 1))}
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: MUTED, padding: '4px 8px' }}
        >›</button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700, color: MUTED, padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {Array.from({ length: startDow }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day     = i + 1;
          const date    = new Date(year, mon, day);
          const dateStr = fmt(date);
          const hasClass  = availSet ? availSet.has(dateStr) : false;
          const isSelected = selectedDate && fmt(selectedDate) === dateStr;
          return (
            <button
              key={day}
              onClick={() => hasClass && onDateSelect(date)}
              style={{
                height: '36px', width: '100%', border: 'none',
                cursor: hasClass ? 'pointer' : 'default',
                fontSize: '12px', fontWeight: hasClass ? 700 : 400,
                backgroundColor: isSelected ? TC : hasClass ? TC_LIGHT : 'transparent',
                color: isSelected ? '#FFF' : hasClass ? TC_DARK : MUTED,
                position: 'relative',
              }}
            >
              {day}
              {hasClass && !isSelected && (
                <span style={{
                  position: 'absolute', bottom: '4px', left: '50%', transform: 'translateX(-50%)',
                  width: '4px', height: '4px', borderRadius: '50%', backgroundColor: TC,
                }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminStudentDetail() {
  const navigate = useNavigate();
  const { email } = useParams();
  const location = useLocation();
  const cameFromMemberships = location.state?.from === 'memberships' || document.referrer.includes('/admin/memberships');
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();

  console.log('AdminStudentDetail component loaded, email param:', email);

  // ── Data state ───────────────────────────────────────────────────────────
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [student, setStudent]         = useState(null);
  const [enrollment, setEnrollment]   = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [bookings, setBookings]       = useState([]);
  const [studentWaitlist, setStudentWaitlist] = useState([]);
  const [fees, setFees]               = useState([]);
  const [flexCredits, setFlexCredits] = useState(null);
  const [instructorNotes, setInstructorNotes] = useState([]);
  const [updatingFeeId, setUpdatingFeeId] = useState(null);

  // ── Edit form ────────────────────────────────────────────────────────────
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    customerType: 'student',
    role: 'student',
    coursePurchaseCount: 0,
    classesAllocated: 0,
  });
  const [isEditing, setIsEditing]     = useState(false);
  const [saveMessage, setSaveMessage] = useState(null); // { type: 'ok'|'err', text }

  // ── Pause / Resume ───────────────────────────────────────────────────────
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pausing, setPausing]   = useState(false);
  const [resuming, setResuming] = useState(false);
  const [pauseForm, setPauseForm] = useState({ weeksCompleted: 0, reason: '' });

  // ── Bookings table ────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter]         = useState('all');
  const [deleteConfirmId, setDeleteConfirmId]   = useState(null);
  const [deletingBookingId, setDeletingBookingId] = useState(null);

  // ── Reschedule / Makeup modal ────────────────────────────────────────────
  const [showMakeupModal, setShowMakeupModal]               = useState(false);
  const [selectedBookingForMakeup, setSelectedBookingForMakeup] = useState(null);
  const [allClasses, setAllClasses]                         = useState([]);
  const [makeupSelectedDate, setMakeupSelectedDate]         = useState(new Date());
  const [makeupCurrentMonth, setMakeupCurrentMonth]         = useState(new Date());
  const [rescheduling, setRescheduling]                     = useState(false);
  const [reschedulingClassId, setReschedulingClassId]       = useState(null);
  const [rescheduleConfirmId, setRescheduleConfirmId]       = useState(null);

  // ── Fees table ────────────────────────────────────────────────────────────
  const [feeDeleteConfirmId, setFeeDeleteConfirmId] = useState(null);
  const [deletingFeeId, setDeletingFeeId]           = useState(null);

  // ── Teaching data (instructors) ──────────────────────────────────────────
  const [teachingData, setTeachingData] = useState(null);
  const [expandedClassId, setExpandedClassId] = useState(null);

  // ── Continue Package ─────────────────────────────────────────────────────
  const [nextCourse, setNextCourse] = useState(null);
  const [continuingPackage, setContinuingPackage] = useState(false);

  // ── Move / Switch Course ────────────────────────────────────────────────
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movingCourse, setMovingCourse] = useState(false);
  const [availableCourses, setAvailableCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [moveTarget, setMoveTarget] = useState(null);
  const [moveType, setMoveType] = useState('same'); // 'same' or 'switch'

  // ── Studio Access ────────────────────────────────────────────────────────
  const [studioBookings, setStudioBookings] = useState([]);
  const [studioSummary, setStudioSummary] = useState(null);

  // ── Credits ───────────────────────────────────────────────────────────────
  const [creditBalance, setCreditBalance] = useState(0);
  const [creditHistory, setCreditHistory] = useState([]);

  // ── UI tabs ───────────────────────────────────────────────────────────────
  const [section, setSection] = useState('enrollment');

  // ── Profile picture ───────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const resetMakeupModalState = () => {
    setShowMakeupModal(false);
    setSelectedBookingForMakeup(null);
    setMakeupSelectedDate(new Date());
    setMakeupCurrentMonth(new Date());
    setRescheduling(false);
    setReschedulingClassId(null);
    setRescheduleConfirmId(null);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const parseCourseName = (courseIdentifier, classType) => {
    if (courseIdentifier && courseIdentifier !== 'N/A') {
      const typeMatch  = courseIdentifier.match(/^(WT|HB|CL)/);
      const weeksMatch = courseIdentifier.match(/(\d+)\.\d+$/);
      if (typeMatch) {
        const type  = typeMatch[1] === 'WT' ? 'Wheelthrowing' : typeMatch[1] === 'HB' ? 'Handbuilding' : 'Class';
        const weeks = weeksMatch ? `${weeksMatch[1]} Weeks` : '';
        return weeks ? `${type} ${weeks}` : type;
      }
    }
    if (classType) {
      if (classType.toLowerCase().includes('wheelthrowing')) return 'Wheelthrowing 6 Weeks';
      if (classType.toLowerCase().includes('handbuilding'))  return 'Handbuilding';
      return classType;
    }
    return 'N/A';
  };

  const getClassCategory = (classType) => {
    if (!classType) return 'other';
    const upper = classType.toUpperCase();
    if (upper.startsWith('WT')) return 'wheelthrowing-beginner';
    if (upper.startsWith('HB')) return 'handbuilding';
    if (upper.startsWith('KD')) return 'kids';
    const lower = classType.toLowerCase();
    if (lower.includes('wheelthrowing') && lower.includes('intermediate')) return 'wheelthrowing-intermediate';
    if (lower.includes('wheelthrowing')) return 'wheelthrowing-beginner';
    if (lower.includes('handbuilding'))  return 'handbuilding';
    if (lower.includes('kids') || lower.includes('children')) return 'kids';
    return 'other';
  };

  const getTypeLabel = (classType) => {
    if (!classType) return '??';
    const upper = classType.toUpperCase();
    if (upper.startsWith('WT')) return 'WT';
    if (upper.startsWith('HB')) return 'HB';
    if (upper.startsWith('KD')) return 'KD';
    return classType.substring(0, 2).toUpperCase();
  };

  const getAvailableMakeupClasses = () => {
    if (!selectedBookingForMakeup) return [];
    const isUnbooked = selectedBookingForMakeup.isPlaceholder;
    const flatClasses = [];
    allClasses.forEach(course => {
      course.classes?.forEach(cls => {
        flatClasses.push({
          id: cls.id,
          classDate: cls.class_date,
          classType: cls.class_type,
          startTime: cls.start_time,
          endTime: cls.end_time,
          instructor: cls.instructor,
          room: cls.room,
          maxCapacity: cls.max_capacity,
          currentEnrollment: cls.bookingCount || 0,
        });
      });
    });
    if (isUnbooked) {
      return flatClasses.filter(c => c.currentEnrollment < 10);
    }
    return flatClasses.filter(c => c.id !== selectedBookingForMakeup.class_instance_id && c.currentEnrollment < 10);
  };

  const getMakeupClassesForDate = (date) => {
    const year  = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day   = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    return getAvailableMakeupClasses().filter(c => c.classDate?.startsWith(dateStr));
  };

  // Build the set of available dates for the CalendarWidget
  const getAvailSet = () => {
    const classes = getAvailableMakeupClasses();
    const set = new Set();
    classes.forEach(c => {
      if (c.classDate) set.add(c.classDate.split('T')[0]);
    });
    return set;
  };

  // ─── Data fetching ────────────────────────────────────────────────────────
  const loadStudentData = async () => {
    try {
      setLoading(true);
      const decodedEmail = decodeURIComponent(email);
      console.log('Loading student data for:', decodedEmail);

      const { data: studentData } = await api.get(`/admin/students/${decodedEmail}`);
      console.log('Student data received:', studentData);
      setStudent(studentData);
      setEditForm({
        firstName:          studentData.first_name         || '',
        lastName:           studentData.last_name          || '',
        email:              studentData.email              || '',
        customerType:       studentData.customer_type      || 'student',
        role:               studentData.role               || 'student',
        coursePurchaseCount: studentData.course_purchase_count || 0,
        classesAllocated:   studentData.classes_allocated  || 0,
      });

      // Fetch bookings and student-id-dependent data in parallel
      const parallelCalls = [
        api.get(`/admin/students/${decodedEmail}/bookings`),
      ];

      if (studentData.id) {
        parallelCalls.push(
          api.get(`/admin/students/${studentData.id}/enrollment`).catch(() => null),
          api.get(`/admin/students/${studentData.id}/fees`),
          api.get(`/admin/students/${studentData.id}/studio-access`).catch(() => null),
          studentData.role === 'instructor'
            ? api.get(`/admin/instructors/${studentData.id}/teaching`).catch(() => null)
            : Promise.resolve(null),
        );
        api.get(`/admin/students/${studentData.id}/waitlist`).then(r => setStudentWaitlist(r.data.waitlistEntries || [])).catch(() => {});
        api.get(`/credits/balance/${studentData.id}`).then(r => setCreditBalance(r.data.balance || 0)).catch(() => {});
        api.get(`/credits/history/${studentData.id}`).then(r => setCreditHistory(r.data.history || [])).catch(() => {});
        // Check for 10-class package flex credits across all enrollments
        api.get(`/admin/students/${studentData.id}/flex-credits`).then(r => setFlexCredits(r.data)).catch(() => {});
        api.get(`/admin/students/${studentData.id}/notes`).then(r => setInstructorNotes(r.data.notes || [])).catch(() => {});
      }

      const results = await Promise.all(parallelCalls);

      const bookingsData = results[0].data;
      console.log('Bookings data received:', bookingsData);
      setBookings(bookingsData.bookings || []);

      if (studentData.id) {
        const enrollmentResult = results[1];
        const enrollmentData = enrollmentResult ? enrollmentResult.data : null;
        setEnrollment(enrollmentData);
        setEnrollments(enrollmentData?.all_enrollments || (enrollmentData ? [enrollmentData] : []));

        // Check for next package course if student has remaining courses
        if (enrollmentData?.package_total_courses > 1 && enrollmentData?.package_courses_remaining > 0) {
          api.get(`/admin/students/${studentData.id}/next-package-course?enrollmentId=${enrollmentData.id}`)
            .then(res => setNextCourse(res.data))
            .catch(() => setNextCourse(null));
        } else {
          setNextCourse(null);
        }

        const feesData = results[2].data;
        setFees(feesData.fees || []);

        const studioResult = results[3];
        if (studioResult) {
          setStudioBookings(studioResult.data.bookings || []);
          setStudioSummary(studioResult.data.summary || null);
        } else {
          setStudioBookings([]);
          setStudioSummary(null);
        }

        const teachingResult = results[4];
        if (studentData.role === 'instructor' && teachingResult) {
          setTeachingData(teachingResult.data);
          setSection('teaching');
        } else if (studentData.role === 'instructor') {
          setTeachingData(null);
        }
      }
    } catch (error) {
      console.error('Failed to load student data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudentData();
  }, [email]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const saveChanges = async () => {
    try {
      setSaving(true);
      setSaveMessage(null);
      const decodedEmail = decodeURIComponent(email);
      await api.put(`/admin/students/${decodedEmail}`, {
        first_name:            editForm.firstName.trim(),
        last_name:             editForm.lastName.trim(),
        email:                 editForm.email.trim(),
        customer_type:         editForm.customerType,
        course_purchase_count: parseInt(editForm.coursePurchaseCount),
        classes_allocated:     parseInt(editForm.classesAllocated),
      });
      // Update community role separately
      if (student?.id) {
        await api.put(`/admin/customers/${student.id}/role`, { role: editForm.role });
      }
      setSaveMessage({ type: 'ok', text: 'Saved' });
      setIsEditing(false);
      setTimeout(() => setSaveMessage(null), 3000);
      if (editForm.email.trim() !== decodedEmail) {
        navigate(`/admin/students/${encodeURIComponent(editForm.email.trim())}`);
      } else {
        await loadStudentData();
      }
    } catch (error) {
      console.error('Failed to update student:', error);
      setSaveMessage({ type: 'err', text: 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const updateFeeStatus = async (feeId, newStatus) => {
    try {
      setUpdatingFeeId(feeId);
      await api.patch(`/admin/fees/${feeId}/payment`, { paymentStatus: newStatus });
      alert(`Fee marked as ${newStatus}!`);
      await loadStudentData();
    } catch (error) {
      console.error('Failed to update fee:', error);
      alert('Failed to update fee');
    } finally {
      setUpdatingFeeId(null);
    }
  };

  const handleDeleteFee = async (feeId) => {
    try {
      setDeletingFeeId(feeId);
      await api.delete(`/admin/fees/${feeId}`);
      alert('Fee deleted successfully!');
      setFeeDeleteConfirmId(null);
      await loadStudentData();
    } catch (error) {
      console.error('Failed to delete fee:', error);
      alert('Failed to delete fee');
    } finally {
      setDeletingFeeId(null);
    }
  };

  const handleDeleteBooking = async (bookingId) => {
    try {
      setDeletingBookingId(bookingId);
      await api.delete(`/admin/bookings/${bookingId}`);
      alert('Booking deleted successfully!');
      setDeleteConfirmId(null);
      await loadStudentData();
    } catch (error) {
      console.error('Failed to delete booking:', error);
      alert('Failed to delete booking');
    } finally {
      setDeletingBookingId(null);
    }
  };

  const handleToggleAttended = async (bookingId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'attended' ? 'booked' : 'attended';
      await api.put(`/admin/bookings/${bookingId}/attended`, { status: newStatus });
      await loadStudentData();
    } catch (error) {
      console.error('Failed to toggle attended:', error);
      alert('Failed to update attended status');
    }
  };

  const handleOpenMakeupModal = async (booking) => {
    console.log('Opening reschedule modal for booking:', booking);
    setRescheduling(false);
    setReschedulingClassId(null);
    setRescheduleConfirmId(null);
    setSelectedBookingForMakeup(booking);
    setShowMakeupModal(true);

    try {
      const { data } = await api.get('/admin/classes');
      console.log('Loaded classes for reschedule:', data.courses?.length, 'courses');
      const loadedCourses = data.courses || [];
      setAllClasses(loadedCourses);

      const isUnbookedCredit = booking.isPlaceholder;
      const flatClasses = [];
      loadedCourses.forEach(course => {
        course.classes?.forEach(cls => {
          flatClasses.push({
            id: cls.id,
            classDate: cls.class_date,
            classType: cls.class_type,
            currentEnrollment: cls.bookingCount || 0,
          });
        });
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const futureClasses = flatClasses.filter(c => new Date(c.classDate) >= today);

      let availableClasses;
      if (isUnbookedCredit) {
        availableClasses = futureClasses.filter(c => c.currentEnrollment < 10);
      } else {
        availableClasses = futureClasses.filter(c => {
          return c.id !== booking.class_instance_id && c.currentEnrollment < 10;
        });
      }

      if (availableClasses.length > 0) {
        const uniqueDates = [...new Set(availableClasses.map(c => c.classDate.split('T')[0]))];
        const firstDateStr = uniqueDates.sort()[0];
        const firstDate = new Date(firstDateStr + 'T12:00:00');
        setMakeupSelectedDate(firstDate);
        setMakeupCurrentMonth(new Date(firstDate.getFullYear(), firstDate.getMonth(), 1));
      } else {
        setMakeupSelectedDate(today);
        setMakeupCurrentMonth(today);
      }
    } catch (error) {
      console.error('Failed to load classes:', error);
      alert('Failed to load classes');
    }
  };

  const handleRescheduleToMakeup = async (newClassId) => {
    if (!selectedBookingForMakeup || rescheduling) return;
    const isUnbookedCredit = selectedBookingForMakeup.isPlaceholder;
    try {
      setRescheduling(true);
      setReschedulingClassId(newClassId);
      if (isUnbookedCredit) {
        await api.post('/admin/bookings', {
          studentId:       student.id,
          classInstanceId: newClassId,
          bookingType:     'regular',
          status:          'booked',
          courseEnrollmentId: enrollment?.id,
        });
        alert('Student booked successfully!');
      } else {
        // Use the atomic reschedule endpoint — updates the same booking row
        // in place, preserving the enrollment link and credit accounting.
        // Previously this was DELETE+POST, which created orphan bookings
        // and double-spent flex credits on 10-class packages.
        await api.post(`/admin/bookings/${selectedBookingForMakeup.id}/reschedule`, {
          newClassInstanceId: newClassId,
        });
        alert('Student rescheduled successfully!');
      }
      resetMakeupModalState();
      await loadStudentData();
    } catch (error) {
      console.error('Failed to book/reschedule class:', error);
      alert(`Failed to book/reschedule class: ${error.response?.data?.error || error.message}`);
    } finally {
      setRescheduling(false);
      setReschedulingClassId(null);
    }
  };

  const handleConvertToCredit = async (bookingId) => {
    // Support both direct bookingId (from bookings tab) and selectedBookingForMakeup (from modal)
    const targetId = bookingId || (selectedBookingForMakeup && !selectedBookingForMakeup.isPlaceholder ? selectedBookingForMakeup.id : null);
    if (!targetId) return;
    if (!confirm('Convert this booking to a class credit? The booking will be cancelled and 1 credit restored.')) return;
    try {
      setDeletingBookingId(targetId);
      const { data } = await api.post(`/admin/bookings/${targetId}/convert-to-credit`);
      alert(data.message || 'Converted to credit');
      resetMakeupModalState();
      await loadStudentData();
    } catch (error) {
      console.error('Failed to convert to credit:', error);
      alert(error.response?.data?.error || 'Failed to convert to credit');
    } finally {
      setDeletingBookingId(null);
    }
  };

  const handleContinuePackage = async () => {
    if (!nextCourse?.available || !enrollment?.id || !student?.id) return;
    setContinuingPackage(true);
    try {
      await api.post(`/admin/students/${student.id}/continue-package`, {
        currentEnrollmentId: enrollment.id,
      });
      setSaveMessage({ type: 'ok', text: `Enrolled in next course: ${nextCourse.nextCourse?.identifier || ''}` });
      await loadStudentData();
    } catch (err) {
      setSaveMessage({ type: 'err', text: err.response?.data?.error || 'Failed to continue package' });
    } finally {
      setContinuingPackage(false);
    }
  };

  const handlePauseCourse = async () => {
    if (!enrollment) return;
    const weeksCompleted = parseInt(pauseForm.weeksCompleted);
    const totalWeeks = enrollment.number_of_weeks || 6;
    if (isNaN(weeksCompleted) || weeksCompleted < 0 || weeksCompleted >= totalWeeks) {
      alert(`Weeks completed must be between 0 and ${totalWeeks - 1}`);
      return;
    }
    try {
      setPausing(true);
      await api.post(`/admin/enrollments/${enrollment.id}/pause`, {
        weeksCompleted,
        weeksRemaining: totalWeeks - weeksCompleted,
        reason: pauseForm.reason,
      });
      alert('Course paused successfully!');
      setShowPauseModal(false);
      setPauseForm({ weeksCompleted: 0, reason: '' });
      await loadStudentData();
    } catch (error) {
      console.error('Failed to pause course:', error);
      alert('Failed to pause course');
    } finally {
      setPausing(false);
    }
  };

  const handleCompleteCourse = async () => {
    if (!enrollment) return;
    const studentName = `${student?.first_name || ''} ${student?.last_name || ''}`.trim();
    const courseInfo = enrollment.course_type || enrollment.course_title || 'this course';
    if (!confirm(`⚠️ CONFIRM COMPLETION\n\nStudent: ${studentName}\nCourse: ${courseInfo}\n\nThis will:\n• Mark all past bookings as attended\n• Set enrollment status to completed\n• Update credits used\n\nAre you sure?`)) return;
    try {
      await api.post(`/admin/enrollments/${enrollment.id}/complete`);
      alert('Course marked as completed successfully.');
      await loadStudentData();
    } catch (error) {
      console.error('Failed to complete course:', error);
      alert('Failed to complete course');
    }
  };

  const handleResumeCourse = async () => {
    if (!enrollment || enrollment.status !== 'paused') return;
    if (!confirm(`Are you sure you want to resume this student's course?\n\nThey will need to book ${enrollment.weeks_remaining} more classes to complete their course.`)) return;
    try {
      setResuming(true);
      await api.post(`/admin/students/${student.id}/resume`);
      alert('Course resumed successfully! Student can now book their remaining classes.');
      await loadStudentData();
    } catch (error) {
      console.error('Failed to resume course:', error);
      alert('Failed to resume course');
    } finally {
      setResuming(false);
    }
  };

  const handleOpenMoveModal = async () => {
    setShowMoveModal(true);
    setMoveType('same');
    setMoveTarget(null);
    setLoadingCourses(true);
    try {
      const isWT = (enrollment.course_type || '').toLowerCase().includes('wheelthrowing');
      const type = isWT ? 'WT' : 'HB';
      const baseId = enrollment.course_identifier?.replace(/\.\d+$/, '') || '';
      const res = await api.get(`/admin/available-courses?type=${type}&excludeCourse=${baseId}`);
      setAvailableCourses(res.data.courses || []);
    } catch (err) {
      console.error('Failed to load courses:', err);
    } finally {
      setLoadingCourses(false);
    }
  };

  const handleLoadSwitchCourses = async () => {
    setMoveType('switch');
    setMoveTarget(null);
    setLoadingCourses(true);
    try {
      const isWT = (enrollment.course_type || '').toLowerCase().includes('wheelthrowing');
      const type = isWT ? 'HB' : 'WT'; // opposite type
      const res = await api.get(`/admin/available-courses?type=${type}`);
      setAvailableCourses(res.data.courses || []);
    } catch (err) {
      console.error('Failed to load courses:', err);
    } finally {
      setLoadingCourses(false);
    }
  };

  const handleMoveCourse = async () => {
    if (!moveTarget || !enrollment) return;
    setMovingCourse(true);
    try {
      if (moveType === 'switch') {
        const isWT = (enrollment.course_type || '').toLowerCase().includes('wheelthrowing');
        const newType = isWT ? 'Handbuilding Beginner' : 'Wheelthrowing Beginner';
        await api.post(`/admin/enrollments/${enrollment.id}/switch-type`, {
          newCourseType: newType,
          toCourseId: moveTarget.courseId,
        });
      } else {
        // Same type move — use existing move-student endpoint
        const baseId = enrollment.course_identifier?.replace(/\.\d+$/, '') || '';
        await api.post('/admin/course-emails/move-student', {
          studentId: student.id,
          fromCourseId: baseId,
          toCourseId: moveTarget.courseId,
        });
      }
      setShowMoveModal(false);
      alert('Student moved successfully!');
      await loadStudentData();
    } catch (error) {
      console.error('Failed to move student:', error);
      alert(error.response?.data?.error || 'Failed to move student');
    } finally {
      setMovingCourse(false);
    }
  };

  const handleProfilePictureUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Image size must be less than 5MB'); return; }
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('image', file);
      const { data } = await api.post('/upload/image', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (data.success && data.url) {
        setEditForm(f => ({ ...f, profilePicture: data.url }));
        alert('Image uploaded successfully! Click "Save Changes" to save.');
      }
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleImpersonate = (target = 'student') => {
    if (!student?.id) {
      setSaveMessage('Student data not loaded yet — try again.');
      return;
    }
    localStorage.setItem('adminReturnPath', window.location.pathname);
    localStorage.setItem('ves_impersonate_id', String(student.id));
    window.location.href = target === 'instructor' ? '/' : '/dashboard';
  };

  // ─── Derived values ───────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Group bookings by enrollment ID to identify completed courses
  // This ensures makeup bookings in other courses stay grouped with the student's actual enrollment
  const getGroupKey = (b) => b.course_enrollment_id || b.class_type || 'unknown';
  const courseGroups = {};
  bookings.forEach(b => {
    const key = getGroupKey(b);
    if (!courseGroups[key]) courseGroups[key] = [];
    courseGroups[key].push(b);
  });
  const isCompletedCourse = (group) => {
    return group.every(b => {
      const d = new Date(b.class_date); d.setHours(0,0,0,0);
      return (b.status === 'attended' || b.status === 'completed') && d < today;
    });
  };
  const [showCompletedCourses, setShowCompletedCourses] = useState(false);
  const activeBookings = bookings.filter(b => !isCompletedCourse(courseGroups[getGroupKey(b)] || []));
  const completedCourseCount = Object.values(courseGroups).filter(g => isCompletedCourse(g)).length;

  const attendedCount = activeBookings.filter(b => {
    const classDate = new Date(b.class_date);
    classDate.setHours(0, 0, 0, 0);
    return b.status === 'attended' || b.status === 'completed' || (b.status === 'booked' && classDate < today);
  }).length;

  const isHBEnrollment = enrollment && (enrollment.course_type || '').toLowerCase().includes('handbuilding');
  const hbCreditsAllocated = enrollment?.class_credits_allocated || enrollment?.number_of_weeks || 0;
  const hbCreditsUsed = enrollment?.class_credits_used || 0;
  const hbCreditsRemaining = enrollment?.class_credits_remaining || 0;

  const totalBooked    = activeBookings.length;
  // Scope counts to current enrollment only (not all historical bookings)
  // HB credit students can book into different class types, so match by enrollment ID
  const currentEnrollmentId = enrollment?.course_identifier;
  const currentEnrollmentBookings = enrollment?.id
    ? bookings.filter(b => b.course_enrollment_id === enrollment.id)
    : bookings;
  const allBookedCount = isHBEnrollment ? hbCreditsUsed : currentEnrollmentBookings.length;

  // Count attended from current enrollment bookings only
  const allAttendedCount = currentEnrollmentBookings.filter(b => {
    const classDate = new Date(b.class_date);
    classDate.setHours(0, 0, 0, 0);
    return b.status === 'attended' || b.status === 'completed' || (b.status === 'booked' && classDate < today);
  }).length;
  const enrollmentAllocated = isHBEnrollment ? hbCreditsAllocated : (enrollment?.number_of_weeks || 0);
  const totalAllocated = Math.max(allBookedCount, enrollmentAllocated);
  const is10ClassPkg = enrollment?.number_of_weeks === 10;
  const flexRemaining = flexCredits?.remaining || (is10ClassPkg ? (enrollment?.class_credits_remaining || 0) : 0);
  // Count all bookings that consume a credit (booked, attended, completed, missed/absent, rescheduled)
  const creditsUsedCount = currentEnrollmentBookings.filter(b =>
    b.status === 'booked' || b.status === 'attended' || b.status === 'completed' ||
    b.status === 'absent' || b.status === 'missed' || b.status === 'rescheduled' || b.status === 'forfeited'
  ).length;
  const waitlistCredits = studentWaitlist.length;
  const unbookedCount  = isHBEnrollment
    ? Math.max(0, hbCreditsRemaining)
    : is10ClassPkg
      ? Math.max(0, flexRemaining)
      : Math.max(0, enrollmentAllocated - creditsUsedCount - waitlistCredits);

  const filteredBookings = [...(showCompletedCourses ? bookings : activeBookings)]
    .filter(b => statusFilter === 'all' || b.status === statusFilter)
    .sort((a, b) => new Date(a.class_date) - new Date(b.class_date));

  const totalFeePaid    = fees.filter(f => f.payment_status === 'paid').reduce((s, f) => s + parseFloat(f.amount || 0), 0);
  const totalFeePending = fees.filter(f => f.payment_status === 'pending').reduce((s, f) => s + parseFloat(f.amount || 0), 0);

  const memberSince = student
    ? new Date(student.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '';

  const studentName = student ? `${student.first_name} ${student.last_name}` : '';
  const studentInitial = studentName ? studentName[0] : '?';

  // ─── Loading / not found ──────────────────────────────────────────────────
  const isInstructor = student?.role === 'instructor';
  const isAlsoStudent = isInstructor && (student?.customer_type || '').toLowerCase().includes('student');

  if (loading) {
    return (
      <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
        <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <span style={{ fontSize: '14px', color: MUTED }}>Loading…</span>
        </main>
      </div>
    );
  }

  if (!student) {
    return (
      <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
        <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <span style={{ fontSize: '14px', color: MUTED }}>Student not found.</span>
        </main>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '24px 24px 80px' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          {cameFromMemberships ? (
            <a href="/admin/memberships" style={{ fontSize: '12px', color: TC, textDecoration: 'none', fontWeight: 700 }}>← Members</a>
          ) : student.role === 'instructor' ? (
            <a href="/admin/instructors" style={{ fontSize: '12px', color: TC, textDecoration: 'none', fontWeight: 700 }}>← Instructors</a>
          ) : (
            <a href="/admin/students" style={{ fontSize: '12px', color: TC, textDecoration: 'none', fontWeight: 700 }}>← Users</a>
          )}
          <span style={{ fontSize: '12px', color: MUTED }}>/</span>
          <span style={{ fontSize: '12px', color: MUTED }}>{studentName}</span>
        </div>

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '300px 1fr', gap: '24px', alignItems: 'start' }}>

          {/* ── LEFT: Student card ── */}
          <StudentInfoCard
            student={student}
            studentName={studentName}
            studentInitial={studentInitial}
            memberSince={memberSince}
            editForm={editForm}
            setEditForm={setEditForm}
            isEditing={isEditing}
            setIsEditing={setIsEditing}
            saving={saving}
            saveChanges={saveChanges}
            saveMessage={saveMessage}
            setSaveMessage={setSaveMessage}
            formatDate={formatDate}
            isMobile={isMobile}
            isInstructor={isInstructor}
            isAlsoStudent={isAlsoStudent}
            enrollment={enrollment}
            resuming={resuming}
            handleResumeCourse={handleResumeCourse}
            handleImpersonate={handleImpersonate}
            handleCompleteCourse={handleCompleteCourse}
            setShowPauseModal={setShowPauseModal}
            instructorNotes={instructorNotes}
            onAddNote={async (content) => {
              try {
                await api.post('/admin/students/' + student.id + '/notes', { content });
                const r = await api.get('/admin/students/' + student.id + '/notes');
                setInstructorNotes(r.data.notes || []);
              } catch (err) { console.error('Failed to add note:', err); }
            }}
            teachingData={teachingData}
          />

          {/* ── RIGHT: Tabbed detail ── */}
          <div>

            {/* Section tabs */}
            <div style={{ display: 'flex', backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, borderBottom: 'none' }}>
              {[
                ...(isInstructor ? [{ id: 'teaching', label: `Teaching (${teachingData?.courses?.length || 0})` }] : []),
                ...(!isInstructor || isAlsoStudent ? [
                  { id: 'enrollment', label: `Enrollment${enrollments.length > 1 ? ` (${enrollments.length})` : ''}` },
                  { id: 'bookings',   label: `Bookings (${showCompletedCourses ? bookings.length : activeBookings.length})` },
                  { id: 'fees',       label: `Fees (${fees.length})` },
                  { id: 'access',     label: `Studio Access (${studioBookings.length})` },
                  { id: 'credits',    label: `Credits (${creditBalance})` },
                ] : []),
              ].map(t => (
                <button key={t.id} onClick={() => setSection(t.id)} style={{
                  padding: '13px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: section === t.id ? INK : MUTED,
                  borderBottom: `2px solid ${section === t.id ? TC : 'transparent'}`,
                  transition: 'all 0.1s',
                }}>{t.label}</button>
              ))}
            </div>

            {/* ── TEACHING TAB ── */}
            {section === 'teaching' && isInstructor && (
              <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF' }}>

                {(!teachingData?.courses?.length) ? (
                  <div style={{ padding: '40px 0', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No courses assigned to this instructor.</div>
                ) : (() => {
                  const now = new Date(); now.setHours(0,0,0,0);
                  const unavailDates = new Set((teachingData.unavailableDates || []).map(d => d?.split('T')[0]));
                  const isClassCancelled = (cls) => cls.status === 'cancelled' || unavailDates.has(cls.class_date?.split('T')[0]);
                  const getNextClassDate = (course) => {
                    const cls = (course.classes || []).find(c => new Date(c.class_date) >= now && !isClassCancelled(c));
                    return cls ? new Date(cls.class_date) : new Date('9999-12-31');
                  };
                  const activeCourses = teachingData.courses.filter(c => (c.classes || []).some(cls => new Date(cls.class_date) >= now && !isClassCancelled(cls))).sort((a, b) => getNextClassDate(a) - getNextClassDate(b));
                  const completedCourses = teachingData.courses.filter(c => !(c.classes || []).some(cls => new Date(cls.class_date) >= now && !isClassCancelled(cls)));
                  const renderCourse = (course, { isCompleted } = {}) => {
                      const classes = course.classes || [];
                      const sampleClass = classes[0];
                      const typePrefix = (sampleClass?.class_type || '').match(/^(WT|HB|KD|CL)/)?.[1];
                      const typeLabel = typePrefix === 'WT' ? 'Wheelthrowing' : typePrefix === 'HB' ? 'Handbuilding' : typePrefix === 'KD' ? 'Kids' : '';
                      const today = now;
                      const futureClasses = classes.filter(c => new Date(c.class_date) >= today && !isClassCancelled(c));
                      const pastClasses = classes.filter(c => new Date(c.class_date) < today || isClassCancelled(c));
                      const isExpanded = expandedClassId === course.identifier;
                      const nextClass = futureClasses[0];
                      const nextDateStr = nextClass ? new Date(nextClass.class_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : null;
                      const enrolled = course.totalEnrollment || 0;
                      const cap = sampleClass?.max_capacity || 10;
                      const progress = classes.length > 0 ? (pastClasses.length / classes.length) * 100 : 0;

                      return (
                        <div key={course.identifier} style={{ margin: '0 20px 12px', border: `1px solid ${isCompleted ? RULE : TC}`, backgroundColor: '#FFF', opacity: isCompleted ? 0.45 : 1 }}>
                          {/* Course card header */}
                          <div
                            onClick={() => setExpandedClassId(isExpanded ? null : course.identifier)}
                            style={{ padding: '16px 18px', cursor: 'pointer' }}
                          >
                            {/* Top: badge + identifier + expand */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', backgroundColor: isCompleted ? ALT : TC_LIGHT, color: isCompleted ? MUTED : TC_DARK }}>{typePrefix || '??'}</span>
                              <span style={{ fontSize: '14px', fontWeight: 700, color: isCompleted ? MUTED : INK }}>{course.identifier}</span>
                              {!isCompleted && nextDateStr && (
                                <span style={{ fontSize: '11px', color: TC_DARK, fontWeight: 600, marginLeft: '4px' }}>Next: {nextDateStr}</span>
                              )}
                              <span style={{ fontSize: '12px', color: MUTED, marginLeft: 'auto' }}>{isExpanded ? '▾' : '▸'}</span>
                            </div>

                            {/* Progress bar */}
                            <div style={{ height: '4px', backgroundColor: ALT, marginBottom: '10px' }}>
                              <div style={{ height: '100%', width: `${progress}%`, backgroundColor: isCompleted ? MUTED : TC }} />
                            </div>

                            {/* Stats row */}
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                              <div>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: isCompleted ? MUTED : INK }}>{enrolled}<span style={{ fontSize: '13px', color: MUTED, fontWeight: 400 }}>/{cap}</span></div>
                                <div style={{ fontSize: '9px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Students</div>
                              </div>
                              <div>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: isCompleted ? MUTED : INK }}>{pastClasses.length}<span style={{ fontSize: '13px', color: MUTED, fontWeight: 400 }}>/{classes.length}</span></div>
                                <div style={{ fontSize: '9px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Classes Done</div>
                              </div>
                              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                                <div style={{ fontSize: '12px', color: MUTED }}>{typeLabel}</div>
                                <div style={{ fontSize: '12px', color: MUTED }}>{sampleClass?.start_time || ''}{sampleClass?.end_time ? ` – ${sampleClass.end_time}` : ''}</div>
                              </div>
                            </div>
                          </div>

                          {/* Expanded: class schedule */}
                          {isExpanded && (
                            <div style={{ borderTop: `1px solid ${RULE}` }}>
                              {classes.map((cls, i) => {
                                const classDate = new Date(cls.class_date);
                                const isCancelled = isClassCancelled(cls);
                                const isPast = classDate < today;
                                const isNext = !isPast && !isCancelled && futureClasses[0]?.id === cls.id;
                                const dateStr = classDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                                const booked = cls.bookingCount || 0;
                                const clsCap = cls.max_capacity || 10;
                                return (
                                  <div key={cls.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '9px 18px', borderBottom: i < classes.length - 1 ? `1px solid ${RULE}` : 'none',
                                    backgroundColor: isCancelled ? '#FDF2F2' : isNext ? TC_LIGHT : isPast ? '#FAFAFA' : '#FFF',
                                    opacity: isPast || isCancelled ? 0.5 : 1,
                                  }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: MUTED, width: '28px' }}>W{i + 1}</span>
                                    <span style={{ fontSize: '12px', fontWeight: isNext ? 700 : 500, color: isCancelled ? '#D93025' : isNext ? TC_DARK : INK, minWidth: '100px', textDecoration: isCancelled ? 'line-through' : 'none' }}>{dateStr}</span>
                                    <span style={{ fontSize: '11px', color: MUTED }}>{cls.start_time || ''}</span>
                                    <span style={{ fontSize: '12px', fontWeight: 600, marginLeft: 'auto' }}>{booked}<span style={{ fontWeight: 400, color: MUTED }}>/{clsCap}</span></span>
                                    {isCancelled && <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', backgroundColor: '#FDECEA', color: '#D93025', letterSpacing: '0.05em' }}>CANCELLED</span>}
                                    {isNext && <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', backgroundColor: TC, color: '#FFF', letterSpacing: '0.05em' }}>NEXT</span>}
                                    {isPast && !isCancelled && <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', backgroundColor: ALT, color: MUTED, letterSpacing: '0.05em' }}>DONE</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                  };
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {activeCourses.length > 0 && (
                        <div>
                          <div style={{ padding: '14px 20px 8px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>
                            Active ({activeCourses.length})
                          </div>
                          {activeCourses.map(c => renderCourse(c))}
                        </div>
                      )}
                      {completedCourses.length > 0 && (
                        <div>
                          <div style={{ padding: '14px 20px 8px', borderTop: activeCourses.length > 0 ? `2px solid ${RULE}` : 'none', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>
                            Completed ({completedCourses.length})
                          </div>
                          {completedCourses.map(c => renderCourse(c, { isCompleted: true }))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* ── ENROLLMENT TAB ── */}
            {section === 'enrollment' && (
              <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', padding: '24px' }}>
                {enrollments.length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No active enrollment.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {enrollments.map((enr) => {
                      const enrIsHB = (enr.course_type || '').toLowerCase().includes('handbuilding');
                      const enrBookings = bookings.filter(b => b.course_enrollment_id === enr.id);
                      const enrHbCreditsAllocated = enr.class_credits_allocated || enr.number_of_weeks || 0;
                      const enrHbCreditsUsed = enr.class_credits_used || 0;
                      const enrHbCreditsRemaining = enr.class_credits_remaining || 0;
                      const enrBookedCount = enrIsHB ? enrHbCreditsUsed : enrBookings.length;
                      const enrAttendedCount = enrBookings.filter(b => {
                        const classDate = new Date(b.class_date);
                        classDate.setHours(0, 0, 0, 0);
                        return b.status === 'attended' || b.status === 'completed' || (b.status === 'booked' && classDate < today);
                      }).length;
                      const enrAllocated = enrIsHB ? enrHbCreditsAllocated : (enr.number_of_weeks || 0);
                      const enrTotalAllocated = Math.max(enrBookedCount, enrAllocated);
                      const enrIs10Class = enr.number_of_weeks === 10;
                      const enrFlexRemaining = enr.id === enrollment?.id ? (flexCredits?.remaining || (enrIs10Class ? (enr.class_credits_remaining || 0) : 0)) : 0;
                      const enrUnbooked = enrIsHB
                        ? Math.max(0, enrHbCreditsRemaining)
                        : Math.max(0, enrAllocated - enrBookedCount) + enrFlexRemaining;
                      const isUpcoming = enr.display_status === 'upcoming';
                      const isPrimary = enr.id === enrollment?.id;
                      const statusLabel = isUpcoming ? 'UPCOMING' : enr.status === 'paused' ? 'PAUSED' : 'ACTIVE';
                      const statusColor = isUpcoming ? '#6B7280' : enr.status === 'paused' ? '#D97706' : '#059669';

                      return (
                        <div key={enr.id} style={{
                          border: `1px solid ${isUpcoming ? '#E5E7EB' : RULE}`,
                          padding: '18px',
                          backgroundColor: isUpcoming ? '#FAFAFA' : '#FFFFFF',
                          opacity: isUpcoming ? 0.85 : 1,
                        }}>
                          {/* Header row: type badge + status badge */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', backgroundColor: ALT, color: INK }}>
                                  {enr.course_type ? getTypeLabel(enr.course_type) : 'COURSE'}
                                </span>
                                <span style={{
                                  fontSize: '9px', fontWeight: 700, padding: '2px 6px', letterSpacing: '0.06em',
                                  backgroundColor: statusColor + '18', color: statusColor, borderRadius: '2px',
                                }}>
                                  {statusLabel}
                                </span>
                                <span style={{ fontSize: '13px', fontWeight: 700 }}>{enr.course_title || 'N/A'}</span>
                              </div>
                              {enr.course_variant_title && (
                                <div style={{ fontSize: '12px', color: MUTED, marginBottom: '3px' }}>{enr.course_variant_title}</div>
                              )}
                              <div style={{ fontSize: '10px', fontFamily: 'monospace', color: TC_DARK }}>{enr.course_identifier || ''}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '22px', fontWeight: 700 }}>
                                {enrAttendedCount}<span style={{ fontSize: '14px', color: MUTED, fontWeight: 400 }}>/{enr.number_of_weeks || enrTotalAllocated}</span>
                              </div>
                              <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Attended</div>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div style={{ height: '6px', backgroundColor: ALT, position: 'relative', marginBottom: '8px' }}>
                            <div style={{
                              position: 'absolute', left: 0, top: 0, height: '100%',
                              width: `${Math.min(100, enrTotalAllocated > 0 ? (enrAttendedCount / enrTotalAllocated) * 100 : 0)}%`,
                              backgroundColor: TC,
                            }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '11px', color: MUTED }}>
                              {enrBookedCount} booked · {enrAttendedCount} attended
                            </span>
                            <span style={{ fontSize: '11px', color: TC_DARK, fontWeight: 700 }}>
                              {enrIsHB
                                ? `${enrHbCreditsRemaining} credits remaining`
                                : enr.number_of_weeks === 10
                                  ? `${enr.class_credits_remaining || 0} flex credits`
                                  : enrUnbooked > 0 ? `${enrUnbooked} available` : ''}
                            </span>
                          </div>

                          {/* Dates */}
                          {(enr.start_date || enr.end_date || enr.course_start_date) && (
                            <div style={{ paddingTop: '12px', marginTop: isUpcoming ? 0 : '12px', borderTop: isUpcoming ? 'none' : `1px solid ${RULE}`, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                              {[
                                (enr.start_date || enr.course_start_date) ? formatDate(enr.start_date || enr.course_start_date) : null,
                                enr.end_date ? `→ ${formatDate(enr.end_date)}` : null,
                              ].filter(Boolean).map((v, i) => (
                                <span key={i} style={{ fontSize: '12px', color: MUTED }}>{v}</span>
                              ))}
                            </div>
                          )}

                          {/* Wheel preference — only for WT 6wk x3 packages on primary enrollment */}
                          {isPrimary && enr.package_total_courses === 3 && ((enr.course_type || '').toUpperCase().startsWith('WT') || (enr.course_title || '').toLowerCase().includes('wheelthrowing')) && (
                            <div style={{ marginTop: '16px', padding: '14px 16px', backgroundColor: '#FFF8F0', border: `1px solid ${TC_LIGHT}`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: TC_DARK }}>Preferred Wheel</span>
                              <select
                                value={student?.wheel_preference || ''}
                                onChange={async (e) => {
                                  const val = e.target.value ? parseInt(e.target.value) : null;
                                  try {
                                    await api.put(`/admin/students/${encodeURIComponent(student.email)}`, { wheel_preference: val });
                                    setStudent(prev => ({ ...prev, wheel_preference: val }));
                                  } catch (err) {
                                    console.error('Failed to save wheel preference:', err);
                                  }
                                }}
                                style={{ padding: '4px 8px', fontSize: '13px', fontWeight: 700, border: `1px solid ${RULE}`, borderRadius: '4px', backgroundColor: '#FFF', color: INK, cursor: 'pointer' }}
                              >
                                <option value="">—</option>
                                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                                  <option key={n} value={n}>Wheel {n}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Package progress — only on primary enrollment */}
                          {isPrimary && enr.package_total_courses > 1 && (
                            <div style={{ marginTop: '16px', padding: '14px 16px', backgroundColor: '#FFF8F0', border: `1px solid ${TC_LIGHT}`, borderRadius: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: TC_DARK }}>
                                  Course {enr.package_current_course} of {enr.package_total_courses}
                                </span>
                                <span style={{ fontSize: '11px', color: MUTED }}>
                                  {enr.package_total_courses}-Course Package
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                                {Array.from({ length: enr.package_total_courses }).map((_, i) => (
                                  <div key={i} style={{
                                    flex: 1, height: '4px', borderRadius: '2px',
                                    backgroundColor: i < enr.package_courses_completed ? TC
                                      : i < enr.package_current_course ? TC_LIGHT
                                      : RULE,
                                  }} />
                                ))}
                              </div>
                              <div style={{ fontSize: '11px', color: MUTED }}>
                                {enr.package_courses_completed} completed
                                {enr.package_courses_remaining > 0 && (
                                  <span> · <span style={{ color: TC_DARK, fontWeight: 600 }}>{enr.package_courses_remaining} more course{enr.package_courses_remaining > 1 ? 's' : ''} remaining ({enr.package_courses_remaining * (enr.number_of_weeks || 6)} classes)</span></span>
                                )}
                              </div>
                              {nextCourse?.available && enr.package_courses_remaining > 0 && (
                                <div style={{ marginTop: '12px' }}>
                                  <button
                                    onClick={handleContinuePackage}
                                    disabled={continuingPackage}
                                    style={{
                                      width: '100%', padding: '10px 16px',
                                      backgroundColor: TC, color: '#fff', border: 'none', borderRadius: '6px',
                                      fontSize: '12px', fontWeight: 700,
                                      cursor: continuingPackage ? 'not-allowed' : 'pointer',
                                      opacity: continuingPackage ? 0.6 : 1,
                                    }}
                                  >
                                    {continuingPackage ? 'Enrolling...' : `Enroll in Next Course → ${nextCourse.nextCourse?.identifier || ''}`}
                                  </button>
                                  <div style={{ fontSize: '10px', color: MUTED, marginTop: '4px', textAlign: 'center' }}>
                                    {nextCourse.nextCourse?.startDate && new Date(nextCourse.nextCourse.startDate).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    {nextCourse.nextCourse?.instructor && ` · ${nextCourse.nextCourse.instructor}`}
                                  </div>
                                </div>
                              )}
                              {enr.package_courses_remaining > 0 && nextCourse !== null && !nextCourse?.available && (
                                <div style={{ fontSize: '10px', color: MUTED, marginTop: '8px', fontStyle: 'italic' }}>
                                  No matching upcoming course launched yet
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Move Course button */}
                {enrollment && enrollment.status === 'active' && (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${RULE}` }}>
                    <button
                      onClick={handleOpenMoveModal}
                      style={{
                        width: '100%', padding: '10px 16px',
                        backgroundColor: '#FFFFFF', color: INK, border: `1px solid ${RULE}`,
                        fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      Move / Switch Course
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── BOOKINGS TAB ── */}
            {section === 'bookings' && (
              <StudentBookingsTab
                filteredBookings={filteredBookings}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                completedCourseCount={completedCourseCount}
                showCompletedCourses={showCompletedCourses}
                setShowCompletedCourses={setShowCompletedCourses}
                unbookedCount={unbookedCount}
                today={today}
                parseCourseName={parseCourseName}
                handleToggleAttended={handleToggleAttended}
                handleOpenMakeupModal={handleOpenMakeupModal}
                deleteConfirmId={deleteConfirmId}
                setDeleteConfirmId={setDeleteConfirmId}
                deletingBookingId={deletingBookingId}
                handleDeleteBooking={handleDeleteBooking}
                handleConvertToCredit={handleConvertToCredit}
                isHBEnrollment={isHBEnrollment}
                hbCreditsAllocated={hbCreditsAllocated}
                waitlistEntries={studentWaitlist}
              />
            )}

            {/* ── FEES TAB ── */}
            {section === 'fees' && (
              <StudentFeesTab
                fees={fees}
                totalFeePaid={totalFeePaid}
                totalFeePending={totalFeePending}
                updatingFeeId={updatingFeeId}
                updateFeeStatus={updateFeeStatus}
                feeDeleteConfirmId={feeDeleteConfirmId}
                setFeeDeleteConfirmId={setFeeDeleteConfirmId}
                deletingFeeId={deletingFeeId}
                handleDeleteFee={handleDeleteFee}
                formatDate={formatDate}
              />
            )}

            {/* ── CREDITS TAB ── */}
            {section === 'credits' && (
              <StudentCreditsTab
                studentId={student?.id}
                balance={creditBalance}
                history={creditHistory}
                onRefresh={() => {
                  api.get(`/credits/balance/${student.id}`).then(r => setCreditBalance(r.data.balance || 0)).catch(() => {});
                  api.get(`/credits/history/${student.id}`).then(r => setCreditHistory(r.data.history || [])).catch(() => {});
                }}
              />
            )}

            {/* ── STUDIO ACCESS TAB ── */}
            {section === 'access' && (
              <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF' }}>
                {/* Summary */}
                {studioSummary && (
                  <div style={{ display: 'flex', gap: '24px', padding: '16px 20px', borderBottom: `1px solid ${RULE}`, backgroundColor: '#FAFAFA' }}>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>Sessions</div>
                      <div style={{ fontSize: '18px', fontWeight: 700 }}>{studioSummary.totalSessions}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>Hours</div>
                      <div style={{ fontSize: '18px', fontWeight: 700 }}>{studioSummary.totalHours}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>Spent</div>
                      <div style={{ fontSize: '18px', fontWeight: 700 }}>${studioSummary.totalSpent}</div>
                    </div>
                    {studioSummary.pendingCount > 0 && (
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#F57F17' }}>Pending</div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#F57F17' }}>{studioSummary.pendingCount}</div>
                      </div>
                    )}
                  </div>
                )}

                {studioBookings.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
                    No studio access bookings
                  </div>
                ) : (
                  <>
                    {/* Table header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.5fr 0.5fr 0.8fr 1.2fr', gap: '8px', padding: '10px 20px', borderBottom: `1px solid ${RULE}`, backgroundColor: '#FAFAFA' }}>
                      {['Date', 'Time', 'Hours', 'Amount', 'Status', 'Actions'].map(h => (
                        <span key={h} style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>{h}</span>
                      ))}
                    </div>
                    {studioBookings.map((b, i) => {
                      const d = new Date(b.booking_date + 'T12:00:00');
                      const dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                      const startH = b.start_time ? parseInt(b.start_time.split(':')[0], 10) : 12;
                      const endH = b.end_time ? parseInt(b.end_time.split(':')[0], 10) : (startH + 2);
                      const fmtTime = (h) => { const s = h >= 12 ? 'pm' : 'am'; return (h > 12 ? h - 12 : h) + s; };
                      const statusColors = { booked: { bg: '#E8F5E9', c: '#2E7D32' }, pending: { bg: '#FFF8E1', c: '#F57F17' }, attended: { bg: '#E3F2FD', c: '#1565C0' }, cancelled: { bg: '#FAFAFA', c: '#999' } };
                      const sc = statusColors[b.status] || statusColors.booked;
                      return (
                        <div key={b.id} style={{
                          display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.5fr 0.5fr 0.8fr 1.2fr', gap: '8px',
                          padding: '12px 20px', borderBottom: i < studioBookings.length - 1 ? `1px solid ${RULE}` : 'none',
                          alignItems: 'center', opacity: b.status === 'cancelled' ? 0.5 : 1,
                        }}>
                          <span style={{ fontSize: '12px' }}>{dateStr}</span>
                          <span style={{ fontSize: '12px' }}>{fmtTime(startH)} – {fmtTime(endH)}</span>
                          <span style={{ fontSize: '12px' }}>{b.hours}h</span>
                          <span style={{ fontSize: '12px' }}>${b.amount_sgd}</span>
                          <span style={{ display: 'inline-block', fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 8px', backgroundColor: sc.bg, color: sc.c }}>{b.status}</span>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {b.status === 'pending' && (
                              <button onClick={async () => { await api.put(`/admin/studio-access/bookings/${b.id}/confirm`); loadStudentData(); }} style={{ padding: '3px 8px', fontSize: '9px', fontWeight: 700, border: 'none', cursor: 'pointer', backgroundColor: '#2E7D32', color: '#FFF', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Confirm</button>
                            )}
                            {b.status === 'booked' && (
                              <button onClick={async () => { await api.put(`/admin/studio-access/bookings/${b.id}/attended`); loadStudentData(); }} style={{ padding: '3px 8px', fontSize: '9px', fontWeight: 700, border: 'none', cursor: 'pointer', backgroundColor: '#1565C0', color: '#FFF', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Attended</button>
                            )}
                            {b.status !== 'cancelled' && b.status !== 'attended' && (
                              <button onClick={async () => { await api.put(`/admin/studio-access/bookings/${b.id}/cancel`); loadStudentData(); }} style={{ padding: '3px 8px', fontSize: '9px', fontWeight: 700, border: 'none', cursor: 'pointer', backgroundColor: '#EEE', color: '#C62828', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Cancel</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

          </div>
        </div>
      </main>

      {/* ── PAUSE COURSE MODAL ── */}
      {showPauseModal && enrollment && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ backgroundColor: '#FFFFFF', padding: '32px', width: '440px', maxWidth: '90vw' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>Pause Course</div>
            <div style={{ fontSize: '12px', color: MUTED, marginBottom: '20px' }}>
              Pausing {studentName}'s enrollment in {enrollment.course_identifier || enrollment.course_title}
            </div>

            <div style={{ backgroundColor: TC_LIGHT, border: `1px solid ${TC}`, padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: TC_DARK }}>
              Total weeks: {enrollment.number_of_weeks}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '6px' }}>
                Weeks Completed *
              </label>
              <input
                type="number" min="0" max={(enrollment.number_of_weeks || 6) - 1}
                value={pauseForm.weeksCompleted}
                onChange={e => setPauseForm(f => ({ ...f, weeksCompleted: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '14px', boxSizing: 'border-box', fontFamily: 'Atak, sans-serif' }}
              />
              <div style={{ fontSize: '11px', color: MUTED, marginTop: '4px' }}>
                Remaining weeks: {(enrollment.number_of_weeks || 6) - (parseInt(pauseForm.weeksCompleted) || 0)}
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '6px' }}>Reason (optional)</label>
              <textarea
                rows={3} placeholder="e.g., Travel, medical leave…"
                value={pauseForm.reason}
                onChange={e => setPauseForm(f => ({ ...f, reason: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '14px', boxSizing: 'border-box', fontFamily: 'Atak, sans-serif', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => { setShowPauseModal(false); setPauseForm({ weeksCompleted: 0, reason: '' }); }}
                disabled={pausing}
                style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
              >Cancel</button>
              <button
                onClick={handlePauseCourse}
                disabled={pausing}
                style={{ flex: 1, padding: '12px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: pausing ? 'not-allowed' : 'pointer', opacity: pausing ? 0.7 : 1 }}
              >{pausing ? 'Pausing…' : 'Confirm Pause'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MOVE / SWITCH COURSE MODAL ── */}
      {showMoveModal && enrollment && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => !movingCourse && setShowMoveModal(false)}>
          <div style={{ backgroundColor: '#FFFFFF', width: '90%', maxWidth: '500px', maxHeight: '80vh', overflow: 'auto', padding: '24px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC_DARK, marginBottom: '16px' }}>Move / Switch Course</div>

            <div style={{ fontSize: '12px', color: MUTED, marginBottom: '16px' }}>
              Current: <strong style={{ color: INK }}>{enrollment.course_identifier || enrollment.course_type}</strong>
            </div>

            {/* Tab toggle: Same type vs Switch type */}
            <div style={{ display: 'flex', gap: '0', marginBottom: '16px', border: `1px solid ${RULE}` }}>
              <button
                onClick={() => { handleOpenMoveModal(); }}
                style={{
                  flex: 1, padding: '8px', border: 'none', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                  backgroundColor: moveType === 'same' ? TC : '#FFFFFF',
                  color: moveType === 'same' ? '#FFF' : MUTED,
                }}
              >
                Same Type
              </button>
              <button
                onClick={handleLoadSwitchCourses}
                style={{
                  flex: 1, padding: '8px', border: 'none', borderLeft: `1px solid ${RULE}`, fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                  backgroundColor: moveType === 'switch' ? TC : '#FFFFFF',
                  color: moveType === 'switch' ? '#FFF' : MUTED,
                }}
              >
                {(enrollment.course_type || '').toLowerCase().includes('wheelthrowing') ? 'Switch to HB' : 'Switch to WT'}
              </button>
            </div>

            {loadingCourses ? (
              <div style={{ padding: '20px', textAlign: 'center', color: MUTED, fontSize: '12px' }}>Loading courses...</div>
            ) : availableCourses.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: MUTED, fontSize: '12px' }}>No available courses found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflow: 'auto' }}>
                {availableCourses.map(c => (
                  <div
                    key={c.courseId}
                    onClick={() => setMoveTarget(c)}
                    style={{
                      padding: '10px 12px', border: `1px solid ${moveTarget?.courseId === c.courseId ? TC : RULE}`,
                      backgroundColor: moveTarget?.courseId === c.courseId ? TC_LIGHT : '#FFF',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 700, color: INK }}>{c.courseId}</div>
                    <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>
                      {c.instructor} · {c.totalClasses} classes · Starts {new Date(c.startDate).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
                      {c.startTime && ` · ${c.startTime.slice(0,5)}`}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowMoveModal(false)}
                disabled={movingCourse}
                style={{ padding: '10px 20px', border: `1px solid ${RULE}`, backgroundColor: '#FFF', cursor: 'pointer', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED }}
              >
                Cancel
              </button>
              <button
                onClick={handleMoveCourse}
                disabled={!moveTarget || movingCourse}
                style={{
                  padding: '10px 20px', border: 'none',
                  backgroundColor: moveTarget && !movingCourse ? TC : '#DDD',
                  cursor: moveTarget && !movingCourse ? 'pointer' : 'not-allowed',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#FFF',
                  opacity: movingCourse ? 0.7 : 1,
                }}
              >
                {movingCourse ? 'Moving...' : 'Move Student'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RESCHEDULE / BOOK CLASS MODAL ── */}
      {showMakeupModal && selectedBookingForMakeup && (
        <StudentRescheduleModal
          selectedBookingForMakeup={selectedBookingForMakeup}
          isMobile={isMobile}
          formatDate={formatDate}
          resetMakeupModalState={resetMakeupModalState}
          makeupCurrentMonth={makeupCurrentMonth}
          setMakeupCurrentMonth={setMakeupCurrentMonth}
          makeupSelectedDate={makeupSelectedDate}
          setMakeupSelectedDate={setMakeupSelectedDate}
          rescheduleConfirmId={rescheduleConfirmId}
          setRescheduleConfirmId={setRescheduleConfirmId}
          getAvailSet={getAvailSet}
          getMakeupClassesForDate={getMakeupClassesForDate}
          getTypeLabel={getTypeLabel}
          rescheduling={rescheduling}
          reschedulingClassId={reschedulingClassId}
          handleRescheduleToMakeup={handleRescheduleToMakeup}
          handleConvertToCredit={handleConvertToCredit}
          deletingBookingId={deletingBookingId}
          isHBEnrollment={isHBEnrollment}
        />
      )}

    </div>
  );
}
