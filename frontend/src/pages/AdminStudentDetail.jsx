import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';

// ─── Design tokens ───────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

// ─── Nav config ──────────────────────────────────────────────────────────────
const NAV = [
  { id: 'classes',     label: 'Classes',   href: '/admin/classes' },
  { id: 'students',    label: 'Students',  href: '/admin/students' },
  { id: 'memberships', label: 'Members',   href: '/admin/memberships' },
];

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

// ─── AdminNav ─────────────────────────────────────────────────────────────────
function AdminNav({ active }) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: '#FFFFFF', borderBottom: `1px solid ${RULE}` }}>
      <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '24px' }}>
        <a href="/admin" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <img
            src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
            alt="VES"
            style={{ height: '22px', width: 'auto' }}
          />
        </a>
        <div style={{ width: '1px', height: '18px', backgroundColor: RULE, flexShrink: 0 }} />
        <nav style={{ display: 'flex', flex: 1 }}>
          {NAV.map(link => (
            <a key={link.id} href={link.href} style={{
              padding: '0 14px', height: '52px', display: 'flex', alignItems: 'center',
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: active === link.id ? TC : MUTED,
              textDecoration: 'none',
              borderBottom: `2px solid ${active === link.id ? TC : 'transparent'}`,
            }}>{link.label}</a>
          ))}
        </nav>
        <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 10px', backgroundColor: INK, color: '#FFF', flexShrink: 0 }}>Admin</span>
      </div>
    </header>
  );
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
  const { logout } = useAuth();
  const isMobile = useIsMobile();

  console.log('AdminStudentDetail component loaded, email param:', email);

  // ── Data state ───────────────────────────────────────────────────────────
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [student, setStudent]         = useState(null);
  const [enrollment, setEnrollment]   = useState(null);
  const [bookings, setBookings]       = useState([]);
  const [fees, setFees]               = useState([]);
  const [updatingFeeId, setUpdatingFeeId] = useState(null);

  // ── Edit form ────────────────────────────────────────────────────────────
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    coursePurchaseCount: 0,
    classesAllocated: 0,
  });
  const [showEditModal, setShowEditModal] = useState(false);

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
      if (classType.toLowerCase().includes('handbuilding'))  return 'Handbuilding 4 Weeks';
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
        firstName: studentData.first_name || '',
        lastName:  studentData.last_name  || '',
        email:     studentData.email      || '',
        coursePurchaseCount: studentData.course_purchase_count || 0,
        classesAllocated:    studentData.classes_allocated     || 0,
      });

      const { data: bookingsData } = await api.get(`/admin/students/${decodedEmail}/bookings`);
      console.log('Bookings data received:', bookingsData);
      setBookings(bookingsData.bookings || []);

      if (studentData.id) {
        try {
          const { data: enrollmentData } = await api.get(`/admin/students/${studentData.id}/enrollment`);
          setEnrollment(enrollmentData);
        } catch {
          setEnrollment(null);
        }
        const { data: feesData } = await api.get(`/admin/students/${studentData.id}/fees`);
        setFees(feesData.fees || []);
      }
    } catch (error) {
      console.error('Failed to load student data:', error);
      alert('Failed to load student data');
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
      const decodedEmail = decodeURIComponent(email);
      await api.put(`/admin/students/${decodedEmail}`, {
        first_name:           editForm.firstName.trim(),
        last_name:            editForm.lastName.trim(),
        email:                editForm.email.trim(),
        course_purchase_count: parseInt(editForm.coursePurchaseCount),
        classes_allocated:    parseInt(editForm.classesAllocated),
      });
      alert('Student updated successfully!');
      setShowEditModal(false);
      if (editForm.email.trim() !== decodedEmail) {
        navigate(`/admin/students/${encodeURIComponent(editForm.email.trim())}`);
      } else {
        await loadStudentData();
      }
    } catch (error) {
      console.error('Failed to update student:', error);
      alert('Failed to update student');
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
          bookingType:     'makeup',
          status:          'booked',
        });
        alert('Student booked successfully!');
      } else {
        await api.delete(`/admin/bookings/${selectedBookingForMakeup.id}`);
        await api.post('/admin/bookings', {
          studentId:       student.id,
          classInstanceId: newClassId,
          bookingType:     'makeup',
          status:          'booked',
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

  const handleConvertToCredit = async () => {
    if (!selectedBookingForMakeup || selectedBookingForMakeup.isPlaceholder) return;
    if (!confirm('Are you sure you want to convert this booking to a credit? The class booking will be deleted and the credit will become available for future use.')) return;
    try {
      setDeletingBookingId(selectedBookingForMakeup.id);
      await api.delete(`/admin/bookings/${selectedBookingForMakeup.id}`);
      alert('Booking converted to credit successfully!');
      resetMakeupModalState();
      await loadStudentData();
    } catch (error) {
      console.error('Failed to convert to credit:', error);
      alert('Failed to convert to credit');
    } finally {
      setDeletingBookingId(null);
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

  const handleImpersonate = async () => {
    try {
      const decodedEmail = decodeURIComponent(email);
      const { data } = await api.post(`/auth/impersonate/${decodedEmail}`);
      if (data.success && data.token) {
        localStorage.setItem('token', data.token);
        window.location.href = '/dashboard';
      }
    } catch (error) {
      console.error('Impersonation failed:', error);
      alert('Failed to impersonate student');
    }
  };

  // ─── Derived values ───────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const attendedCount = bookings.filter(b => {
    const classDate = new Date(b.class_date);
    classDate.setHours(0, 0, 0, 0);
    return b.status === 'attended' || b.status === 'completed' || (b.status === 'booked' && classDate < today);
  }).length;

  const totalAllocated = parseInt(editForm.classesAllocated) || 0;
  const totalBooked    = bookings.length;
  const unbookedCount  = Math.max(0, totalAllocated - totalBooked);

  const filteredBookings = [...bookings]
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
  if (loading) {
    return (
      <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
        <AdminNav active="students" />
        <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <span style={{ fontSize: '14px', color: MUTED }}>Loading…</span>
        </main>
      </div>
    );
  }

  if (!student) {
    return (
      <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
        <AdminNav active="students" />
        <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <span style={{ fontSize: '14px', color: MUTED }}>Student not found.</span>
        </main>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <AdminNav active="students" />

      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '24px 24px 80px' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <a href="/admin/students" style={{ fontSize: '12px', color: TC, textDecoration: 'none', fontWeight: 700 }}>← Students</a>
          <span style={{ fontSize: '12px', color: MUTED }}>/</span>
          <span style={{ fontSize: '12px', color: MUTED }}>{studentName}</span>
        </div>

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '300px 1fr', gap: '24px', alignItems: 'start' }}>

          {/* ── LEFT: Student card ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Profile + Membership */}
            <div style={{ backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, padding: '24px' }}>

              {/* Top row: avatar/name + membership */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <div style={{ width: '52px', height: '52px', backgroundColor: TC_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px', overflow: 'hidden' }}>
                    {(editForm.profilePicture || student.profile_picture) ? (
                      <img src={editForm.profilePicture || student.profile_picture} alt={studentName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '20px', fontWeight: 700, color: TC_DARK }}>{studentInitial}</span>
                    )}
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '3px' }}>{studentName}</div>
                  <div style={{ fontSize: '12px', color: MUTED }}>Member since {memberSince}</div>
                </div>

                {/* Membership badge */}
                {student.membership_type && (
                  <div style={{ backgroundColor: TC_LIGHT, border: `1px solid ${TC}`, padding: '10px 12px', flexShrink: 0, maxWidth: '160px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>★ Membership</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px' }}>{student.membership_type}</div>
                    <div style={{ fontSize: '10px', color: MUTED, marginBottom: '8px' }}>
                      {student.membership_start ? new Date(student.membership_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''}{student.membership_end ? ` — ${new Date(student.membership_end).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : ''}
                    </div>
                    <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '2px 7px', backgroundColor: TC, color: '#FFF' }}>active</span>
                  </div>
                )}
              </div>

              {/* Details fields */}
              <div style={{ paddingTop: '14px', borderTop: `1px solid ${RULE}` }}>
                <div style={{ marginBottom: '10px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: MUTED }}>Details</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    { label: 'Email',             value: student.email },
                    { label: 'Customer Type',      value: student.customer_type || 'student' },
                    { label: 'Shopify ID',         value: student.shopify_customer_id || 'N/A' },
                    { label: 'Courses Purchased',  value: student.course_purchase_count ?? 'N/A' },
                    { label: 'Classes Allocated',  value: student.classes_allocated ?? 'N/A' },
                    { label: 'Created',            value: formatDate(student.created_at) },
                  ].map(f => (
                    <div key={f.label}>
                      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '3px' }}>{f.label}</div>
                      <div style={{ fontSize: '13px', wordBreak: 'break-all' }}>{f.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Enrollment status */}
              {enrollment && (
                <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${RULE}` }}>
                  <div style={{ marginBottom: '10px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: MUTED }}>Current Enrollment</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '3px' }}>Course</div>
                      <div style={{ fontSize: '13px' }}>{enrollment.course_title || enrollment.course_identifier || 'N/A'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '3px' }}>Status</div>
                      <span style={{
                        fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                        padding: '3px 8px', display: 'inline-block',
                        backgroundColor: enrollment.status === 'active' ? TC_LIGHT : enrollment.status === 'paused' ? '#FFF7E6' : ALT,
                        color: enrollment.status === 'active' ? TC_DARK : enrollment.status === 'paused' ? '#9E6200' : MUTED,
                      }}>{enrollment.status}</span>
                      {enrollment.status === 'paused' && (
                        <div style={{ marginTop: '4px', fontSize: '11px', color: MUTED }}>
                          Progress: {enrollment.weeks_completed}/{enrollment.number_of_weeks} weeks
                        </div>
                      )}
                    </div>
                    {enrollment.class_credits_allocated > 0 && (
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '6px' }}>HB Credits</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' }}>
                          {[
                            { label: 'Allocated', val: enrollment.class_credits_allocated },
                            { label: 'Used',       val: enrollment.class_credits_used || 0 },
                            { label: 'Remaining',  val: enrollment.class_credits_remaining || 0 },
                          ].map(s => (
                            <div key={s.label} style={{ textAlign: 'center', padding: '8px', backgroundColor: ALT }}>
                              <div style={{ fontSize: '10px', color: MUTED, marginBottom: '2px' }}>{s.label}</div>
                              <div style={{ fontSize: '18px', fontWeight: 700 }}>{s.val}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ height: '4px', backgroundColor: RULE }}>
                          <div style={{ height: '100%', backgroundColor: TC, width: `${((enrollment.class_credits_used || 0) / enrollment.class_credits_allocated) * 100}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: '8px' }}>
              <button
                onClick={() => setShowEditModal(true)}
                style={{ flex: 1, padding: '11px', backgroundColor: INK, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                Edit Student
              </button>
              {enrollment && enrollment.status === 'active' && (
                <button
                  onClick={() => setShowPauseModal(true)}
                  style={{ flex: 1, padding: '11px', backgroundColor: 'transparent', color: INK, border: `1px solid ${RULE}`, fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  Pause Course
                </button>
              )}
              {enrollment && enrollment.status === 'paused' && (
                <button
                  onClick={handleResumeCourse}
                  disabled={resuming}
                  style={{ flex: 1, padding: '11px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: resuming ? 'not-allowed' : 'pointer', opacity: resuming ? 0.7 : 1 }}
                >
                  {resuming ? 'Resuming…' : 'Resume Course'}
                </button>
              )}
              <button
                onClick={handleImpersonate}
                style={{ flex: 1, padding: '11px', backgroundColor: 'transparent', color: MUTED, border: `1px solid ${RULE}`, fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                View as Member
              </button>
            </div>

          </div>

          {/* ── RIGHT: Tabbed detail ── */}
          <div>

            {/* Section tabs */}
            <div style={{ display: 'flex', backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, borderBottom: 'none' }}>
              {[
                { id: 'enrollment', label: 'Enrollment' },
                { id: 'bookings',   label: `Bookings (${bookings.length + unbookedCount})` },
                { id: 'fees',       label: `Fees (${fees.length})` },
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

            {/* ── ENROLLMENT TAB ── */}
            {section === 'enrollment' && (
              <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', padding: '24px' }}>
                {!enrollment ? (
                  <div style={{ padding: '40px 0', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No enrollment found for this student.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Single enrollment card */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', backgroundColor: ALT, color: INK }}>
                              {enrollment.course_type ? getTypeLabel(enrollment.course_type) : 'COURSE'}
                            </span>
                            <span style={{ fontSize: '13px', fontWeight: 700 }}>{enrollment.course_title || 'N/A'}</span>
                          </div>
                          <div style={{ fontSize: '10px', fontFamily: 'monospace', color: TC_DARK }}>{enrollment.course_identifier || ''}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '22px', fontWeight: 700 }}>
                            {attendedCount}<span style={{ fontSize: '14px', color: MUTED, fontWeight: 400 }}>/{totalAllocated || enrollment.number_of_weeks || 6}</span>
                          </div>
                          <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Attended</div>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div style={{ height: '6px', backgroundColor: ALT, position: 'relative', marginBottom: '8px' }}>
                        <div style={{
                          position: 'absolute', left: 0, top: 0, height: '100%',
                          width: `${Math.min(100, (attendedCount / (totalAllocated || enrollment.number_of_weeks || 6)) * 100)}%`,
                          backgroundColor: TC,
                        }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', color: MUTED }}>{attendedCount} attended</span>
                        <span style={{ fontSize: '11px', color: TC_DARK, fontWeight: 700 }}>
                          {Math.max(0, (totalAllocated || enrollment.number_of_weeks || 6) - attendedCount)} remaining
                        </span>
                      </div>
                    </div>

                    {/* Status + dates */}
                    <div style={{ paddingTop: '16px', borderTop: `1px solid ${RULE}`, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                      {[
                        { label: 'Status',      value: enrollment.status },
                        { label: 'Total Weeks', value: enrollment.number_of_weeks || 'N/A' },
                        { label: 'Start Date',  value: formatDate(enrollment.start_date) },
                        { label: 'End Date',    value: formatDate(enrollment.end_date) },
                      ].map(f => (
                        <div key={f.label}>
                          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '3px' }}>{f.label}</div>
                          <div style={{ fontSize: '13px', textTransform: 'capitalize' }}>{String(f.value)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── BOOKINGS TAB ── */}
            {section === 'bookings' && (
              <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF' }}>

                {/* Filter row */}
                <div style={{ display: 'flex', flexWrap: 'wrap', padding: '12px 16px', borderBottom: `1px solid ${RULE}`, gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '4px' }}>Filter:</span>
                  {['all', 'booked', 'attended', 'missed', 'cancelled'].map(f => (
                    <button key={f} onClick={() => setStatusFilter(f)} style={{
                      padding: '4px 10px', border: `1px solid ${statusFilter === f ? TC : RULE}`,
                      backgroundColor: statusFilter === f ? TC_LIGHT : 'transparent',
                      fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'capitalize',
                      color: statusFilter === f ? TC_DARK : MUTED, cursor: 'pointer',
                    }}>{f}</button>
                  ))}
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: '540px' }}>

                    {/* Header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '130px 110px 120px 90px 1fr', padding: '9px 16px', backgroundColor: ALT, borderBottom: `1px solid ${RULE}` }}>
                      {['Course', 'Date', 'Time', 'Status', ''].map((h, i) => (
                        <span key={i} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{h}</span>
                      ))}
                    </div>

                    {/* Actual booking rows */}
                    {filteredBookings.map((booking, i) => {
                      const classDate = new Date(booking.class_date);
                      classDate.setHours(0, 0, 0, 0);
                      const isPast = classDate < today;
                      const displayStatus = (isPast && booking.status === 'booked') ? 'attended' : booking.status;
                      const courseName = parseCourseName(booking.course_identifier, booking.class_type);
                      const timeStr = booking.start_time && booking.end_time ? `${booking.start_time} – ${booking.end_time}` : booking.start_time || '—';
                      const dateStr = new Date(booking.class_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                      const isDeleting = deletingBookingId === booking.id;
                      const style = BOOKING_STYLE[displayStatus] || BOOKING_STYLE.attended;

                      return (
                        <div key={booking.id} style={{ borderBottom: `1px solid ${RULE}` }}>
                          <div style={{
                            display: 'grid', gridTemplateColumns: '130px 110px 120px 90px 1fr',
                            padding: '11px 16px', alignItems: 'center',
                            backgroundColor: displayStatus === 'booked' ? TC_LIGHT : '#FFFFFF',
                          }}>
                            <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 700, color: TC_DARK }}>{courseName}</span>
                            <div style={{ fontSize: '13px', fontWeight: displayStatus === 'booked' ? 700 : 400 }}>{dateStr}</div>
                            <span style={{ fontSize: '12px', color: MUTED }}>{timeStr}</span>
                            <span style={{
                              fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                              padding: '3px 8px', display: 'inline-block',
                              backgroundColor: style.bg, color: style.text,
                            }}>{displayStatus}</span>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => handleOpenMakeupModal(booking)}
                                style={{ padding: '4px 10px', border: `1px solid ${RULE}`, background: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: INK }}
                              >Reschedule</button>
                              <button
                                onClick={() => setDeleteConfirmId(booking.id)}
                                style={{ padding: '4px 10px', border: '1px solid #F0C0C0', background: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#C03030' }}
                              >Delete</button>
                            </div>
                          </div>

                          {/* Inline delete confirm */}
                          {deleteConfirmId === booking.id && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', backgroundColor: '#FFF5F5', borderTop: '1px solid #F0C0C0' }}>
                              <span style={{ fontSize: '12px', color: '#C03030' }}>Delete this booking? This cannot be undone.</span>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  style={{ padding: '5px 12px', border: `1px solid ${RULE}`, background: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: MUTED }}
                                >Cancel</button>
                                <button
                                  onClick={() => handleDeleteBooking(booking.id)}
                                  disabled={isDeleting}
                                  style={{ padding: '5px 12px', border: 'none', backgroundColor: '#C03030', cursor: isDeleting ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#FFF', opacity: isDeleting ? 0.7 : 1 }}
                                >{isDeleting ? 'Deleting…' : 'Confirm Delete'}</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Unbooked credit placeholder rows */}
                    {statusFilter === 'all' && Array.from({ length: unbookedCount }).map((_, i) => {
                      const placeholderBooking = { id: `unbooked-${i}`, isPlaceholder: true };
                      return (
                        <div key={`unbooked-${i}`} style={{ borderBottom: `1px solid ${RULE}` }}>
                          <div style={{
                            display: 'grid', gridTemplateColumns: '130px 110px 120px 90px 1fr',
                            padding: '11px 16px', alignItems: 'center',
                            backgroundColor: '#FFFBEA',
                          }}>
                            <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 700, color: MUTED }}>—</span>
                            <div style={{ fontSize: '13px', color: MUTED }}>—</div>
                            <span style={{ fontSize: '12px', color: MUTED }}>—</span>
                            <span style={{
                              fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                              padding: '3px 8px', display: 'inline-block',
                              backgroundColor: '#FFF7E6', color: '#9E6200',
                            }}>unbooked</span>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => handleOpenMakeupModal(placeholderBooking)}
                                style={{ padding: '4px 10px', border: `1px solid ${TC}`, background: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: TC }}
                              >Book</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Empty state */}
                    {filteredBookings.length === 0 && unbookedCount === 0 && (
                      <div style={{ padding: '40px 0', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No bookings found.</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── FEES TAB ── */}
            {section === 'fees' && (
              <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF' }}>

                {/* Summary stats */}
                <div style={{ display: 'flex', gap: '1px', backgroundColor: RULE, borderBottom: `1px solid ${RULE}` }}>
                  {[
                    { label: 'Total Paid',    value: `$${totalFeePaid.toFixed(2)}`    },
                    { label: 'Outstanding',   value: `$${totalFeePending.toFixed(2)}` },
                  ].map((s, i) => (
                    <div key={i} style={{ flex: 1, padding: '16px 20px', backgroundColor: '#FFFFFF' }}>
                      <div style={{ fontSize: '22px', fontWeight: 700 }}>{s.value}</div>
                      <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '3px' }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: '560px' }}>

                    {/* Header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 80px 200px', padding: '9px 16px', backgroundColor: ALT, borderBottom: `1px solid ${RULE}` }}>
                      {['Description', 'Amount', 'Date', 'Status', ''].map((h, i) => (
                        <span key={i} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{h}</span>
                      ))}
                    </div>

                    {fees.length === 0 ? (
                      <div style={{ padding: '40px 0', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No fees found.</div>
                    ) : fees.map((fee, i) => {
                      const feeStyle = FEE_STYLE[fee.payment_status] || { bg: ALT, text: MUTED };
                      const isUpdating = updatingFeeId === fee.id;
                      const isDeleting = deletingFeeId === fee.id;
                      const desc = fee.notes || fee.fee_type || '—';
                      return (
                        <div key={fee.id} style={{ borderBottom: i < fees.length - 1 ? `1px solid ${RULE}` : 'none' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 80px 200px', padding: '12px 16px', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px' }}>{desc}</span>
                            <span style={{ fontSize: '13px', fontWeight: 700 }}>${parseFloat(fee.amount || 0).toFixed(2)}</span>
                            <span style={{ fontSize: '12px', color: MUTED }}>{formatDate(fee.fee_date || fee.created_at)}</span>
                            <span style={{
                              fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                              padding: '3px 8px', display: 'inline-block',
                              backgroundColor: feeStyle.bg, color: feeStyle.text,
                            }}>{fee.payment_status}</span>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              {fee.payment_status === 'pending' && (
                                <button
                                  onClick={() => updateFeeStatus(fee.id, 'paid')}
                                  disabled={isUpdating}
                                  style={{ padding: '4px 10px', border: `1px solid ${TC}`, background: 'none', cursor: isUpdating ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: TC, opacity: isUpdating ? 0.7 : 1 }}
                                >{isUpdating ? '…' : 'Mark Paid'}</button>
                              )}
                              {fee.payment_status === 'pending' && (
                                <button
                                  onClick={() => updateFeeStatus(fee.id, 'waived')}
                                  disabled={isUpdating}
                                  style={{ padding: '4px 10px', border: `1px solid ${RULE}`, background: 'none', cursor: isUpdating ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: MUTED, opacity: isUpdating ? 0.7 : 1 }}
                                >Waive</button>
                              )}
                              <button
                                onClick={() => setFeeDeleteConfirmId(fee.id)}
                                style={{ padding: '4px 10px', border: '1px solid #F0C0C0', background: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#C03030' }}
                              >Delete</button>
                            </div>
                          </div>

                          {/* Inline fee delete confirm */}
                          {feeDeleteConfirmId === fee.id && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', backgroundColor: '#FFF5F5', borderTop: '1px solid #F0C0C0' }}>
                              <span style={{ fontSize: '12px', color: '#C03030' }}>Delete this fee record? This cannot be undone.</span>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  onClick={() => setFeeDeleteConfirmId(null)}
                                  style={{ padding: '5px 12px', border: `1px solid ${RULE}`, background: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: MUTED }}
                                >Cancel</button>
                                <button
                                  onClick={() => handleDeleteFee(fee.id)}
                                  disabled={isDeleting}
                                  style={{ padding: '5px 12px', border: 'none', backgroundColor: '#C03030', cursor: isDeleting ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#FFF', opacity: isDeleting ? 0.7 : 1 }}
                                >{isDeleting ? 'Deleting…' : 'Confirm Delete'}</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* ── EDIT STUDENT MODAL ── */}
      {showEditModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ backgroundColor: '#FFFFFF', padding: '32px', width: '480px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px' }}>Edit Student</div>

            {[
              { label: 'First Name',          key: 'firstName',          type: 'text'   },
              { label: 'Last Name',           key: 'lastName',           type: 'text'   },
              { label: 'Email',               key: 'email',              type: 'email'  },
              { label: 'Courses Purchased',   key: 'coursePurchaseCount', type: 'number' },
              { label: 'Classes Allocated',   key: 'classesAllocated',   type: 'number' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '6px' }}>{f.label}</label>
                <input
                  type={f.type}
                  value={editForm[f.key]}
                  onChange={e => setEditForm(form => ({ ...form, [f.key]: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '14px', boxSizing: 'border-box', fontFamily: 'Atak, sans-serif', outline: 'none' }}
                />
              </div>
            ))}

            {/* Profile picture */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '6px' }}>Profile Picture</label>
              <input type="file" accept="image/*" onChange={handleProfilePictureUpload} disabled={uploading} id="profile-picture-upload-modal" style={{ display: 'none' }} />
              <label htmlFor="profile-picture-upload-modal" style={{ display: 'inline-block', padding: '8px 14px', border: `1px solid ${RULE}`, fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: uploading ? 'not-allowed' : 'pointer', color: MUTED }}>
                {uploading ? 'Uploading…' : 'Upload Image'}
              </label>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button onClick={() => setShowEditModal(false)} style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveChanges} disabled={saving} style={{ flex: 1, padding: '12px', backgroundColor: INK, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* ── RESCHEDULE / BOOK CLASS MODAL ── */}
      {showMakeupModal && selectedBookingForMakeup && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ backgroundColor: '#FFFFFF', width: '100%', maxWidth: '820px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${RULE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>
                  {selectedBookingForMakeup.isPlaceholder ? 'Book Class' : 'Reschedule Class'}
                </div>
                <div style={{ fontSize: '12px', color: MUTED }}>
                  {selectedBookingForMakeup.isPlaceholder
                    ? 'Using flexible credit'
                    : `${selectedBookingForMakeup.class_type} · ${formatDate(selectedBookingForMakeup.class_date)} · ${selectedBookingForMakeup.start_time}`}
                </div>
              </div>
              <button onClick={resetMakeupModalState} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: MUTED, padding: '0 4px', lineHeight: 1 }}>✕</button>
            </div>

            {/* Info banner */}
            <div style={{ margin: '16px 24px 0', padding: '10px 14px', backgroundColor: TC_LIGHT, border: `1px solid ${TC}`, fontSize: '12px', color: TC_DARK }}>
              {selectedBookingForMakeup.isPlaceholder
                ? 'Select an available date below to book a class using a flexible credit.'
                : 'Select an available date below, then choose the class to reschedule to. The current booking will be replaced.'}
            </div>

            {/* Body: 2-col */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '24px', padding: '20px 24px 24px' }}>

              {/* Calendar */}
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '10px' }}>Select Date</div>
                <CalendarWidget
                  month={makeupCurrentMonth}
                  onMonthChange={setMakeupCurrentMonth}
                  selectedDate={makeupSelectedDate}
                  onDateSelect={d => { setMakeupSelectedDate(d); setRescheduleConfirmId(null); }}
                  availSet={getAvailSet()}
                />
              </div>

              {/* Class list */}
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '10px' }}>
                  {makeupSelectedDate
                    ? `Available on ${makeupSelectedDate.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })}`
                    : 'Available Classes'}
                </div>

                {(() => {
                  const classes = getMakeupClassesForDate(makeupSelectedDate);
                  if (classes.length === 0) {
                    return <div style={{ padding: '40px 0', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No available classes on this date.</div>;
                  }
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {classes.map(c => {
                        const isGlazing = c.classType?.includes('6.6');
                        const spotsLeft = 10 - c.currentEnrollment;
                        const isConfirming = rescheduleConfirmId === c.id;
                        const isReschedulingThis = rescheduling && reschedulingClassId === c.id;
                        return (
                          <div key={c.id} style={{ border: `1px solid ${isGlazing ? '#D4A800' : RULE}`, backgroundColor: isGlazing ? '#FFFBEA' : '#FFF' }}>
                            <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', backgroundColor: ALT, color: INK }}>{getTypeLabel(c.classType)}</span>
                                  <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 700, color: TC_DARK }}>{c.classType}</span>
                                  {isGlazing && <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '2px 7px', backgroundColor: '#D4A800', color: '#FFF' }}>Glazing</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '13px', fontWeight: 700 }}>{c.startTime}{c.endTime ? ` – ${c.endTime}` : ''}</span>
                                  {c.instructor && <span style={{ fontSize: '11px', color: MUTED }}>· {c.instructor}</span>}
                                  <span style={{ fontSize: '11px', color: MUTED }}>· {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</span>
                                </div>
                              </div>
                              <button
                                onClick={() => setRescheduleConfirmId(c.id)}
                                disabled={rescheduling}
                                style={{
                                  padding: '8px 16px',
                                  backgroundColor: isConfirming ? ALT : isGlazing ? '#D4A800' : TC,
                                  color: isConfirming ? MUTED : '#FFF',
                                  border: 'none', cursor: rescheduling ? 'not-allowed' : 'pointer',
                                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                                  opacity: rescheduling ? 0.7 : 1,
                                }}
                              >Confirm</button>
                            </div>

                            {/* Inline reschedule confirm */}
                            {isConfirming && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', backgroundColor: TC_LIGHT, borderTop: `1px solid ${TC}` }}>
                                <span style={{ fontSize: '12px', color: TC_DARK }}>
                                  {selectedBookingForMakeup.isPlaceholder
                                    ? 'Book this class using the flexible credit?'
                                    : 'This will replace the current booking. Continue?'}
                                </span>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button
                                    onClick={() => setRescheduleConfirmId(null)}
                                    style={{ padding: '5px 12px', border: `1px solid ${RULE}`, background: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: MUTED }}
                                  >Cancel</button>
                                  <button
                                    onClick={() => handleRescheduleToMakeup(c.id)}
                                    disabled={isReschedulingThis}
                                    style={{ padding: '5px 12px', border: 'none', backgroundColor: TC, cursor: isReschedulingThis ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#FFF', opacity: isReschedulingThis ? 0.7 : 1 }}
                                  >{isReschedulingThis ? 'Saving…' : (selectedBookingForMakeup.isPlaceholder ? 'Yes, Book' : 'Yes, Reschedule')}</button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: `1px solid ${RULE}`, display: 'flex', justifyContent: 'space-between', gap: '8px', flexShrink: 0 }}>
              {!selectedBookingForMakeup.isPlaceholder && (
                <button
                  onClick={handleConvertToCredit}
                  disabled={deletingBookingId === selectedBookingForMakeup.id}
                  style={{ padding: '10px 20px', backgroundColor: '#9E6200', color: '#FFF', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: deletingBookingId === selectedBookingForMakeup.id ? 0.7 : 1 }}
                >
                  {deletingBookingId === selectedBookingForMakeup.id ? 'Converting…' : 'Convert to Credit'}
                </button>
              )}
              <button
                onClick={resetMakeupModalState}
                style={{ padding: '10px 20px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', cursor: 'pointer', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED, marginLeft: 'auto' }}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
