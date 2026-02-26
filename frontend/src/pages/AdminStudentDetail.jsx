import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Navigation from '../components/Navigation';
import Footer from '../components/Footer';
import ClassCalendar from '../components/ClassCalendar';
import api from '../utils/api';

export default function AdminStudentDetail() {
  const navigate = useNavigate();
  const { email } = useParams();
  const { logout } = useAuth();

  console.log('AdminStudentDetail component loaded, email param:', email);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [student, setStudent] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [fees, setFees] = useState([]);
  const [updatingFeeId, setUpdatingFeeId] = useState(null);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pauseForm, setPauseForm] = useState({
    weeksCompleted: 0,
    reason: ''
  });
  const [editForm, setEditForm] = useState({
    coursePurchaseCount: 0
  });
  const [deletingBookingId, setDeletingBookingId] = useState(null);
  const [togglingMakeupId, setTogglingMakeupId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showMakeupModal, setShowMakeupModal] = useState(false);
  const [selectedBookingForMakeup, setSelectedBookingForMakeup] = useState(null);
  const [allClasses, setAllClasses] = useState([]);
  const [makeupSelectedDate, setMakeupSelectedDate] = useState(new Date());
  const [makeupCurrentMonth, setMakeupCurrentMonth] = useState(new Date());
  const [rescheduling, setRescheduling] = useState(false);
  const [reschedulingClassId, setReschedulingClassId] = useState(null);

  const resetMakeupModalState = () => {
    setShowMakeupModal(false);
    setSelectedBookingForMakeup(null);
    setMakeupSelectedDate(new Date());
    setMakeupCurrentMonth(new Date());
    setRescheduling(false);
    setReschedulingClassId(null);
  };

  useEffect(() => {
    loadStudentData();
  }, [email]);

  const loadStudentData = async () => {
    try {
      setLoading(true);
      const decodedEmail = decodeURIComponent(email);
      console.log('Loading student data for:', decodedEmail);

      // Get student info
      console.log('Fetching student info...');
      const { data: studentData } = await api.get(`/admin/students/${decodedEmail}`);
      console.log('Student data received:', studentData);
      setStudent(studentData);
      setEditForm({
        firstName: studentData.first_name || '',
        lastName: studentData.last_name || '',
        email: studentData.email || '',
        coursePurchaseCount: studentData.course_purchase_count || 0,
        classesAllocated: studentData.classes_allocated || 0
      });

      // Get student bookings
      const { data: bookingsData } = await api.get(`/admin/students/${decodedEmail}/bookings`);
      console.log('Bookings data received:', bookingsData);
      setBookings(bookingsData.bookings || []);

      // Get student enrollment
      if (studentData.id) {
        try {
          const { data: enrollmentData } = await api.get(`/admin/students/${studentData.id}/enrollment`);
          setEnrollment(enrollmentData);
        } catch (err) {
          // No enrollment found - that's okay
          setEnrollment(null);
        }

        // Get student fees
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

  const saveChanges = async () => {
    try {
      setSaving(true);
      const decodedEmail = decodeURIComponent(email);

      await api.put(`/admin/students/${decodedEmail}`, {
        first_name: editForm.firstName.trim(),
        last_name: editForm.lastName.trim(),
        email: editForm.email.trim(),
        course_purchase_count: parseInt(editForm.coursePurchaseCount),
        classes_allocated: parseInt(editForm.classesAllocated)
      });

      alert('Student updated successfully!');

      // If email changed, navigate to new URL
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
    if (!confirm(`Are you sure you want to mark this fee as ${newStatus}?`)) {
      return;
    }

    try {
      setUpdatingFeeId(feeId);
      await api.patch(`/admin/fees/${feeId}/payment`, {
        paymentStatus: newStatus
      });

      alert(`Fee marked as ${newStatus}!`);
      await loadStudentData();
    } catch (error) {
      console.error('Failed to update fee:', error);
      alert('Failed to update fee');
    } finally {
      setUpdatingFeeId(null);
    }
  };

  const handleDeleteBooking = async (bookingId) => {
    if (!confirm('Are you sure you want to delete this booking? This action cannot be undone.')) {
      return;
    }

    try {
      setDeletingBookingId(bookingId);
      await api.delete(`/admin/bookings/${bookingId}`);
      alert('Booking deleted successfully!');
      await loadStudentData();
    } catch (error) {
      console.error('Failed to delete booking:', error);
      alert('Failed to delete booking');
    } finally {
      setDeletingBookingId(null);
    }
  };

  // Helper function to get class category
  const getClassCategory = (classType) => {
    if (!classType) return 'other';
    const upper = classType.toUpperCase();

    if (upper.startsWith('WT')) return 'wheelthrowing-beginner';
    if (upper.startsWith('HB')) return 'handbuilding';
    if (upper.startsWith('KD')) return 'kids';

    const lower = classType.toLowerCase();
    if (lower.includes('wheelthrowing') && lower.includes('beginner')) return 'wheelthrowing-beginner';
    if (lower.includes('wheelthrowing') && lower.includes('intermediate')) return 'wheelthrowing-intermediate';
    if (lower.includes('handbuilding')) return 'handbuilding';
    if (lower.includes('kids') || lower.includes('children')) return 'kids';
    return 'other';
  };

  // Helper function to parse class datetime
  const parseClassDateTime = (classDateStr, timeStr) => {
    try {
      const datePart = classDateStr.split('T')[0];
      let hour24, minutes;

      const time24Match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
      if (time24Match) {
        hour24 = parseInt(time24Match[1]);
        minutes = parseInt(time24Match[2]);
      } else {
        const normalizedTime = timeStr.toUpperCase().trim();
        const match = normalizedTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
        if (!match) {
          throw new Error(`Invalid time format: ${timeStr}`);
        }

        const hours = parseInt(match[1]);
        minutes = parseInt(match[2]);
        const period = match[3];

        hour24 = hours;
        if (period === 'PM' && hours !== 12) {
          hour24 = hours + 12;
        } else if (period === 'AM' && hours === 12) {
          hour24 = 0;
        }
      }

      const [year, month, day] = datePart.split('-').map(Number);
      return new Date(year, month - 1, day, hour24, minutes);
    } catch (error) {
      console.error('Error parsing class datetime:', classDateStr, timeStr, error);
      return new Date(NaN);
    }
  };

  // Get available makeup classes (with glazing class restrictions)
  const getAvailableMakeupClasses = () => {
    if (!selectedBookingForMakeup) return [];

    const isUnbookedCredit = selectedBookingForMakeup.isPlaceholder;

    // Flatten all classes from allClasses
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
          currentEnrollment: cls.bookingCount || 0
        });
      });
    });

    if (isUnbookedCredit) {
      // For unbooked credits, show all available classes with space
      return flatClasses.filter(c => {
        const hasSpace = c.currentEnrollment < 10; // Total capacity is 10
        return hasSpace;
      });
    } else {
      // Admin reschedule: no category restrictions (WT↔HB allowed)
      // Category restrictions only apply to students
      const isDifferentClassId = selectedBookingForMakeup.class_instance_id;

      return flatClasses.filter(c => {
        const isDifferentClass = c.id !== isDifferentClassId;
        const hasSpace = c.currentEnrollment < 10; // Total capacity is 10
        return isDifferentClass && hasSpace;
      });
    }
  };

  // Get classes for a specific date
  const getMakeupClassesForDate = (date) => {
    const makeupClasses = getAvailableMakeupClasses();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    return makeupClasses.filter(c => c.classDate?.startsWith(dateStr));
  };

  const handleOpenMakeupModal = async (booking) => {
    console.log('Opening reschedule modal for booking:', booking);
    setRescheduling(false);
    setReschedulingClassId(null);
    setSelectedBookingForMakeup(booking);
    setShowMakeupModal(true);

    // Load all classes for filtering
    try {
      const { data } = await api.get('/admin/classes');
      console.log('Loaded classes for reschedule:', data.courses?.length, 'courses');
      const loadedCourses = data.courses || [];
      setAllClasses(loadedCourses);

      // Find available classes to auto-navigate to the first available date
      const isUnbookedCredit = booking.isPlaceholder;
      const flatClasses = [];
      loadedCourses.forEach(course => {
        course.classes?.forEach(cls => {
          flatClasses.push({
            id: cls.id,
            classDate: cls.class_date,
            classType: cls.class_type,
            currentEnrollment: cls.bookingCount || 0
          });
        });
      });

      // Only consider current/future classes (2026+)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const futureClasses = flatClasses.filter(c => {
        const classDate = new Date(c.classDate);
        return classDate >= today;
      });

      let availableClasses;
      if (isUnbookedCredit) {
        availableClasses = futureClasses.filter(c => c.currentEnrollment < 10);
      } else {
        const bookingClassType = booking.class_type;
        const classCategory = getClassCategory(bookingClassType);
        availableClasses = futureClasses.filter(c => {
          const sameCategory = getClassCategory(c.classType) === classCategory;
          const isDifferentClass = c.id !== booking.class_instance_id;
          const hasSpace = c.currentEnrollment < 10;
          return sameCategory && isDifferentClass && hasSpace;
        });
      }

      if (availableClasses.length > 0) {
        // Auto-navigate calendar to first available date
        const uniqueDates = [...new Set(availableClasses.map(c => c.classDate.split('T')[0]))];
        const sortedDates = uniqueDates.sort();
        const firstDateStr = sortedDates[0];
        const firstDate = new Date(firstDateStr + 'T12:00:00');
        console.log('Auto-selecting first available date:', firstDateStr);
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
        // Booking an unbooked credit - just create a new booking
        console.log('Booking unbooked credit:', {
          studentId: student.id,
          newClassId: newClassId,
          bookingType: 'makeup'
        });

        const newBookingData = {
          studentId: student.id,
          classInstanceId: newClassId,
          bookingType: 'makeup',
          status: 'booked'
        };
        console.log('Creating new booking:', newBookingData);
        await api.post('/admin/bookings', newBookingData);
        console.log('New booking created successfully');

        alert('Student booked successfully!');
      } else {
        // Rescheduling an existing booking - delete old and create new
        console.log('Rescheduling booking:', {
          oldBookingId: selectedBookingForMakeup.id,
          studentId: student.id,
          newClassId: newClassId,
          bookingType: 'makeup'
        });

        console.log('Deleting old booking:', selectedBookingForMakeup.id);
        await api.delete(`/admin/bookings/${selectedBookingForMakeup.id}`);
        console.log('Old booking deleted successfully');

        const newBookingData = {
          studentId: student.id,
          classInstanceId: newClassId,
          bookingType: 'makeup',
          status: 'booked'
        };
        console.log('Creating new booking:', newBookingData);
        await api.post('/admin/bookings', newBookingData);
        console.log('New booking created successfully');

        alert('Student rescheduled successfully!');
      }

      resetMakeupModalState();
      await loadStudentData();
    } catch (error) {
      console.error('Failed to book/reschedule class:', error);
      console.error('Error details:', error.response?.data);
      alert(`Failed to book/reschedule class: ${error.response?.data?.error || error.message}`);
    } finally {
      setRescheduling(false);
      setReschedulingClassId(null);
    }
  };

  const handleConvertToCredit = async () => {
    if (!selectedBookingForMakeup || selectedBookingForMakeup.isPlaceholder) return;

    if (!confirm('Are you sure you want to convert this booking to a credit? The class booking will be deleted and the credit will become available for future use.')) {
      return;
    }

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

    if (!confirm(`Are you sure you want to pause this student's course?\n\nWeeks completed: ${weeksCompleted}\nWeeks remaining: ${totalWeeks - weeksCompleted}`)) {
      return;
    }

    try {
      setPausing(true);
      await api.post(`/admin/enrollments/${enrollment.id}/pause`, {
        weeksCompleted,
        weeksRemaining: totalWeeks - weeksCompleted,
        reason: pauseForm.reason
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

    if (!confirm(`Are you sure you want to resume this student's course?\n\nThey will need to book ${enrollment.weeks_remaining} more classes to complete their course.`)) {
      return;
    }

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

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append('image', file);

      const { data } = await api.post('/upload/image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (data.success && data.url) {
        setEditForm({ ...editForm, profilePicture: data.url });
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
      console.log('🎭 Impersonating student:', decodedEmail);

      const { data } = await api.post(`/auth/impersonate/${decodedEmail}`);

      if (data.success && data.token) {
        // Store the new impersonation token
        localStorage.setItem('token', data.token);

        console.log('✅ Impersonation successful, redirecting to dashboard...');

        // Redirect to student dashboard and reload to update auth context
        window.location.href = '/dashboard';
      }
    } catch (error) {
      console.error('❌ Impersonation failed:', error);
      alert('Failed to impersonate student');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const parseCourseName = (courseIdentifier, classType) => {
    // If we have a valid course identifier, parse it
    if (courseIdentifier && courseIdentifier !== 'N/A') {
      // Course identifier format: WT2001PM_DL6.1
      // WT = Wheelthrowing, HB = Handbuilding
      // 6 = number of weeks
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
      // Extract base type (remove "Beginner/Extension" etc)
      if (classType.toLowerCase().includes('wheelthrowing')) {
        return 'Wheelthrowing 6 Weeks';
      } else if (classType.toLowerCase().includes('handbuilding')) {
        return 'Handbuilding 4 Weeks';
      }
      return classType;
    }

    return 'N/A';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-text-muted">Loading...</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navigation />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-text-muted">Student not found</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate('/admin/students')}
              className="flex items-center gap-2 text-text-muted hover:text-accent transition-colors"
            >
              <span className="material-symbols-outlined">arrow_back</span>
              <span>Back to Students</span>
            </button>

            <button
              onClick={handleImpersonate}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-normal uppercase tracking-wide hover:bg-gray-200 transition-colors border border-gray-300 rounded flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base">person_play</span>
              <span>View as Member</span>
            </button>
          </div>

          <div>
            <h1 className="text-4xl font-bold text-text mb-2">
              {student.first_name} {student.last_name}
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Student Info Card */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Student Information</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                  <input
                    type="text"
                    value={editForm.firstName}
                    onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                  <input
                    type="text"
                    value={editForm.lastName}
                    onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Profile Picture</label>
                  <div className="flex flex-col items-center gap-3">
                    {editForm.profilePicture || student.profile_picture ? (
                      <img
                        src={editForm.profilePicture || student.profile_picture}
                        alt={`${student.first_name} ${student.last_name}`}
                        className="w-24 h-24 rounded-full object-cover border-2 border-gray-200"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center">
                        <span className="material-symbols-outlined text-gray-400 text-4xl">person</span>
                      </div>
                    )}
                    <div className="w-full">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleProfilePictureUpload}
                        disabled={uploading}
                        className="hidden"
                        id="profile-picture-upload"
                      />
                      <label
                        htmlFor="profile-picture-upload"
                        className={`w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer transition-colors ${
                          uploading
                            ? 'bg-gray-100 cursor-not-allowed'
                            : 'bg-white hover:bg-gray-50'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">
                          {uploading ? 'sync' : 'upload'}
                        </span>
                        <span className="text-sm text-gray-700">
                          {uploading ? 'Uploading...' : 'Upload Image'}
                        </span>
                      </label>
                      {(editForm.profilePicture || student.profile_picture) && (
                        <button
                          onClick={() => setEditForm({ ...editForm, profilePicture: null })}
                          className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                          <span>Remove Picture</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Customer Type</label>
                  <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900">
                    {student.customer_type || 'student'}
                  </div>
                </div>

                {enrollment && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Current Course</label>
                      <div className="px-3 py-2 bg-blue-50 rounded-lg">
                        <div className="text-sm font-medium text-blue-900">{enrollment.course_title}</div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Course Identifier</label>
                      <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900 font-mono text-sm">
                        {enrollment.course_identifier || 'Not set'}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                      <div className="px-3 py-2 bg-gray-50 rounded-lg">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                          enrollment.status === 'active' ? 'bg-green-100 text-green-800' :
                          enrollment.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
                          enrollment.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {enrollment.status}
                        </span>
                        {enrollment.status === 'paused' && (
                          <div className="mt-2 text-xs text-gray-600">
                            Progress: {enrollment.weeks_completed}/{enrollment.number_of_weeks} weeks
                          </div>
                        )}
                      </div>
                    </div>

                    {/* HB Credits Display */}
                    {enrollment.class_credits_allocated > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">HB Credits</label>
                        <div className="px-3 py-2 bg-amber-50 rounded-lg">
                          <div className="grid grid-cols-3 gap-2 mb-2">
                            <div className="text-center">
                              <div className="text-xs text-amber-600 font-medium">Allocated</div>
                              <div className="text-lg font-bold text-amber-900">{enrollment.class_credits_allocated}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-amber-600 font-medium">Used</div>
                              <div className="text-lg font-bold text-amber-900">{enrollment.class_credits_used || 0}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-amber-600 font-medium">Remaining</div>
                              <div className="text-lg font-bold text-amber-900">{enrollment.class_credits_remaining || 0}</div>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-amber-500 h-2 rounded-full transition-all"
                              style={{ width: `${((enrollment.class_credits_used || 0) / enrollment.class_credits_allocated) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {enrollment.status === 'active' && (
                      <button
                        onClick={() => setShowPauseModal(true)}
                        className="w-full px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-sm">pause_circle</span>
                        <span>Pause Course</span>
                      </button>
                    )}

                    {enrollment.status === 'paused' && (
                      <button
                        onClick={handleResumeCourse}
                        disabled={resuming}
                        className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {resuming ? (
                          <>
                            <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                            <span>Resuming...</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-sm">play_arrow</span>
                            <span>Resume Course</span>
                          </>
                        )}
                      </button>
                    )}
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Classes</label>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="px-3 py-2 bg-blue-50 rounded-lg">
                      <div className="text-xs text-blue-600 font-medium mb-1 text-center">Allocated</div>
                      <input
                        type="number"
                        min="0"
                        value={editForm.classesAllocated}
                        onChange={(e) => setEditForm({ ...editForm, classesAllocated: e.target.value })}
                        className="w-full text-center text-lg font-bold text-blue-900 bg-white border border-blue-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="px-3 py-2 bg-gray-50 rounded-lg text-center">
                      <div className="text-xs text-gray-600 font-medium">Attended</div>
                      <div className="text-lg font-bold text-gray-900">
                        {(() => {
                          // Calculate attended from bookings
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);

                          return bookings.filter(booking => {
                            const classDate = new Date(booking.class_date);
                            classDate.setHours(0, 0, 0, 0);
                            const isPast = classDate < today;

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
                        })()}
                      </div>
                    </div>
                    <div className="px-3 py-2 bg-green-50 rounded-lg text-center">
                      <div className="text-xs text-green-600 font-medium">Remaining</div>
                      <div className="text-lg font-bold text-green-900">
                        {(() => {
                          // Calculate attended from bookings
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);

                          const attended = bookings.filter(booking => {
                            const classDate = new Date(booking.class_date);
                            classDate.setHours(0, 0, 0, 0);
                            const isPast = classDate < today;

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

                          return (parseInt(editForm.classesAllocated) || 0) - attended;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Courses Purchased</label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.coursePurchaseCount}
                    onChange={(e) => setEditForm({ ...editForm, coursePurchaseCount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Shopify Customer ID</label>
                  <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-600 font-mono text-sm">
                    {student.shopify_customer_id || 'N/A'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Created</label>
                  <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-600 text-sm">
                    {new Date(student.created_at).toLocaleDateString()}
                  </div>
                </div>

                <button
                  onClick={saveChanges}
                  disabled={saving}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>

          {/* Bookings Card */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Class Bookings ({bookings.length})</h2>

              {/* Status Filter */}
              {bookings.length > 0 && (
                <div className="mb-4">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="all">All</option>
                    <option value="booked">Booked</option>
                    <option value="attended">Attended</option>
                  </select>
                </div>
              )}

              {bookings.length === 0 ? (
                <p className="text-center text-gray-400 py-12">No bookings found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Course</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Day</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Date</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Status</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-900">Reschedule</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-900">Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Filter and sort actual bookings
                        const filteredBookings = [...bookings]
                          .filter(booking => statusFilter === 'all' || booking.status === statusFilter)
                          .sort((a, b) => new Date(a.class_date) - new Date(b.class_date));

                        // Calculate unbooked credits
                        const totalAllocated = parseInt(editForm.classesAllocated) || 0;
                        const totalBooked = bookings.length;
                        const unbookedCount = Math.max(0, totalAllocated - totalBooked);

                        // Create placeholder rows for unbooked credits
                        const unbookedRows = Array.from({ length: unbookedCount }, (_, i) => ({
                          id: `unbooked-${i}`,
                          isPlaceholder: true
                        }));

                        // Combine actual bookings and unbooked placeholders
                        const allRows = [...filteredBookings, ...unbookedRows];

                        return allRows.map((booking, index) => {
                          // Render unbooked placeholder row
                          if (booking.isPlaceholder) {
                            return (
                              <tr key={booking.id} className="border-b border-gray-100 bg-yellow-50">
                                <td className="py-3 px-4">
                                  <span className="font-mono text-sm text-gray-500 bg-gray-200 px-2 py-1 rounded">
                                    -
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-gray-400">
                                  -
                                </td>
                                <td className="py-3 px-4 text-gray-400">
                                  -
                                </td>
                                <td className="py-3 px-4">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                    unbooked
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <button
                                    onClick={() => handleOpenMakeupModal(booking)}
                                    className="px-3 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors"
                                  >
                                    <span>Reschedule</span>
                                  </button>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <button
                                    disabled
                                    className="px-3 py-1 text-xs bg-gray-300 text-gray-500 rounded cursor-not-allowed"
                                  >
                                    <span>Delete</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          }

                          // Render actual booking row
                          const date = new Date(booking.class_date);
                          const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
                          const courseName = parseCourseName(booking.course_identifier, booking.class_type);
                          const time = `${booking.start_time || '7:00pm'} - ${booking.end_time || '9:30pm'}`;

                          // Check if class is in the past
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const classDate = new Date(booking.class_date);
                          classDate.setHours(0, 0, 0, 0);
                          const isPast = classDate < today;

                          // Display "attended" for past classes that are marked as "booked"
                          const displayStatus = (isPast && booking.status === 'booked') ? 'attended' : booking.status;

                          return (
                            <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                              <td className="py-3 px-4">
                                <span className="font-mono text-sm text-gray-900 bg-gray-100 px-2 py-1 rounded">
                                  {courseName}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-gray-600">
                                {dayOfWeek}
                              </td>
                              <td className="py-3 px-4 text-gray-600">
                                {date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  displayStatus === 'completed' ? 'bg-green-100 text-green-800' :
                                  displayStatus === 'attended' ? 'bg-green-100 text-green-800' :
                                  displayStatus === 'booked' ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {displayStatus}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <button
                                  onClick={() => handleOpenMakeupModal(booking)}
                                  className={`px-3 py-1 text-xs rounded transition-colors ${
                                    booking.booking_type === 'makeup'
                                      ? 'bg-purple-500 text-white hover:bg-purple-600'
                                      : 'bg-orange-500 text-white hover:bg-orange-600'
                                  }`}
                                >
                                  <span>Reschedule</span>
                                </button>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <button
                                  onClick={() => handleDeleteBooking(booking.id)}
                                  disabled={deletingBookingId === booking.id}
                                  className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <span>{deletingBookingId === booking.id ? 'Deleting...' : 'Delete'}</span>
                                </button>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fees Card - Full Width */}
        {fees.length > 0 && (
          <div className="mt-6">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Reschedule Fees</h2>
                <div className="flex items-center gap-4">
                  <div className="text-sm">
                    <span className="text-gray-600">Total Pending:</span>
                    <span className="ml-2 font-bold text-red-600">
                      ${fees.filter(f => f.payment_status === 'pending').reduce((sum, f) => sum + parseFloat(f.amount), 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">Total Paid:</span>
                    <span className="ml-2 font-bold text-green-600">
                      ${fees.filter(f => f.payment_status === 'paid').reduce((sum, f) => sum + parseFloat(f.amount), 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Fee Date</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Type</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Amount</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Status</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Notes</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fees.map((fee) => (
                      <tr key={fee.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4 text-gray-600 text-sm">
                          {formatDate(fee.fee_date)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                            {fee.fee_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-gray-900">
                          ${parseFloat(fee.amount).toFixed(2)}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                            fee.payment_status === 'paid' ? 'bg-green-100 text-green-800' :
                            fee.payment_status === 'waived' ? 'bg-gray-100 text-gray-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {fee.payment_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-600 text-sm max-w-xs truncate">
                          {fee.notes || '-'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {fee.payment_status === 'pending' && (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => updateFeeStatus(fee.id, 'paid')}
                                disabled={updatingFeeId === fee.id}
                                className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                <span>Mark Paid</span>
                              </button>
                              <button
                                onClick={() => updateFeeStatus(fee.id, 'waived')}
                                disabled={updatingFeeId === fee.id}
                                className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-sm">cancel</span>
                                <span>Waive</span>
                              </button>
                            </div>
                          )}
                          {fee.payment_status === 'paid' && fee.payment_date && (
                            <span className="text-xs text-gray-500">
                              Paid {formatDate(fee.payment_date)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Makeup Class Modal */}
      {showMakeupModal && selectedBookingForMakeup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto pointer-events-none">
          <div className="relative isolate pointer-events-auto z-[60] bg-white border border-gray-200 shadow-lg w-full max-w-5xl my-8 rounded-xl">
            <div className="relative z-10 p-6 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold uppercase text-gray-900">
                    {selectedBookingForMakeup.isPlaceholder ? 'Book Class' : 'Reschedule Class'}
                  </h3>
                  {!selectedBookingForMakeup.isPlaceholder && (
                    <p className="text-sm text-gray-600 mt-1">
                      {selectedBookingForMakeup.class_type} - {formatDate(selectedBookingForMakeup.class_date)} at {selectedBookingForMakeup.start_time}
                    </p>
                  )}
                  {selectedBookingForMakeup.isPlaceholder && (
                    <p className="text-sm text-gray-600 mt-1">
                      Using flexible credit
                    </p>
                  )}
                </div>
                <button
                  className="p-2 hover:bg-gray-100 rounded"
                  type="button"
                  onClick={resetMakeupModalState}
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>

            <div className="relative z-10 p-6">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-gray-700">
                  {selectedBookingForMakeup.isPlaceholder
                    ? 'Select an available date below to book a class using a flexible credit.'
                    : 'Select an available date below to see classes you can reschedule to. The current booking will be canceled and replaced with the new class.'}
                </p>
              </div>

              <div className="relative z-10 grid md:grid-cols-2 gap-6 items-start">
                {/* Calendar Section */}
                <div className="min-w-0 relative z-0 overflow-hidden">
                  <ClassCalendar
                    currentMonth={makeupCurrentMonth}
                    onMonthChange={setMakeupCurrentMonth}
                    onDateSelect={(date) => setMakeupSelectedDate(date)}
                    selectedDate={makeupSelectedDate}
                    getClassesForDate={(date) => {
                      const classesOnDate = getMakeupClassesForDate(date);
                      return classesOnDate.map(c => ({
                        ...c,
                        class_type: c.classType,
                        fullCourseIdentifier: c.classType
                      }));
                    }}
                    highlightedDates={[]}
                    classTypeConfig={{
                      'all': { bgLight: 'bg-purple-500/20' },
                      'wheelthrowing-beginner': { bgLight: 'bg-purple-500/20' },
                      'wheelthrowing-intermediate': { bgLight: 'bg-purple-500/20' },
                      'handbuilding': { bgLight: 'bg-purple-500/20' },
                      'kids': { bgLight: 'bg-purple-500/20' }
                    }}
                    getClassCategory={getClassCategory}
                    classTypeFilter="all"
                    isAdminView={true}
                    isEnrolled={() => false}
                  />
                </div>

                {/* Class List Section */}
                <div className="min-w-0 relative z-10">
                  <p className="text-sm font-bold text-gray-700 mb-3 uppercase">
                    Available Classes on {formatDate(makeupSelectedDate)}
                  </p>
                  <div className="relative z-20 space-y-3 max-h-[400px] overflow-y-auto pr-2">
                    {getMakeupClassesForDate(makeupSelectedDate).length === 0 ? (
                      <p className="text-gray-500 text-center py-8">
                        No available classes on this date. Please select another date.
                      </p>
                    ) : (
                      getMakeupClassesForDate(makeupSelectedDate).map((classItem) => {
                        const classDate = new Date(classItem.classDate);
                        const spotsLeft = 10 - classItem.currentEnrollment;

                        // Check if this is a glazing class (Week 6.6)
                        const isGlazingClass = classItem.classType?.includes('6.6');

                        return (
                          <div
                            key={classItem.id}
                            onClick={() => {
                              if (!rescheduling) handleRescheduleToMakeup(classItem.id);
                            }}
                            className={`p-4 border rounded flex flex-col gap-2 cursor-pointer ${
                              isGlazingClass
                                ? 'bg-amber-50 border-amber-900'
                                : 'bg-gray-50 border-gray-200'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className={`font-bold text-sm ${
                                    isGlazingClass ? 'text-amber-900' : 'text-gray-900'
                                  }`}>{classItem.classType}</p>
                                  {isGlazingClass && (
                                    <span className="text-xs bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                                      Glazing
                                    </span>
                                  )}
                                </div>
                                <p className={`text-xs ${
                                  isGlazingClass ? 'text-amber-800' : 'text-gray-600'
                                }`}>
                                  {classItem.startTime} - {classItem.endTime}
                                </p>
                                <p className={`text-xs ${
                                  isGlazingClass ? 'text-amber-800' : 'text-gray-600'
                                }`}>
                                  with {classItem.instructor}
                                </p>
                                <p className={`text-xs mt-1 ${
                                  isGlazingClass ? 'text-amber-700' : 'text-gray-500'
                                }`}>
                                  {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} available
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRescheduleToMakeup(classItem.id);
                                }}
                                disabled={rescheduling}
                                className={`relative z-20 shrink-0 flex min-w-[70px] cursor-pointer items-center justify-center h-8 px-3 text-white text-xs font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed ${
                                  isGlazingClass
                                    ? 'bg-amber-700 hover:bg-amber-800'
                                    : 'bg-purple-500 hover:bg-purple-600'
                                }`}
                              >
                                {rescheduling && reschedulingClassId === classItem.id ? (
                                  <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                                ) : (
                                  <span className="truncate">Select</span>
                                )}
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

            <div className="relative z-20 p-6 bg-gray-50 border-t border-gray-200 flex justify-between">
              {/* Convert to Credit button - only show for actual bookings */}
              {!selectedBookingForMakeup.isPlaceholder && (
                <button
                  onClick={handleConvertToCredit}
                  disabled={deletingBookingId === selectedBookingForMakeup.id}
                  className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden h-10 px-4 bg-yellow-500 text-white text-sm font-bold rounded hover:bg-yellow-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>{deletingBookingId === selectedBookingForMakeup.id ? 'Converting...' : 'Convert to Credit'}</span>
                </button>
              )}

              <button
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden h-10 px-4 bg-gray-300 text-gray-700 text-sm font-bold rounded hover:bg-gray-400"
                type="button"
                onClick={resetMakeupModalState}
              >
                <span>Cancel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause Course Modal */}
      {showPauseModal && enrollment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Pause Course</h3>

            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-4">
                Pausing <strong>{student.first_name} {student.last_name}</strong>'s enrollment in <strong>{enrollment.course_title}</strong>
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <div className="text-sm text-blue-900">
                  <div className="font-medium mb-1">Course: {enrollment.course_identifier}</div>
                  <div>Total weeks: {enrollment.number_of_weeks}</div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Weeks Completed<span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={enrollment.number_of_weeks - 1}
                    value={pauseForm.weeksCompleted}
                    onChange={(e) => setPauseForm({ ...pauseForm, weeksCompleted: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                    placeholder="e.g., 3"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Remaining weeks: {enrollment.number_of_weeks - (parseInt(pauseForm.weeksCompleted) || 0)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reason (optional)
                  </label>
                  <textarea
                    value={pauseForm.reason}
                    onChange={(e) => setPauseForm({ ...pauseForm, reason: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                    rows="3"
                    placeholder="e.g., Travel, medical leave, etc."
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowPauseModal(false);
                  setPauseForm({ weeksCompleted: 0, reason: '' });
                }}
                disabled={pausing}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePauseCourse}
                disabled={pausing}
                className="flex-1 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {pausing ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                    <span>Pausing...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">pause_circle</span>
                    <span>Pause Course</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
