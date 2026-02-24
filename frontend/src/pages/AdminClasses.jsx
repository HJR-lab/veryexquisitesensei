import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Navigation from '../components/Navigation';
import Footer from '../components/Footer';
import ClassCalendar from '../components/ClassCalendar';
import api from '../utils/api';

export default function AdminClasses() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [courses, setCourses] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null); // null = show overview
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [classTypeFilter, setClassTypeFilter] = useState('all');
  const [cohortFilter, setCohortFilter] = useState('all'); // 'all', 'cohort1', 'cohort2'
  const [viewMode, setViewMode] = useState('overview'); // 'overview' or 'date'
  const [expandedClassId, setExpandedClassId] = useState(null);
  const [classMembers, setClassMembers] = useState({});
  const [absentMembers, setAbsentMembers] = useState({});
  const [loadingMembers, setLoadingMembers] = useState({});
  const [highlightedCourseDates, setHighlightedCourseDates] = useState([]);
  const [showCourseMenu, setShowCourseMenu] = useState(false);
  const [courseMenuPosition, setCourseMenuPosition] = useState({ x: 0, y: 0 });
  const [courseMenuOptions, setCourseMenuOptions] = useState([]);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [reschedulingBooking, setReschedulingBooking] = useState(null);
  const [rescheduleData, setRescheduleData] = useState({
    newClassInstanceId: null,
    reason: '',
    isGlazing: false
  });
  const [availableClasses, setAvailableClasses] = useState([]);
  const [rescheduling, setRescheduling] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [addingToClassId, setAddingToClassId] = useState(null);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [allStudents, setAllStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);
  const [showEditClassModal, setShowEditClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [editClassData, setEditClassData] = useState({
    classDate: '',
    startTime: '',
    endTime: '',
    instructor: '',
    maxCapacity: 12
  });
  const [updatingClass, setUpdatingClass] = useState(false);
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);
  const [creatingClass, setCreatingClass] = useState(false);
  const [createClassData, setCreateClassData] = useState({
    startTimeHour: '',
    startTimeMinute: '',
    startTimePeriod: 'AM',
    endTimeHour: '',
    endTimeMinute: '',
    endTimePeriod: 'PM',
    classType: '',
    instructor: '',
    room: '',
    teachingCapacity: 10,
    makeUpCapacity: 2,
    glazingCapacity: 14,
    numberOfClasses: 1,
    classDates: ['']
  });

  useEffect(() => {
    loadCourses();
  }, []);

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

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Determine cohort from class date
  const getClassCohort = (classDate) => {
    if (!classDate) return null;

    const date = new Date(classDate);
    const day = date.getDate();
    const month = date.getMonth(); // 0 = January, 1 = February, 2 = March

    // Cohort 1: Jan 17, 19, 20, 22, 23
    const cohort1Dates = [17, 19, 20, 22, 23];
    if (month === 0 && cohort1Dates.includes(day)) {
      return 'cohort1';
    }

    // Cohort 2: Feb 28, Mar 1, 5, 6, 10
    if (month === 1 && day === 28) { // Feb 28
      return 'cohort2';
    }
    const cohort2MarDates = [1, 5, 6, 10];
    if (month === 2 && cohort2MarDates.includes(day)) { // Mar 1, 5, 6, 10
      return 'cohort2';
    }

    return null; // Outside defined cohorts
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

  const getWeekNumberFromClassType = (classType) => {
    const match = classType?.match(/Week (\d)/);
    return match ? parseInt(match[1]) : null;
  };

  // Get all dates in a course
  const getCourseDates = (clickedClass) => {
    if (!clickedClass || !clickedClass.baseCourseIdentifier) return [];

    // Use the base courseIdentifier to find all classes in same course
    // e.g., "WT1210AM_DL6" for all weeks of that course
    const baseCourseId = clickedClass.baseCourseIdentifier;

    // Find the course with this identifier
    const matchingCourse = courses.find(c => c.identifier === baseCourseId);

    if (!matchingCourse) return [];

    // Extract unique dates (YYYY-MM-DD format) from all classes in the course
    const dates = matchingCourse.classes.map(cls => cls.class_date.split('T')[0]);

    return [...new Set(dates)]; // Remove duplicates
  };

  const toggleClassMembers = async (classInstance) => {
    // If already expanded, collapse it
    if (expandedClassId === classInstance.id) {
      setExpandedClassId(null);
      return;
    }

    // Expand and load members if not already loaded
    setExpandedClassId(classInstance.id);

    if (!classMembers[classInstance.id]) {
      try {
        setLoadingMembers(prev => ({ ...prev, [classInstance.id]: true }));
        const { data } = await api.get(`/admin/classes/${classInstance.id}/members`);
        setClassMembers(prev => ({
          ...prev,
          [classInstance.id]: data.members || []
        }));
        setAbsentMembers(prev => ({
          ...prev,
          [classInstance.id]: data.absentMembers || []
        }));
      } catch (error) {
        console.error('Failed to load class members:', error);
      } finally {
        setLoadingMembers(prev => ({ ...prev, [classInstance.id]: false }));
      }
    }
  };

  const loadAvailableClassesForReschedule = async (currentClass, studentId) => {
    // Find classes of the same type (same category) that haven't happened yet (based on today)
    const category = getClassCategory(currentClass.class_type);

    // Compare to TODAY, not the current class date
    // This allows rescheduling to earlier classes if they haven't happened yet
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison

    // Get student's existing bookings to prevent double-booking
    let studentBookingClassIds = [];
    try {
      const { data } = await api.get(`/admin/students/${studentId}/bookings`);
      studentBookingClassIds = data.bookings.map(booking => booking.class_instance_id);
    } catch (error) {
      console.error('Failed to load student bookings:', error);
    }

    const available = [];
    courses.forEach(course => {
      course.classes?.forEach(cls => {
        const clsDate = new Date(cls.class_date);
        clsDate.setHours(0, 0, 0, 0); // Set to start of day for comparison
        const clsCategory = getClassCategory(cls.class_type);

        // Include if:
        // 1. Same category (or glazing class can go to any glazing)
        // 2. Class date is today or in the future (hasn't happened yet)
        // 3. Not full
        // 4. Not the current class
        // 5. Student is not already booked in this class
        if (
          clsCategory === category &&
          clsDate >= today &&  // Compare to today, not the original class date
          cls.bookingCount < cls.max_capacity &&
          cls.id !== currentClass.id &&
          !studentBookingClassIds.includes(cls.id)  // Prevent double-booking
        ) {
          available.push({
            ...cls,
            baseCourseIdentifier: course.identifier,
            fullCourseIdentifier: cls.courseIdentifier
          });
        }
      });
    });

    // Sort by date
    available.sort((a, b) => new Date(a.class_date) - new Date(b.class_date));

    setAvailableClasses(available);
  };

  const handleReschedule = async () => {
    if (!rescheduleData.newClassInstanceId) {
      alert('Please select a new class');
      return;
    }

    if (!confirm(`Are you sure you want to reschedule ${reschedulingBooking.studentName} to the selected class?`)) {
      return;
    }

    try {
      setRescheduling(true);

      // Calculate fee based on whether it's within the same cohort period
      const selectedClass = availableClasses.find(cls => cls.id === rescheduleData.newClassInstanceId);

      // Current cohort period: Jan 17 - Mar 3, 2026
      // All 6 courses running during this period
      // Compare date strings (YYYY-MM-DD) instead of Date objects to avoid timezone issues
      const cohortStartDateStr = '2026-01-17';
      const cohortEndDateStr = '2026-03-03';

      const originalDateStr = reschedulingBooking.classInstance.class_date.split('T')[0];
      const newDateStr = selectedClass.class_date.split('T')[0];

      // Check if both classes are within the same cohort period
      const isOriginalInPeriod = originalDateStr >= cohortStartDateStr && originalDateStr <= cohortEndDateStr;
      const isNewInPeriod = newDateStr >= cohortStartDateStr && newDateStr <= cohortEndDateStr;
      const isSamePeriod = isOriginalInPeriod && isNewInPeriod;

      // Fee logic:
      // - FREE if rescheduling within the same cohort period (Jan 17 - Mar 3)
      // - $40 if rescheduling to a different cohort period (outside Jan 17 - Mar 3)
      // - FREE for glazing reschedules
      const fee = rescheduleData.isGlazing || isSamePeriod ? 0 : 40;

      await api.post(`/admin/bookings/${reschedulingBooking.bookingId}/reschedule`, {
        newClassInstanceId: rescheduleData.newClassInstanceId,
        rescheduleReason: rescheduleData.reason,
        fee: fee,
        isGlazingReschedule: rescheduleData.isGlazing,
        isAdminReschedule: true  // Flag to indicate this is an admin reschedule
      });

      // Reload courses to update booking counts
      await loadCourses();

      // Clear cached members for both old and new classes
      setClassMembers(prev => {
        const updated = { ...prev };
        delete updated[reschedulingBooking.classInstance.id];
        delete updated[rescheduleData.newClassInstanceId];
        return updated;
      });

      alert(`Successfully rescheduled! ${fee > 0 ? `Fee: $${fee}` : 'No fee applied'}`);
      setShowRescheduleModal(false);
      setReschedulingBooking(null);
      setRescheduleData({
        newClassInstanceId: null,
        reason: '',
        isGlazing: false
      });
    } catch (error) {
      console.error('Failed to reschedule:', error);
      alert('Failed to reschedule booking. Please try again.');
    } finally {
      setRescheduling(false);
    }
  };

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
    if (allStudents.length === 0) {
      loadStudents();
    }
  };

  const handleAddStudent = async (studentId) => {
    if (!confirm('Are you sure you want to add this student to the class?')) {
      return;
    }

    try {
      setAddingStudent(true);
      await api.post(`/admin/classes/${addingToClassId}/add-student`, {
        studentId
      });

      // Reload members for this class FIRST to show updated list
      const classId = addingToClassId;
      if (expandedClassId === classId) {
        try {
          setLoadingMembers(prev => ({ ...prev, [classId]: true }));
          const { data } = await api.get(`/admin/classes/${classId}/members`);
          setClassMembers(prev => ({
            ...prev,
            [classId]: data.members || []
          }));
          setAbsentMembers(prev => ({
            ...prev,
            [classId]: data.absentMembers || []
          }));
        } catch (error) {
          console.error('Failed to reload class members:', error);
        } finally {
          setLoadingMembers(prev => ({ ...prev, [classId]: false }));
        }
      }

      // THEN reload courses to update booking counts
      await loadCourses();

      // Clear cached members for other classes if not expanded
      if (expandedClassId !== classId) {
        setClassMembers(prev => {
          const updated = { ...prev };
          delete updated[classId];
          return updated;
        });
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
    if (!confirm(`Are you sure you want to remove ${studentName} from this class?`)) {
      return;
    }

    try {
      console.log('🗑️ Removing student:', studentName, 'Booking ID:', bookingId);
      const deleteResponse = await api.delete(`/admin/bookings/${bookingId}`);
      console.log('✅ Delete response:', deleteResponse.data);

      // Small delay to ensure database transaction completes
      await new Promise(resolve => setTimeout(resolve, 100));

      // Clear cached members first to force fresh fetch
      setClassMembers(prev => {
        const updated = { ...prev };
        delete updated[classId];
        return updated;
      });
      setAbsentMembers(prev => {
        const updated = { ...prev };
        delete updated[classId];
        return updated;
      });

      // Reload members for this class FIRST to show updated list
      if (expandedClassId === classId) {
        try {
          setLoadingMembers(prev => ({ ...prev, [classId]: true }));
          console.log('🔄 Reloading members for class:', classId);
          const { data } = await api.get(`/admin/classes/${classId}/members?t=${Date.now()}`);
          console.log('📋 Updated member list:', data.members);
          console.log('👻 Absent members:', data.absentMembers);
          setClassMembers(prev => ({
            ...prev,
            [classId]: data.members || []
          }));
          setAbsentMembers(prev => ({
            ...prev,
            [classId]: data.absentMembers || []
          }));
        } catch (error) {
          console.error('Failed to reload class members:', error);
        } finally {
          setLoadingMembers(prev => ({ ...prev, [classId]: false }));
        }
      }

      // THEN reload courses to update booking counts
      await loadCourses();

      // Clear cached members for other classes if not expanded
      if (expandedClassId !== classId) {
        setClassMembers(prev => {
          const updated = { ...prev };
          delete updated[classId];
          return updated;
        });
      }

      alert('Student removed successfully!');
    } catch (error) {
      console.error('Failed to remove student:', error);
      alert(error.response?.data?.error || 'Failed to remove student. Please try again.');
    }
  };

  const getFilteredStudents = () => {
    if (!studentSearchQuery.trim()) {
      return allStudents;
    }

    const query = studentSearchQuery.toLowerCase();
    return allStudents.filter(student => {
      const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
      const email = student.email.toLowerCase();
      return fullName.includes(query) || email.includes(query);
    });
  };

  const handleOpenEditClassModal = (classInstance) => {
    setEditingClass(classInstance);
    setEditClassData({
      classDate: classInstance.class_date.split('T')[0], // Convert to YYYY-MM-DD
      startTime: classInstance.start_time,
      endTime: classInstance.end_time,
      instructor: classInstance.instructor,
      maxCapacity: classInstance.max_capacity || 12
    });
    setShowEditClassModal(true);
  };

  const handleUpdateClass = async () => {
    if (!editClassData.classDate || !editClassData.startTime || !editClassData.endTime || !editClassData.instructor) {
      alert('Please fill in all fields');
      return;
    }

    if (!confirm('Are you sure you want to update this class? Note: The class identifier will NOT be updated to match the new date/time.')) {
      return;
    }

    try {
      setUpdatingClass(true);
      await api.patch(`/admin/classes/${editingClass.id}`, {
        classDate: editClassData.classDate,
        startTime: editClassData.startTime,
        endTime: editClassData.endTime,
        instructor: editClassData.instructor,
        maxCapacity: editClassData.maxCapacity
      });

      // Reload courses to update data
      await loadCourses();

      alert('Class updated successfully!');
      setShowEditClassModal(false);
      setEditingClass(null);
      setEditClassData({
        classDate: '',
        startTime: '',
        endTime: '',
        instructor: '',
        maxCapacity: 12
      });
    } catch (error) {
      console.error('Failed to update class:', error);
      alert(error.response?.data?.error || 'Failed to update class. Please try again.');
    } finally {
      setUpdatingClass(false);
    }
  };

  const handleNumberOfClassesChange = (newNumber) => {
    const num = Math.max(1, Math.min(12, parseInt(newNumber) || 1));
    const currentDates = createClassData.classDates;

    // Adjust array length
    const newDates = Array(num).fill('').map((_, idx) => currentDates[idx] || '');

    setCreateClassData({
      ...createClassData,
      numberOfClasses: num,
      classDates: newDates
    });
  };

  const handleClassDateChange = (index, date) => {
    const newDates = [...createClassData.classDates];
    newDates[index] = date;
    setCreateClassData({
      ...createClassData,
      classDates: newDates
    });
  };

  const formatTimeForAPI = (hour, minute, period) => {
    if (!hour || !minute || !period) return '';
    return `${hour}:${minute}${period.toLowerCase()}`;
  };

  const handleCreateClass = async () => {
    // Validate all fields
    if (!createClassData.startTimeHour || !createClassData.startTimeMinute ||
        !createClassData.endTimeHour || !createClassData.endTimeMinute ||
        !createClassData.classType || !createClassData.instructor || !createClassData.room) {
      alert('Please fill in all required fields');
      return;
    }

    // Validate all dates are filled
    const emptyDates = createClassData.classDates.filter(d => !d);
    if (emptyDates.length > 0) {
      alert('Please select dates for all classes');
      return;
    }

    if (!confirm(`Are you sure you want to create this new course with ${createClassData.numberOfClasses} class${createClassData.numberOfClasses > 1 ? 'es' : ''}?`)) {
      return;
    }

    try {
      setCreatingClass(true);

      // Format times for API
      const startTime = formatTimeForAPI(createClassData.startTimeHour, createClassData.startTimeMinute, createClassData.startTimePeriod);
      const endTime = formatTimeForAPI(createClassData.endTimeHour, createClassData.endTimeMinute, createClassData.endTimePeriod);

      const requestData = {
        ...createClassData,
        startTime,
        endTime
      };

      await api.post('/admin/classes', requestData);

      // Reload courses to show new classes
      await loadCourses();

      alert(`New course "${createClassData.classType}" created successfully with ${createClassData.numberOfClasses} class${createClassData.numberOfClasses > 1 ? 'es' : ''}!`);
      setShowCreateClassModal(false);
      setCreateClassData({
        startTimeHour: '',
        startTimeMinute: '',
        startTimePeriod: 'AM',
        endTimeHour: '',
        endTimeMinute: '',
        endTimePeriod: 'PM',
        classType: '',
        instructor: '',
        room: '',
        teachingCapacity: 10,
        makeUpCapacity: 2,
        glazingCapacity: 14,
        numberOfClasses: 1,
        classDates: ['']
      });
    } catch (error) {
      console.error('Failed to create classes:', error);
      alert(error.response?.data?.error || 'Failed to create classes. Please try again.');
    } finally {
      setCreatingClass(false);
    }
  };

  const handleDeleteClass = async (classId, classType) => {
    if (!confirm(`Are you sure you want to delete this class (${classType})? This action cannot be undone.`)) {
      return;
    }

    try {
      await api.delete(`/admin/classes/${classId}`);

      // Reload courses to update data
      await loadCourses();

      alert('Class deleted successfully!');
    } catch (error) {
      console.error('Failed to delete class:', error);
      alert(error.response?.data?.error || 'Failed to delete class. Please try again.');
    }
  };

  const getClassesForDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Flatten all class instances from all courses
    const allClasses = [];
    courses.forEach(course => {
      course.classes?.forEach(cls => {
        if (cls.class_date?.startsWith(dateStr)) {
          allClasses.push({
            ...cls,
            baseCourseIdentifier: course.identifier, // e.g., "WT1210AM_DL6"
            fullCourseIdentifier: cls.courseIdentifier // e.g., "WT1210AM_DL6.1"
          });
        }
      });
    });

    // Apply filters
    return allClasses.filter(c => {
      // Filter 1: Class type
      if (classTypeFilter !== 'all' && getClassCategory(c.class_type) !== classTypeFilter) {
        return false;
      }

      // Filter 2: Cohort
      if (cohortFilter !== 'all' && getClassCohort(c.class_date) !== cohortFilter) {
        return false;
      }

      return true;
    });
  };

  // Get course overview (all courses with total enrollment)
  const getCourseOverview = () => {
    const courseMap = new Map();

    courses.forEach(course => {
      // Skip if no classes
      if (!course.classes || course.classes.length === 0) {
        return;
      }

      const firstClass = course.classes[0];
      const category = getClassCategory(firstClass.class_type);

      // Filter 1: Skip Handbuilding classes (only show WT courses in overview)
      // HB classes are drop-in sessions, not 6-week courses like WT
      if (category === 'handbuilding') {
        return;
      }

      // Filter 2: Apply classTypeFilter (if not 'all')
      if (classTypeFilter !== 'all' && category !== classTypeFilter) {
        return;
      }

      // Filter 3: Apply cohortFilter (if not 'all')
      if (cohortFilter !== 'all') {
        // Check if ANY class in this course belongs to the selected cohort
        const hasClassInCohort = course.classes.some(cls => {
          return getClassCohort(cls.class_date) === cohortFilter;
        });

        if (!hasClassInCohort) {
          return;
        }
      }

      // Calculate total enrollment across all classes in this course
      let totalEnrollment = 0;
      let totalMakeup = 0;
      let maxCapacity = 0;
      let sampleClass = null;

      course.classes?.forEach(cls => {
        totalEnrollment += cls.bookingCount || 0;
        if (sampleClass === null) {
          sampleClass = cls;
          maxCapacity = cls.max_capacity || 12;
        }
      });

      courseMap.set(course.identifier, {
        identifier: course.identifier,
        classes: course.classes,
        totalEnrollment,
        totalMakeup,
        maxCapacity,
        numberOfWeeks: course.classes?.length || 0,
        sampleClass
      });
    });

    return Array.from(courseMap.values());
  };

  const classTypeConfig = {
    'all': {
      label: 'All Classes',
      bgActive: 'bg-gray-500',
      border: 'border-gray-500',
      text: 'text-gray-700',
      bgLight: 'bg-gray-500/20'
    },
    'wheelthrowing-beginner': {
      label: 'Wheelthrowing Beginner',
      bgActive: 'bg-orange-500',
      border: 'border-orange-500',
      text: 'text-orange-700',
      bgLight: 'bg-orange-500/20'
    },
    'wheelthrowing-intermediate': {
      label: 'Wheelthrowing Intermediate',
      bgActive: 'bg-cyan-500',
      border: 'border-cyan-500',
      text: 'text-cyan-700',
      bgLight: 'bg-cyan-500/20'
    },
    'handbuilding': {
      label: 'Handbuilding',
      bgActive: 'bg-black',
      border: 'border-black',
      text: 'text-black',
      bgLight: 'bg-black/20'
    },
    'kids': {
      label: 'Kids Classes',
      bgActive: 'bg-yellow-500',
      border: 'border-yellow-500',
      text: 'text-yellow-700',
      bgLight: 'bg-yellow-500/20'
    }
  };

  const classesForSelectedDate = selectedDate ? getClassesForDate(selectedDate) : [];
  const courseOverview = getCourseOverview();

  // Auto-load members for classes (either for selected date or overview)
  useEffect(() => {
    const loadMembersForAllClasses = async () => {
      if (viewMode === 'date' && classesForSelectedDate.length > 0) {
        // Load members for classes on selected date
        for (const classInstance of classesForSelectedDate) {
          if (!classMembers[classInstance.id]) {
            try {
              setLoadingMembers(prev => ({ ...prev, [classInstance.id]: true }));
              const { data } = await api.get(`/admin/classes/${classInstance.id}/members`);
              setClassMembers(prev => ({
                ...prev,
                [classInstance.id]: data.members || []
              }));
              setAbsentMembers(prev => ({
                ...prev,
                [classInstance.id]: data.absentMembers || []
              }));
            } catch (error) {
              console.error('Failed to load class members:', error);
            } finally {
              setLoadingMembers(prev => ({ ...prev, [classInstance.id]: false }));
            }
          }
        }
      } else if (viewMode === 'overview') {
        // Load member counts for all courses
        for (const course of courseOverview) {
          for (const cls of course.classes || []) {
            if (!classMembers[cls.id]) {
              try {
                setLoadingMembers(prev => ({ ...prev, [cls.id]: true }));
                const { data } = await api.get(`/admin/classes/${cls.id}/members`);
                setClassMembers(prev => ({
                  ...prev,
                  [cls.id]: data.members || []
                }));
                setAbsentMembers(prev => ({
                  ...prev,
                  [cls.id]: data.absentMembers || []
                }));
              } catch (error) {
                console.error('Failed to load class members:', error);
              } finally {
                setLoadingMembers(prev => ({ ...prev, [cls.id]: false }));
              }
            }
          }
        }
      }
    };

    loadMembersForAllClasses();
  }, [viewMode, selectedDate, classTypeFilter, cohortFilter, courseOverview.length]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-2 text-text-muted hover:text-accent transition-colors"
            >
              <span className="material-symbols-outlined">arrow_back</span>
              <span>Back to Dashboard</span>
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-text mb-2">Class Management</h1>
              <p className="text-text-muted">View courses and manage enrollment</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowCreateClassModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-600 rounded-lg hover:bg-green-500/20 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                <span className="hidden sm:inline">Create Course</span>
              </button>
              <button
                onClick={logout}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">logout</span>
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 lg:items-start">
          {/* Calendar Section */}
          <div className="flex-1 lg:max-w-md">
            {/* Class Type Filter */}
            <div className="mb-4">
              <p className="text-sm font-bold text-text-muted mb-2 uppercase">Filter by Class Type</p>
              <div className="relative">
                <select
                  value={classTypeFilter}
                  onChange={(e) => setClassTypeFilter(e.target.value)}
                  className={`w-full px-4 py-2.5 text-sm font-bold uppercase border transition-colors appearance-none cursor-pointer ${
                    classTypeConfig[classTypeFilter].border
                  } ${classTypeConfig[classTypeFilter].text} bg-background hover:bg-background-alt`}
                  style={{ paddingRight: '2.5rem' }}
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

            {/* Cohort Filter */}
            <div className="mb-4">
              <p className="text-sm font-bold text-text-muted mb-2 uppercase">Filter by Cohort</p>
              <div className="relative">
                <select
                  value={cohortFilter}
                  onChange={(e) => setCohortFilter(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm font-bold uppercase border border-gray-300 text-gray-900 bg-background hover:bg-background-alt transition-colors appearance-none cursor-pointer"
                  style={{ paddingRight: '2.5rem' }}
                >
                  <option value="all">ALL COHORTS</option>
                  <option value="cohort1">COHORT 1 (JAN 17, 19, 20, 22, 23)</option>
                  <option value="cohort2">COHORT 2 (FEB 28, MAR 1, 5, 6, 10)</option>
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
                setViewMode('date'); // Switch to date view when clicking a date

                // When clicking a date, check for course classes to highlight the full course
                if (dayClasses && dayClasses.length > 0) {
                  // Get week-based course classes on this date
                  const courseClassesOnDate = dayClasses.filter(c => {
                    // Check if this is a week-based course (has fullCourseIdentifier with week number like .1, .2, etc)
                    return c.fullCourseIdentifier && c.fullCourseIdentifier.includes('.');
                  });

                  // Check if there are multiple different courses (different start times)
                  const uniqueStartTimes = [...new Set(courseClassesOnDate.map(c => c.start_time))];
                  const hasMultipleCourses = uniqueStartTimes.length > 1;

                  // Skip course menu for Saturdays (day 6) - just show all classes
                  const dayOfWeek = date.getDay();
                  const isSaturday = dayOfWeek === 6;

                  if (hasMultipleCourses && !isSaturday) {
                    // Multiple courses - show dropdown menu (except on Saturdays)
                    const uniqueCourses = [];
                    const seenTimes = new Set();

                    courseClassesOnDate.forEach(c => {
                      if (!seenTimes.has(c.start_time)) {
                        seenTimes.add(c.start_time);
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
              isAdminView={true}
            />
          </div>

          {/* Class Details Section */}
          <div className="flex-1">
            {/* Header with back button when in date mode */}
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-bold text-text-muted uppercase">
                {viewMode === 'overview' ? 'Course Overview' : `Classes on ${formatDate(selectedDate)}`}
              </p>
              {viewMode === 'date' && (
                <button
                  onClick={() => {
                    setViewMode('overview');
                    setSelectedDate(null);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  ← Back to Overview
                </button>
              )}
            </div>

            <div className="flex flex-col gap-4">
              {loading ? (
                <p className="text-center text-text-muted py-12">Loading...</p>
              ) : viewMode === 'overview' ? (
                // Course Overview Mode
                courseOverview.length === 0 ? (
                  <p className="text-text-muted">No courses available.</p>
                ) : (
                  courseOverview.map((course) => {
                    // Calculate unique enrolled and makeup students across all weeks
                    // Use Sets to track unique student IDs instead of summing counts
                    const uniqueEnrolledIds = new Set();
                    const uniqueMakeupIds = new Set();

                    course.classes?.forEach(cls => {
                      const members = classMembers[cls.id] || [];
                      members.forEach(m => {
                        if (m.isMakeup) {
                          uniqueMakeupIds.add(m.studentId);
                        } else {
                          uniqueEnrolledIds.add(m.studentId);
                        }
                      });
                    });

                    const totalEnrolled = uniqueEnrolledIds.size;
                    const totalMakeup = uniqueMakeupIds.size;
                    const totalCapacity = course.maxCapacity || 10; // Default to 10 if not set

                    // Get first class for this course (for Add/Edit/Delete operations)
                    const firstClass = course.sampleClass;

                    return (
                      <div
                        key={course.identifier}
                        className="bg-white border border-gray-200 rounded-xl p-6"
                      >
                        {/* Course Header */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xl font-bold text-gray-900 font-mono">
                              {course.identifier}
                            </h3>
                            <div className="flex items-center gap-3">
                              <span className={`text-sm font-medium ${
                                totalEnrolled >= totalCapacity
                                  ? 'text-red-500'
                                  : 'text-green-500'
                              }`}>
                                {totalEnrolled}/{totalCapacity} enrolled
                              </span>
                              {firstClass && (
                                <>
                                  <button
                                    onClick={() => handleOpenEditClassModal(firstClass)}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                  >
                                    <span className="material-symbols-outlined text-sm">edit</span>
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    onClick={() => handleOpenAddStudentModal(firstClass.id)}
                                    disabled={totalEnrolled >= totalCapacity}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <span className="material-symbols-outlined text-sm">add</span>
                                    <span>Add</span>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteClass(firstClass.id, firstClass.class_type)}
                                    disabled={totalEnrolled > 0 || totalMakeup > 0}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={totalEnrolled > 0 || totalMakeup > 0 ? "Cannot delete course with enrolled students" : "Delete course"}
                                  >
                                    <span className="material-symbols-outlined text-sm">delete</span>
                                    <span>Delete</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          {course.sampleClass && (
                            <>
                              <p className="text-sm text-gray-600">
                                {course.sampleClass.class_type} • {course.sampleClass.start_time} - {course.sampleClass.end_time}
                              </p>
                              <p className="text-sm text-gray-600">
                                Instructor: {course.sampleClass.instructor}
                              </p>
                            </>
                          )}
                        </div>

                        {/* Enrollment Details with Dropdowns */}
                        {totalEnrolled > 0 || totalMakeup > 0 ? (
                          <div className="space-y-2">
                            {/* Regular Enrolled Students Section */}
                            {totalEnrolled > 0 && (
                              <div>
                                <button
                                  onClick={() => {
                                    const expandKey = `course-${course.identifier}`;
                                    setExpandedClassId(expandedClassId === expandKey ? null : expandKey);
                                  }}
                                  className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
                                >
                                  <span className="material-symbols-outlined text-base">
                                    {expandedClassId === `course-${course.identifier}` ? 'expand_less' : 'expand_more'}
                                  </span>
                                  Enrolled Members ({totalEnrolled})
                                </button>

                                {/* Expandable Member List */}
                                {expandedClassId === `course-${course.identifier}` && (
                                  <div className="mt-3">
                                    <div className="bg-gray-50 rounded p-2">
                                      {Array.from(uniqueEnrolledIds).map((studentId, index) => {
                                        // Find the first member record for this student across all classes
                                        let memberInfo = null;
                                        let classInstance = null;
                                        for (const cls of course.classes) {
                                          const members = classMembers[cls.id] || [];
                                          const member = members.find(m => !m.isMakeup && m.studentId === studentId);
                                          if (member) {
                                            memberInfo = member;
                                            classInstance = cls;
                                            break;
                                          }
                                        }

                                        if (!memberInfo) return null;

                                        return (
                                          <div
                                            key={studentId}
                                            className="text-sm py-1 flex items-center justify-between gap-2"
                                          >
                                            <div className="flex items-center gap-2">
                                              <span className="font-bold text-gray-500">#{index + 1}</span>
                                              <span className="text-gray-900">
                                                {memberInfo.firstName} {memberInfo.lastName}
                                              </span>
                                              {memberInfo.returningCount > 1 && (
                                                <>
                                                  <span className="text-gray-500">•</span>
                                                  <span className="text-gray-600">
                                                    ({memberInfo.returningCount})
                                                  </span>
                                                </>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <button
                                                onClick={() => {
                                                  const booking = {
                                                    bookingId: memberInfo.bookingId,
                                                    studentName: `${memberInfo.firstName} ${memberInfo.lastName}`,
                                                    studentId: memberInfo.studentId,
                                                    classInstance: classInstance,
                                                    weekNumber: getWeekNumberFromClassType(classInstance.class_type)
                                                  };
                                                  setReschedulingBooking(booking);
                                                  setRescheduleData({
                                                    newClassInstanceId: null,
                                                    reason: '',
                                                    isGlazing: classInstance.class_type?.toLowerCase().includes('glazing')
                                                  });
                                                  loadAvailableClassesForReschedule(classInstance, memberInfo.studentId);
                                                  setShowRescheduleModal(true);
                                                }}
                                                className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                              >
                                                <span className="material-symbols-outlined text-sm">schedule</span>
                                                <span>Reschedule</span>
                                              </button>
                                              <button
                                                onClick={() => handleRemoveStudent(
                                                  memberInfo.bookingId,
                                                  classInstance.id,
                                                  `${memberInfo.firstName} ${memberInfo.lastName}`
                                                )}
                                                className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                                              >
                                                <span className="material-symbols-outlined text-sm">close</span>
                                                <span>Remove</span>
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Makeup Students Section */}
                            {totalMakeup > 0 && (
                              <div>
                                <button
                                  onClick={() => {
                                    const expandKey = `course-makeup-${course.identifier}`;
                                    setExpandedClassId(expandedClassId === expandKey ? null : expandKey);
                                  }}
                                  className="flex items-center gap-2 text-sm font-semibold text-purple-700 hover:text-purple-900"
                                >
                                  <span className="material-symbols-outlined text-base">
                                    {expandedClassId === `course-makeup-${course.identifier}` ? 'expand_less' : 'expand_more'}
                                  </span>
                                  Makeup Students ({totalMakeup})
                                </button>

                                {/* Expandable Makeup Student List */}
                                {expandedClassId === `course-makeup-${course.identifier}` && (
                                  <div className="mt-3">
                                    <div className="bg-purple-50 rounded p-2">
                                      {Array.from(uniqueMakeupIds).map((studentId, index) => {
                                        // Find the first makeup member record for this student across all classes
                                        let memberInfo = null;
                                        let classInstance = null;
                                        for (const cls of course.classes) {
                                          const members = classMembers[cls.id] || [];
                                          const member = members.find(m => m.isMakeup && m.studentId === studentId);
                                          if (member) {
                                            memberInfo = member;
                                            classInstance = cls;
                                            break;
                                          }
                                        }

                                        if (!memberInfo) return null;

                                        return (
                                          <div
                                            key={studentId}
                                            className="text-sm py-1 flex items-center justify-between gap-2"
                                          >
                                            <div className="flex items-center gap-2">
                                              <span className="font-bold text-purple-500">#{index + 1}</span>
                                              <span className="text-gray-900">
                                                {memberInfo.firstName} {memberInfo.lastName}
                                              </span>
                                              {memberInfo.returningCount > 1 && (
                                                <>
                                                  <span className="text-gray-500">•</span>
                                                  <span className="text-gray-600">
                                                    ({memberInfo.returningCount})
                                                  </span>
                                                </>
                                              )}
                                              <span className="text-gray-500">•</span>
                                              <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-mono">
                                                from {memberInfo.originalClassIdentifier}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <button
                                                onClick={() => {
                                                  const booking = {
                                                    bookingId: memberInfo.bookingId,
                                                    studentName: `${memberInfo.firstName} ${memberInfo.lastName}`,
                                                    studentId: memberInfo.studentId,
                                                    classInstance: classInstance,
                                                    weekNumber: getWeekNumberFromClassType(classInstance.class_type)
                                                  };
                                                  setReschedulingBooking(booking);
                                                  setRescheduleData({
                                                    newClassInstanceId: null,
                                                    reason: '',
                                                    isGlazing: classInstance.class_type?.toLowerCase().includes('glazing')
                                                  });
                                                  loadAvailableClassesForReschedule(classInstance, memberInfo.studentId);
                                                  setShowRescheduleModal(true);
                                                }}
                                                className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                              >
                                                <span className="material-symbols-outlined text-sm">schedule</span>
                                                <span>Reschedule</span>
                                              </button>
                                              <button
                                                onClick={() => handleRemoveStudent(
                                                  memberInfo.bookingId,
                                                  classInstance.id,
                                                  `${memberInfo.firstName} ${memberInfo.lastName}`
                                                )}
                                                className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                                              >
                                                <span className="material-symbols-outlined text-sm">close</span>
                                                <span>Remove</span>
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400">No students enrolled yet</p>
                        )}
                      </div>
                    );
                  })
                )
              ) : (
                // Date Detail Mode
                classesForSelectedDate.length === 0 ? (
                  <p className="text-text-muted">No classes scheduled for this date.</p>
                ) : (
                  classesForSelectedDate.map((classInstance) => (
                  <div
                    key={classInstance.id}
                    className="bg-white border border-gray-200 rounded-xl p-6"
                  >
                    {/* Class Header */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xl font-bold text-gray-900 font-mono">
                          {classInstance.fullCourseIdentifier}
                        </h3>
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-medium ${
                            classInstance.bookingCount >= classInstance.max_capacity
                              ? 'text-red-500'
                              : 'text-green-500'
                          }`}>
                            {classInstance.bookingCount}/{classInstance.max_capacity} enrolled
                          </span>
                          <button
                            onClick={() => handleOpenEditClassModal(classInstance)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                          >
                            <span className="material-symbols-outlined text-sm">edit</span>
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleOpenAddStudentModal(classInstance.id)}
                            disabled={classInstance.bookingCount >= classInstance.max_capacity}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="material-symbols-outlined text-sm">add</span>
                            <span>Add</span>
                          </button>
                          <button
                            onClick={() => handleDeleteClass(classInstance.id, classInstance.class_type)}
                            disabled={classInstance.bookingCount > 0}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={classInstance.bookingCount > 0 ? "Cannot delete class with enrolled students" : "Delete class"}
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">
                        {classInstance.class_type} • {classInstance.start_time} - {classInstance.end_time}
                      </p>
                      <p className="text-sm text-gray-600">
                        Instructor: {classInstance.instructor}
                      </p>
                    </div>

                    {/* Enrolled Members */}
                    {classInstance.bookingCount > 0 ? (
                      <div className="space-y-2">
                        {/* Regular Enrolled Students Section */}
                        {(!classMembers[classInstance.id] || classMembers[classInstance.id].filter(m => !m.isMakeup).length > 0) && (
                          <div>
                            <button
                              onClick={() => toggleClassMembers(classInstance)}
                              className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
                            >
                              <span className="material-symbols-outlined text-base">
                                {expandedClassId === classInstance.id ? 'expand_less' : 'expand_more'}
                              </span>
                              Enrolled Members ({classMembers[classInstance.id] ? classMembers[classInstance.id].filter(m => !m.isMakeup).length : '...'})
                            </button>

                            {/* Expandable Member List */}
                            {expandedClassId === classInstance.id && (
                              <div className="mt-3">
                                {loadingMembers[classInstance.id] ? (
                                  <p className="text-sm text-gray-500">Loading...</p>
                                ) : classMembers[classInstance.id]?.filter(m => !m.isMakeup).length > 0 ? (
                                  <div className="bg-gray-50 rounded p-2">
                                    {classMembers[classInstance.id].filter(m => !m.isMakeup).map((member, index) => (
                                      <div
                                        key={member.id}
                                        className="text-sm py-1 flex items-center justify-between gap-2"
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-gray-500">#{index + 1}</span>
                                          <span className="text-gray-900">
                                            {member.firstName} {member.lastName}
                                          </span>
                                          {member.returningCount > 1 && (
                                            <>
                                              <span className="text-gray-500">•</span>
                                              <span className="text-gray-600">
                                                ({member.returningCount})
                                              </span>
                                            </>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => {
                                              const booking = {
                                                bookingId: member.bookingId,
                                                studentName: `${member.firstName} ${member.lastName}`,
                                                studentId: member.studentId,
                                                classInstance: classInstance,
                                                weekNumber: getWeekNumberFromClassType(classInstance.class_type)
                                              };
                                              setReschedulingBooking(booking);
                                              setRescheduleData({
                                                newClassInstanceId: null,
                                                reason: '',
                                                isGlazing: classInstance.class_type?.toLowerCase().includes('glazing')
                                              });
                                              loadAvailableClassesForReschedule(classInstance, member.studentId);
                                              setShowRescheduleModal(true);
                                            }}
                                            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                          >
                                            <span className="material-symbols-outlined text-sm">schedule</span>
                                            <span>Reschedule</span>
                                          </button>
                                          <button
                                            onClick={() => handleRemoveStudent(
                                              member.bookingId,
                                              classInstance.id,
                                              `${member.firstName} ${member.lastName}`
                                            )}
                                            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                                          >
                                            <span className="material-symbols-outlined text-sm">close</span>
                                            <span>Remove</span>
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-400">No enrollment details available</p>
                                )}

                              </div>
                            )}
                          </div>
                        )}

                        {/* Makeup Students Section - Separate collapsible - Always show if members loaded */}
                        {classMembers[classInstance.id] && (
                          <div>
                            <button
                              onClick={() => {
                                // Toggle a separate expanded state for makeup students
                                setExpandedClassId(expandedClassId === `makeup-${classInstance.id}` ? null : `makeup-${classInstance.id}`);
                              }}
                              className="flex items-center gap-2 text-sm font-semibold text-purple-700 hover:text-purple-900"
                            >
                              <span className="material-symbols-outlined text-base">
                                {expandedClassId === `makeup-${classInstance.id}` ? 'expand_less' : 'expand_more'}
                              </span>
                              Makeup Students ({classMembers[classInstance.id].filter(m => m.isMakeup).length})
                            </button>

                            {/* Expandable Makeup Student List */}
                            {expandedClassId === `makeup-${classInstance.id}` && (
                              <div className="mt-3">
                                <div className="bg-purple-50 rounded p-2">
                                  {classMembers[classInstance.id].filter(m => m.isMakeup).map((member, index) => (
                                    <div
                                      key={member.id}
                                      className="text-sm py-1 flex items-center justify-between gap-2"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-purple-500">#{index + 1}</span>
                                        <span className="text-gray-900">
                                          {member.firstName} {member.lastName}
                                        </span>
                                        {member.returningCount > 1 && (
                                          <>
                                            <span className="text-gray-500">•</span>
                                            <span className="text-gray-600">
                                              ({member.returningCount})
                                            </span>
                                          </>
                                        )}
                                        <span className="text-gray-500">•</span>
                                        <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-mono">
                                          from {member.originalClassIdentifier}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => {
                                            const booking = {
                                              bookingId: member.bookingId,
                                              studentName: `${member.firstName} ${member.lastName}`,
                                              studentId: member.studentId,
                                              classInstance: classInstance,
                                              weekNumber: getWeekNumberFromClassType(classInstance.class_type)
                                            };
                                            setReschedulingBooking(booking);
                                            setRescheduleData({
                                              newClassInstanceId: null,
                                              reason: '',
                                              isGlazing: classInstance.class_type?.toLowerCase().includes('glazing')
                                            });
                                            loadAvailableClassesForReschedule(classInstance, member.studentId);
                                            setShowRescheduleModal(true);
                                          }}
                                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                        >
                                          <span className="material-symbols-outlined text-sm">schedule</span>
                                          <span>Reschedule</span>
                                        </button>
                                        <button
                                          onClick={() => handleRemoveStudent(
                                            member.bookingId,
                                            classInstance.id,
                                            `${member.firstName} ${member.lastName}`
                                          )}
                                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                                        >
                                          <span className="material-symbols-outlined text-sm">close</span>
                                          <span>Remove</span>
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Absent/Rescheduled Members Section */}
                        {expandedClassId === classInstance.id && (
                          <div>
                            {!loadingMembers[classInstance.id] && absentMembers[classInstance.id]?.length > 0 && (
                              <div className="mt-4 pt-4 border-t border-gray-200">
                                <p className="text-sm font-semibold text-gray-700 mb-2">
                                  Absent/Rescheduled ({absentMembers[classInstance.id].length})
                                </p>
                                <div className="bg-yellow-50 rounded p-2 space-y-1">
                                  {absentMembers[classInstance.id].map((member) => (
                                    <div
                                      key={member.id}
                                      className="text-sm py-1 flex items-center justify-between gap-2"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="text-yellow-700">
                                          {member.firstName} {member.lastName}
                                        </span>
                                        <span className="text-gray-500">•</span>
                                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                          member.status === 'rescheduled'
                                            ? 'bg-blue-100 text-blue-700'
                                            : 'bg-gray-100 text-gray-700'
                                        }`}>
                                          {member.status === 'rescheduled' ? 'Rescheduled' : 'Absent'}
                                        </span>
                                        {member.rescheduledTo && (
                                          <>
                                            <span className="text-gray-500">→</span>
                                            <span className="text-xs text-gray-600">
                                              {new Date(member.rescheduledTo.classDate).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric'
                                              })} {member.rescheduledTo.startTime}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                      <button
                                        onClick={() => handleRemoveStudent(
                                          member.bookingId,
                                          classInstance.id,
                                          `${member.firstName} ${member.lastName}`
                                        )}
                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                                        title="Remove from list"
                                      >
                                        <span className="material-symbols-outlined text-sm">close</span>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No students enrolled yet</p>
                    )}
                  </div>
                ))
              ))}
            </div>
          </div>
        </div>
      </main>

      <Footer />

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
                const category = getClassCategory(course.class_type);
                const config = classTypeConfig[category] || classTypeConfig['wheelthrowing-beginner'];

                return (
                  <div key={course.start_time}>
                    {index > 0 && <div className="border-t border-gray-300"></div>}
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-background transition-colors"
                      onClick={() => {
                        const courseDates = getCourseDates(course);
                        setHighlightedCourseDates(courseDates);
                        setShowCourseMenu(false);
                      }}
                    >
                      <p className="font-bold text-sm">{course.start_time}</p>
                      <p className="text-xs text-text-muted">{course.fullCourseIdentifier}</p>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Reschedule Modal */}
      {showRescheduleModal && reschedulingBooking && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowRescheduleModal(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Reschedule Class</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {reschedulingBooking.studentName} • {reschedulingBooking.classInstance.class_type}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowRescheduleModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="px-6 py-4">
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-semibold text-blue-900 mb-2">Current Class:</p>
                  <p className="text-sm text-blue-800">
                    {formatDate(reschedulingBooking.classInstance.class_date)} • {reschedulingBooking.classInstance.start_time} - {reschedulingBooking.classInstance.end_time}
                  </p>
                  <p className="text-xs text-blue-700 mt-1 font-mono">
                    {reschedulingBooking.classInstance.fullCourseIdentifier}
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Fee Information */}
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-blue-600 text-xl">info</span>
                      <div>
                        <p className="text-sm font-semibold text-blue-900 mb-1">Reschedule Fee Policy:</p>
                        <p className="text-sm text-blue-800">
                          <strong>FREE:</strong> Rescheduling within the current cohort period (Jan 17 - Mar 3, 2026)<br/>
                          <span className="text-xs">Students can switch between any of the 6 courses during this period</span><br/>
                          <strong>$40 fee:</strong> Rescheduling outside this period (requires class credits or payment)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Select New Class */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Select New Class *
                    </label>
                    {availableClasses.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">No available classes found for reschedule</p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto border border-gray-300 rounded-lg">
                        {availableClasses.map((cls) => {
                          // Check if class is within the same cohort period (Jan 17 - Mar 3, 2026)
                          // Compare date strings (YYYY-MM-DD) instead of Date objects to avoid timezone issues
                          const cohortStartDateStr = '2026-01-17';
                          const cohortEndDateStr = '2026-03-03';
                          const originalDateStr = reschedulingBooking.classInstance.class_date.split('T')[0];
                          const newDateStr = cls.class_date.split('T')[0];

                          const isOriginalInPeriod = originalDateStr >= cohortStartDateStr && originalDateStr <= cohortEndDateStr;
                          const isNewInPeriod = newDateStr >= cohortStartDateStr && newDateStr <= cohortEndDateStr;
                          const isSamePeriod = isOriginalInPeriod && isNewInPeriod;

                          const willHaveFee = !rescheduleData.isGlazing && !isSamePeriod;
                          const isSelected = rescheduleData.newClassInstanceId === cls.id;

                          return (
                            <button
                              key={cls.id}
                              onClick={() => setRescheduleData({ ...rescheduleData, newClassInstanceId: cls.id })}
                              className={`w-full text-left px-4 py-3 border-b border-gray-200 hover:bg-gray-50 transition-colors ${
                                isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <p className="text-sm font-semibold text-gray-900">
                                    {formatDate(cls.class_date)}
                                  </p>
                                  <p className="text-xs text-gray-600">
                                    {cls.start_time} - {cls.end_time} • {cls.class_type}
                                  </p>
                                  <p className="text-xs text-gray-500 font-mono mt-1">
                                    {cls.fullCourseIdentifier}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {cls.bookingCount}/{cls.max_capacity} enrolled
                                  </p>
                                </div>
                                <div className="flex-shrink-0">
                                  {willHaveFee ? (
                                    <span className="inline-flex items-center px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                                      $40 fee
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                                      No fee
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Reason */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Reason for Reschedule
                    </label>
                    <textarea
                      value={rescheduleData.reason}
                      onChange={(e) => setRescheduleData({ ...rescheduleData, reason: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={3}
                      placeholder="Optional: Add a note about why this class is being rescheduled"
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowRescheduleModal(false)}
                  disabled={rescheduling}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReschedule}
                  disabled={rescheduling || !rescheduleData.newClassInstanceId}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {rescheduling ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                      <span>Rescheduling...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">check</span>
                      <span>Confirm Reschedule</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Add Student Modal */}
      {showAddStudentModal && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowAddStudentModal(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Add Student to Class</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Search for a student to add to this class
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAddStudentModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="px-6 py-4">
                {/* Search Field */}
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Search Student
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={studentSearchQuery}
                      onChange={(e) => setStudentSearchQuery(e.target.value)}
                      placeholder="Search by name or email..."
                      className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      search
                    </span>
                  </div>
                </div>

                {/* Student List */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">
                    Select Student
                  </p>
                  {loadingStudents ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500">Loading students...</p>
                    </div>
                  ) : getFilteredStudents().length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500">
                        {studentSearchQuery ? 'No students found matching your search' : 'No students available'}
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto border border-gray-300 rounded-lg">
                      {getFilteredStudents().map((student) => (
                        <button
                          key={student.dbId}
                          onClick={() => handleAddStudent(student.dbId)}
                          disabled={addingStudent}
                          className="w-full text-left px-4 py-3 border-b border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-gray-900">
                                {student.firstName} {student.lastName}
                              </p>
                              <p className="text-xs text-gray-600">
                                {student.email}
                              </p>
                            </div>
                            <span className="material-symbols-outlined text-green-500">
                              add_circle
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowAddStudentModal(false)}
                  disabled={addingStudent}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Create Class Modal */}
      {showCreateClassModal && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowCreateClassModal(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Create New Course</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Add a new course with multiple class sessions to the schedule
                    </p>
                  </div>
                  <button
                    onClick={() => setShowCreateClassModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="px-6 py-4">
                <div className="space-y-4">
                  {/* Class Type */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Class Type / Identifier *
                    </label>
                    <input
                      type="text"
                      value={createClassData.classType}
                      onChange={(e) => setCreateClassData({ ...createClassData, classType: e.target.value })}
                      placeholder="e.g., WT1210AM_DL6 or HB0511NT_LT13"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Format: [WT/HB][MMDD][AM/PM/NT]_[INSTRUCTOR][WEEKS]
                    </p>
                  </div>

                  {/* Number of Classes */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Number of Classes *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={createClassData.numberOfClasses}
                      onChange={(e) => handleNumberOfClassesChange(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Enter the number of class sessions (1-12)
                    </p>
                  </div>

                  {/* Class Dates */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Class Dates *
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      Select {createClassData.numberOfClasses} date{createClassData.numberOfClasses > 1 ? 's' : ''} for your class sessions
                    </p>
                    <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-300 rounded-lg p-3 bg-gray-50">
                      {createClassData.classDates.map((date, index) => (
                        <div key={index} className="flex items-center gap-2 bg-white rounded p-2">
                          <span className="text-sm font-medium text-gray-600 w-20 flex-shrink-0">
                            Week {index + 1}:
                          </span>
                          <input
                            type="date"
                            value={date}
                            onChange={(e) => handleClassDateChange(index, e.target.value)}
                            className="flex-1 px-3 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                          />
                          {date && (
                            <span className="text-xs text-green-600 flex-shrink-0">✓</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {createClassData.classDates.filter(d => d).length} of {createClassData.numberOfClasses} dates selected
                    </p>
                  </div>

                  {/* Time Row */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Start Time */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Start Time *
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={createClassData.startTimeHour}
                          onChange={(e) => setCreateClassData({ ...createClassData, startTimeHour: e.target.value })}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        >
                          <option value="">Hour</option>
                          {[...Array(12)].map((_, i) => (
                            <option key={i + 1} value={i + 1}>{i + 1}</option>
                          ))}
                        </select>
                        <select
                          value={createClassData.startTimeMinute}
                          onChange={(e) => setCreateClassData({ ...createClassData, startTimeMinute: e.target.value })}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        >
                          <option value="">Min</option>
                          <option value="00">00</option>
                          <option value="15">15</option>
                          <option value="30">30</option>
                          <option value="45">45</option>
                        </select>
                        <select
                          value={createClassData.startTimePeriod}
                          onChange={(e) => setCreateClassData({ ...createClassData, startTimePeriod: e.target.value })}
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>

                    {/* End Time */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        End Time *
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={createClassData.endTimeHour}
                          onChange={(e) => setCreateClassData({ ...createClassData, endTimeHour: e.target.value })}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        >
                          <option value="">Hour</option>
                          {[...Array(12)].map((_, i) => (
                            <option key={i + 1} value={i + 1}>{i + 1}</option>
                          ))}
                        </select>
                        <select
                          value={createClassData.endTimeMinute}
                          onChange={(e) => setCreateClassData({ ...createClassData, endTimeMinute: e.target.value })}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        >
                          <option value="">Min</option>
                          <option value="00">00</option>
                          <option value="15">15</option>
                          <option value="30">30</option>
                          <option value="45">45</option>
                        </select>
                        <select
                          value={createClassData.endTimePeriod}
                          onChange={(e) => setCreateClassData({ ...createClassData, endTimePeriod: e.target.value })}
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Instructor */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Instructor *
                    </label>
                    <input
                      type="text"
                      value={createClassData.instructor}
                      onChange={(e) => setCreateClassData({ ...createClassData, instructor: e.target.value })}
                      placeholder="e.g., Dillon Lin"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  {/* Type */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Type *
                    </label>
                    <input
                      type="text"
                      value={createClassData.room}
                      onChange={(e) => setCreateClassData({ ...createClassData, room: e.target.value })}
                      placeholder="e.g., Wheelthrowing, Handbuilding, Sculpture, Glazing"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  {/* Capacity Fields */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Teaching Capacity *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={createClassData.teachingCapacity}
                        onChange={(e) => setCreateClassData({ ...createClassData, teachingCapacity: parseInt(e.target.value) || 10 })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Regular classes (typically 8-10)
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Make Up Capacity *
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={createClassData.makeUpCapacity}
                        onChange={(e) => setCreateClassData({ ...createClassData, makeUpCapacity: parseInt(e.target.value) || 2 })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Make-up spots (typically 2)
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Glazing Capacity *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={createClassData.glazingCapacity}
                        onChange={(e) => setCreateClassData({ ...createClassData, glazingCapacity: parseInt(e.target.value) || 14 })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Final glazing class (typically 14)
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowCreateClassModal(false)}
                  disabled={creatingClass}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateClass}
                  disabled={creatingClass}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingClass ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">add</span>
                      <span>Create Course</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Edit Class Modal */}
      {showEditClassModal && editingClass && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowEditClassModal(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Edit Class</h2>
                    <p className="text-sm text-gray-600 mt-1 font-mono">
                      {editingClass.fullCourseIdentifier}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowEditClassModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="px-6 py-4">
                <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-yellow-600 text-xl">warning</span>
                    <div>
                      <p className="text-sm font-semibold text-yellow-900 mb-1">Important Note:</p>
                      <p className="text-sm text-yellow-800">
                        Changing the date or time will NOT update the class identifier. This may cause mismatches between the identifier and actual class schedule.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Class Date */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Class Date *
                    </label>
                    <input
                      type="date"
                      value={editClassData.classDate}
                      onChange={(e) => setEditClassData({ ...editClassData, classDate: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Start Time */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Start Time *
                    </label>
                    <input
                      type="text"
                      value={editClassData.startTime}
                      onChange={(e) => setEditClassData({ ...editClassData, startTime: e.target.value })}
                      placeholder="e.g., 9:30 AM"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* End Time */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      End Time *
                    </label>
                    <input
                      type="text"
                      value={editClassData.endTime}
                      onChange={(e) => setEditClassData({ ...editClassData, endTime: e.target.value })}
                      placeholder="e.g., 12:00 PM"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Instructor */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Instructor *
                    </label>
                    <input
                      type="text"
                      value={editClassData.instructor}
                      onChange={(e) => setEditClassData({ ...editClassData, instructor: e.target.value })}
                      placeholder="e.g., Dillon Lin"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Max Capacity */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Max Capacity *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={editClassData.maxCapacity}
                      onChange={(e) => setEditClassData({ ...editClassData, maxCapacity: parseInt(e.target.value) || 12 })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Maximum number of students for this class
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowEditClassModal(false)}
                  disabled={updatingClass}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateClass}
                  disabled={updatingClass}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updatingClass ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">check</span>
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
