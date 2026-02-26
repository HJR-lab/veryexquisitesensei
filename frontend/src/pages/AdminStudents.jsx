import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Navigation from '../components/Navigation';
import Footer from '../components/Footer';
import api from '../utils/api';

export default function AdminStudents() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    totalStudents: 0,
    activeStudents: 0,
    returningStudents: 0,
    inactiveStudents: 0
  });

  const [courseStats, setCourseStats] = useState({});
  const [topPerformers, setTopPerformers] = useState({
    topReturning: [],
    topActive: [],
    topBooked: []
  });

  // Student lists
  const [activeStudentsList, setActiveStudentsList] = useState([]);
  const [pausedStudentsList, setPausedStudentsList] = useState([]);
  const [returningStudentsList, setReturningStudentsList] = useState([]);
  const [upcomingEnrollmentsList, setUpcomingEnrollmentsList] = useState([]);
  const [hbStudentsList, setHbStudentsList] = useState([]);

  // Sorting state
  const [sortBy, setSortBy] = useState('earliest'); // default: earliest course on top

  // Cohort filter state
  const [selectedCohort, setSelectedCohort] = useState('all'); // 'all', 'cohort1', 'cohort2'

  // HB Students sorting and filtering state
  const [hbSortBy, setHbSortBy] = useState('name'); // 'name', 'credits', 'enrolled', 'variant'
  const [hideCompleted, setHideCompleted] = useState(false);

  // Inline editing state
  const [editingCredits, setEditingCredits] = useState(null); // enrollmentId being edited
  const [editCreditsUsed, setEditCreditsUsed] = useState('');
  const [editCreditsAllocated, setEditCreditsAllocated] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      console.log('[AdminStudents] Loading stats...');
      setLoading(true);
      const { data } = await api.get('/admin/students/stats');
      console.log('[AdminStudents] Stats loaded successfully:', data);
      setStats(data.stats);
      setCourseStats(data.courseStats);
      setTopPerformers(data.topPerformers);

      // Show all active students regardless of whether they have course identifiers
      setActiveStudentsList(data.activeStudentsList || []);
      setPausedStudentsList(data.pausedStudentsList || []);
      setReturningStudentsList(data.returningStudentsList || []);
      setUpcomingEnrollmentsList(data.upcomingEnrollmentsList || []);
      setHbStudentsList(data.hbStudentsList || []);

      console.log('[AdminStudents] Active students count:', data.activeStudentsList?.length);
      console.log('[AdminStudents] Paused students count:', data.pausedStudentsList?.length);
    } catch (error) {
      console.error('[AdminStudents] Failed to load stats:', error);
      console.error('[AdminStudents] Error details:', error.response?.data);
    } finally {
      setLoading(false);
    }
  };

  const syncFromShopify = async () => {
    try {
      setSyncing(true);
      console.log('Starting Shopify sync...');

      // Step 1: Sync customers
      console.log('Step 1: Syncing customers...');
      const customersResponse = await api.post('/admin/sync-shopify-customers');
      console.log('Customers synced:', customersResponse.data);

      // Step 2: Sync orders and create enrollments
      console.log('Step 2: Syncing orders and creating enrollments...');
      const ordersResponse = await api.post('/admin/sync-shopify-orders');
      console.log('Orders synced:', ordersResponse.data);

      // Step 3: Backfill HB credits for any enrollments with missing credits
      console.log('Step 3: Backfilling HB credits...');
      const hbResponse = await api.post('/admin/backfill-hb-credits');
      console.log('HB credits backfilled:', hbResponse.data);

      // Reload stats to show updated data
      await loadStats();

      alert(`Successfully synced from Shopify!\n\n` +
            `✅ Customers: ${customersResponse.data.count || 0}\n` +
            `✅ Enrollments created: ${ordersResponse.data.enrollmentsCreated || 0}\n` +
            `✅ Orders processed: ${ordersResponse.data.processedCount || 0}\n` +
            `✅ HB credits fixed: ${hbResponse.data.fixed || 0}`);
    } catch (error) {
      console.error('Failed to sync from Shopify:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
      alert(`Failed to sync from Shopify: ${errorMessage}`);
    } finally {
      setSyncing(false);
    }
  };

  const [resyncingHB, setResyncingHB] = useState(false);
  const [markingDone, setMarkingDone] = useState(null);
  const [selectedHB, setSelectedHB] = useState(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const toggleHBSelect = (enrollmentId, e) => {
    e.stopPropagation();
    setSelectedHB(prev => {
      const next = new Set(prev);
      if (next.has(enrollmentId)) next.delete(enrollmentId);
      else next.add(enrollmentId);
      return next;
    });
  };

  const toggleSelectAllHB = (e) => {
    e.stopPropagation();
    const sortedHbStudents = getSortedHbStudents();
    if (selectedHB.size === sortedHbStudents.length) {
      setSelectedHB(new Set());
    } else {
      setSelectedHB(new Set(sortedHbStudents.map(s => s.enrollmentId)));
    }
  };

  // Start inline editing for a student
  const startEditingCredits = (student) => {
    setEditingCredits(student.enrollmentId);
    setEditCreditsUsed((student.creditsUsed || 0).toString());
    setEditCreditsAllocated((student.creditsAllocated || 0).toString());
  };

  // Cancel inline editing
  const cancelEditingCredits = () => {
    setEditingCredits(null);
    setEditCreditsUsed('');
    setEditCreditsAllocated('');
  };

  // Save inline credit changes
  const saveInlineCredits = async (student) => {
    const used = parseInt(editCreditsUsed);
    const allocated = parseInt(editCreditsAllocated);

    if (isNaN(used) || isNaN(allocated) || used < 0 || allocated < 0) {
      alert('Please enter valid numbers');
      return;
    }

    if (used > allocated) {
      alert('Used credits cannot exceed allocated credits');
      return;
    }

    try {
      await api.post(`/admin/hb-enrollments/${student.enrollmentId}/set-credits`, { allocated, used });
      await loadStats();
      cancelEditingCredits();
    } catch (error) {
      alert(`Failed: ${error.response?.data?.error || error.message}`);
    }
  };

  // Set individual student credits (prompt version)
  const setIndividualCredits = async (student) => {
    const currentUsed = student.creditsUsed || 0;
    const currentAllocated = student.creditsAllocated || 0;

    const input = prompt(
      `Set credits for ${student.name}\n\nCurrent: ${currentUsed}/${currentAllocated}\n\nEnter new allocation as "used/allocated" (e.g. "3/6" or "4/4"):`,
      `${currentUsed}/${currentAllocated}`
    );

    if (!input) return;

    const match = input.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!match) {
      alert('Invalid format. Use "used/allocated" e.g. "3/6"');
      return;
    }

    const used = parseInt(match[1]);
    const allocated = parseInt(match[2]);

    if (used > allocated) {
      alert('Used credits cannot exceed allocated credits');
      return;
    }

    if (!confirm(`Set ${student.name} to ${used}/${allocated} credits?`)) return;

    try {
      await api.post(`/admin/hb-enrollments/${student.enrollmentId}/set-credits`, { allocated, used });
      await loadStats();
    } catch (error) {
      alert(`Failed: ${error.response?.data?.error || error.message}`);
    }
  };

  // Mark selected students as fully done (all credits used)
  const markSelectedDone = async () => {
    const selected = hbStudentsList.filter(s => selectedHB.has(s.enrollmentId) && s.creditsRemaining > 0);
    if (selected.length === 0) { alert('No selected students with remaining credits'); return; }
    if (!confirm(`Mark ${selected.length} student(s) as fully completed?\n\n${selected.map(s => `${s.name} (${s.creditsAllocated}/${s.creditsAllocated})`).join('\n')}`)) return;

    try {
      setBulkProcessing(true);
      for (const student of selected) {
        await api.post(`/admin/hb-enrollments/${student.enrollmentId}/set-credits`, {
          allocated: student.creditsAllocated,
          used: student.creditsAllocated
        });
      }
      setSelectedHB(new Set());
      await loadStats();
    } catch (error) {
      alert(`Failed: ${error.response?.data?.error || error.message}`);
    } finally {
      setBulkProcessing(false);
    }
  };

  // Bulk set credits for selected students
  const bulkSetCredits = async () => {
    const selected = hbStudentsList.filter(s => selectedHB.has(s.enrollmentId));
    if (selected.length === 0) { alert('No students selected'); return; }

    const input = prompt(`Set credits for ${selected.length} student(s)\nFormat: used/allocated (e.g. "3/4" or "4/4")`, '');
    if (!input) return;

    const match = input.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!match) { alert('Invalid format. Use "used/allocated" e.g. "3/4"'); return; }

    const used = parseInt(match[1]);
    const allocated = parseInt(match[2]);

    if (!confirm(`Set ${selected.length} student(s) to ${used}/${allocated} credits?`)) return;

    try {
      setBulkProcessing(true);
      for (const student of selected) {
        await api.post(`/admin/hb-enrollments/${student.enrollmentId}/set-credits`, { allocated, used });
      }
      setSelectedHB(new Set());
      await loadStats();
    } catch (error) {
      alert(`Failed: ${error.response?.data?.error || error.message}`);
    } finally {
      setBulkProcessing(false);
    }
  };

  // Cancel selected enrollments
  const cancelSelected = async () => {
    const selected = hbStudentsList.filter(s => selectedHB.has(s.enrollmentId));
    if (selected.length === 0) { alert('No students selected'); return; }
    if (!confirm(`Remove ${selected.length} student(s) from HB list?\n\n${selected.map(s => s.name).join('\n')}`)) return;

    try {
      setBulkProcessing(true);
      for (const student of selected) {
        await api.post(`/admin/hb-enrollments/${student.enrollmentId}/set-status`, { status: 'cancelled' });
      }
      setSelectedHB(new Set());
      await loadStats();
    } catch (error) {
      alert(`Failed: ${error.response?.data?.error || error.message}`);
    } finally {
      setBulkProcessing(false);
    }
  };

  const resyncHBOrders = async () => {
    try {
      setResyncingHB(true);
      console.log('Starting deep HB order re-sync from Jul 2025...');

      // Step 1: Sync customers first
      const customersResponse = await api.post('/admin/sync-shopify-customers');

      // Step 2: Deep sync orders from Jul 1 2025 (earliest HB orders)
      const ordersResponse = await api.post('/admin/sync-shopify-orders', {
        sinceDate: '2025-07-01T00:00:00Z'
      });

      // Step 3: Backfill HB credits
      const hbResponse = await api.post('/admin/backfill-hb-credits');

      // Reload stats
      await loadStats();

      alert(`HB Re-sync Complete!\n\n` +
            `✅ Customers synced: ${customersResponse.data.count || 0}\n` +
            `✅ New enrollments: ${ordersResponse.data.enrollmentsCreated || 0}\n` +
            `✅ Already existed: ${ordersResponse.data.skippedCount || 0}\n` +
            `✅ Orders processed: ${ordersResponse.data.processedCount || 0}\n` +
            `✅ HB credits fixed: ${hbResponse.data.fixed || 0}`);
    } catch (error) {
      console.error('Failed to re-sync HB orders:', error);
      alert(`Failed to re-sync: ${error.response?.data?.error || error.message}`);
    } finally {
      setResyncingHB(false);
    }
  };

  const viewStudentDetail = (student) => {
    navigate(`/admin/students/${encodeURIComponent(student.email)}`);
  };

  // Helper function to parse course start date from identifier
  // Format: WT1701AM_DL6 = started Jan 17 AM (DDMM format + time)
  const parseCourseStartDate = (courseIdentifier) => {
    if (!courseIdentifier || courseIdentifier === 'N/A') return null;

    // Extract DDMM and optional time from identifier (e.g., WT1701AM_DL6 -> 1701 and AM)
    const match = courseIdentifier.match(/^[A-Z]{2}(\d{4})([A-Z]{2})?/);
    if (!match) return null;

    const ddmm = match[1];
    const timeOfDay = match[2]; // AM, PM, NT, etc. (optional)
    const day = parseInt(ddmm.substring(0, 2));
    const month = parseInt(ddmm.substring(2, 4));

    // Validate day and month
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;

    // Use current year (2026)
    const year = 2026;

    // Set hour based on time indicator to ensure proper sorting
    // AM classes at 9:00, PM classes at 19:00 (7 PM), NT (night) at 20:00 (8 PM)
    let hour = 12; // default to noon for unspecified times
    if (timeOfDay === 'AM') {
      hour = 9;
    } else if (timeOfDay === 'PM') {
      hour = 19;
    } else if (timeOfDay === 'NT') {
      hour = 20;
    }

    return new Date(year, month - 1, day, hour, 0, 0);
  };

  // Determine which cohort a student belongs to based on course start date
  const getStudentCohort = (student) => {
    const courseDate = parseCourseStartDate(student.courseIdentifier);
    if (!courseDate) return null;

    const day = courseDate.getDate();
    const month = courseDate.getMonth(); // 0 = January, 1 = February, 2 = March

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

  // Get filtered and sorted HB students
  const getSortedHbStudents = () => {
    let filteredStudents = [...hbStudentsList];

    // Filter out completed students if hideCompleted is true
    if (hideCompleted) {
      filteredStudents = filteredStudents.filter(s => s.creditsRemaining > 0 || s.creditsAllocated === 0);
    }

    // Sort based on selected option
    switch (hbSortBy) {
      case 'name':
        return filteredStudents.sort((a, b) => a.name.localeCompare(b.name));

      case 'credits':
        return filteredStudents.sort((a, b) => {
          // Sort by remaining credits (most remaining first), then by allocated
          const aRemaining = a.creditsRemaining || 0;
          const bRemaining = b.creditsRemaining || 0;
          if (aRemaining !== bRemaining) return bRemaining - aRemaining;
          return (b.creditsAllocated || 0) - (a.creditsAllocated || 0);
        });

      case 'enrolled':
        return filteredStudents.sort((a, b) => {
          const dateA = new Date(a.createdAt || 0);
          const dateB = new Date(b.createdAt || 0);
          return dateB - dateA; // Most recent first
        });

      case 'variant':
        return filteredStudents.sort((a, b) => {
          const variantA = a.variantTitle || a.courseTitle || 'HB';
          const variantB = b.variantTitle || b.courseTitle || 'HB';
          return variantA.localeCompare(variantB);
        });

      default:
        return filteredStudents;
    }
  };

  // Get filtered and sorted students (combining active and upcoming by cohort)
  const getSortedActiveStudents = () => {
    // Combine active students and upcoming students (both rows should be visible if both exist)
    const combinedStudents = [
      ...activeStudentsList,
      ...upcomingEnrollmentsList.map(s => ({
        ...s,
        enrollmentStatus: 'upcoming',
        weeksRemaining: s.weeksRemaining || 0
      }))
    ];

    // Filter by selected cohort
    let filteredStudents = combinedStudents;
    if (selectedCohort !== 'all') {
      filteredStudents = combinedStudents.filter(s => getStudentCohort(s) === selectedCohort);
    }

    // Sort based on selected option
    switch (sortBy) {
      case 'earliest':
        return filteredStudents.sort((a, b) => {
          const dateA = parseCourseStartDate(a.courseIdentifier) || new Date(0);
          const dateB = parseCourseStartDate(b.courseIdentifier) || new Date(0);
          return dateA - dateB;
        });

      case 'latest':
        return filteredStudents.sort((a, b) => {
          const dateA = parseCourseStartDate(a.courseIdentifier) || new Date(0);
          const dateB = parseCourseStartDate(b.courseIdentifier) || new Date(0);
          return dateB - dateA;
        });

      case 'name':
        return filteredStudents.sort((a, b) => a.name.localeCompare(b.name));

      case 'remaining':
        return filteredStudents.sort((a, b) => (b.weeksRemaining || 0) - (a.weeksRemaining || 0));

      default:
        return filteredStudents;
    }
  };

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

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-text mb-2">Student Management</h1>
              <p className="text-text-muted">Manage active and returning students</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={syncFromShopify}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-500 rounded-lg hover:bg-blue-500/20 transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">{syncing ? 'sync' : 'cloud_sync'}</span>
                <span className="hidden sm:inline">{syncing ? 'Syncing...' : 'Sync Shopify'}</span>
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

        {/* Active Students Section */}
        <div className="mb-8">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-green-600 text-2xl">check_circle</span>
                <h2 className="text-2xl font-bold text-gray-900">Active Students ({getSortedActiveStudents().length})</h2>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-4">
                {/* Cohort Filter */}
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 font-medium">Cohort:</label>
                  <select
                    value={selectedCohort}
                    onChange={(e) => setSelectedCohort(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                  >
                    <option value="all">All Cohorts</option>
                    <option value="cohort1">Cohort 1 (Jan 17, 19, 20, 22, 23)</option>
                    <option value="cohort2">Cohort 2 (Feb 28, Mar 1, 5, 6, 10)</option>
                  </select>
                </div>

                {/* Sort Dropdown */}
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 font-medium">Sort by:</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                  >
                    <option value="earliest">Earliest Course</option>
                    <option value="latest">Latest Course</option>
                    <option value="name">Name (A-Z)</option>
                    <option value="remaining">Classes Remaining</option>
                  </select>
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">Students currently enrolled or starting soon (filter by cohort)</p>

            {loading ? (
              <p className="text-center text-gray-400 py-12">Loading...</p>
            ) : activeStudentsList.length === 0 ? (
              <p className="text-center text-gray-400 py-12">No active students found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-blue-200 bg-blue-50/50">
                      <th className="text-left py-3 px-3 font-semibold text-gray-900 w-8">#</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-900">Name</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-900">Email</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-900">Variant</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-900">Course Code</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-900">Progress</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-900">Purchased</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSortedActiveStudents().map((student, index, array) => {
                      // Extract base course (without .1, .2, .3 suffix)
                      const getBaseCourse = (identifier) => {
                        if (!identifier) return '';
                        return identifier.split('.')[0];
                      };

                      const currentBaseCourse = getBaseCourse(student.courseIdentifier);

                      // Calculate position within current course (1-based)
                      let positionInCourse = 1;
                      for (let i = index - 1; i >= 0; i--) {
                        if (getBaseCourse(array[i].courseIdentifier) === currentBaseCourse) {
                          positionInCourse++;
                        } else {
                          break;
                        }
                      }

                      // Check if this is the last student in a course group
                      const nextBaseCourse = index < array.length - 1 ? getBaseCourse(array[index + 1].courseIdentifier) : null;
                      const isLastInCourse = index === array.length - 1 || currentBaseCourse !== nextBaseCourse;

                      const rowClass = isLastInCourse
                        ? "border-b-2 border-gray-300 bg-gray-50"
                        : "border-b border-gray-100";

                      return (
                        <tr
                          key={index}
                          onClick={() => viewStudentDetail(student)}
                          className={`${rowClass} hover:bg-blue-50 transition-colors cursor-pointer`}
                        >
                          <td className="py-2.5 px-3 text-xs text-gray-400">{positionInCourse}</td>
                          <td className="py-2.5 px-3 font-medium text-gray-900">{student.name}</td>
                          <td className="py-2.5 px-3 text-gray-600 text-sm">{student.email}</td>
                          <td className="py-2.5 px-3">
                            <span className="text-sm font-medium text-blue-800">
                              {student.variantTitle || student.courseIdentifier || 'N/A'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono text-xs text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                              {student.courseIdentifier || 'N/A'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-sm font-bold text-gray-900">
                              {student.classesAttended || 0}/{student.classesAllocated || 6}
                            </span>
                            <div className="w-16 bg-gray-200 rounded-full h-1.5 mt-1">
                              <div
                                className={`h-1.5 rounded-full ${
                                  (student.classesAttended || 0) >= (student.classesAllocated || 6)
                                    ? 'bg-green-500'
                                    : 'bg-amber-500'
                                }`}
                                style={{ width: `${Math.min(100, ((student.classesAttended || 0) / (student.classesAllocated || 6)) * 100)}%` }}
                              />
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">
                              {student.coursePurchaseCount || 1}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Paused Students Section */}
        <div className="mb-8">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-yellow-600 text-2xl">pause_circle</span>
              <h2 className="text-2xl font-bold text-gray-900">Paused Students ({pausedStudentsList.length})</h2>
            </div>
            <p className="text-sm text-gray-600 mb-6">Students with paused enrollments</p>

            {loading ? (
              <p className="text-center text-gray-400 py-12">Loading...</p>
            ) : pausedStudentsList.length === 0 ? (
              <p className="text-center text-gray-400 py-12">No paused students found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-yellow-200 bg-yellow-50/50">
                      <th className="text-left py-3 px-3 font-semibold text-gray-900">Name</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-900">Email</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-900">Variant</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-900">Course Code</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-900">Remaining</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-900">Purchased</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pausedStudentsList.map((student, index) => (
                      <tr
                        key={index}
                        onClick={() => viewStudentDetail(student)}
                        className="border-b border-gray-100 hover:bg-yellow-50 transition-colors cursor-pointer"
                      >
                        <td className="py-2.5 px-3 font-medium text-gray-900">{student.name}</td>
                        <td className="py-2.5 px-3 text-gray-600 text-sm">{student.email}</td>
                        <td className="py-2.5 px-3">
                          <span className="text-sm font-medium text-yellow-800">
                            {student.variantTitle || student.courseIdentifier || 'N/A'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono text-xs text-gray-900 bg-yellow-100 px-2 py-0.5 rounded">
                            {student.courseIdentifier || 'N/A'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="text-sm font-bold text-gray-900">
                            {student.weeksRemaining || 0}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold">
                            {student.coursePurchaseCount || 1}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* HB Students Section */}
        <div className="mb-8">
          <div className="bg-white border-2 border-amber-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-600 text-2xl">palette</span>
                <h2 className="text-2xl font-bold text-gray-900">HB Students ({getSortedHbStudents().length})</h2>
              </div>
              <button
                onClick={resyncHBOrders}
                disabled={resyncingHB}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm font-medium"
              >
                {resyncingHB ? 'Re-syncing...' : 'Re-sync All HB Orders'}
              </button>
            </div>

            {/* HB Filters and Sorting */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-600">Handbuilding students with credit-based enrollment (separate from WT)</p>

              <div className="flex items-center gap-4">
                {/* Hide Completed Filter */}
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={hideCompleted}
                    onChange={(e) => setHideCompleted(e.target.checked)}
                    className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-sm text-gray-600 font-medium">Hide Completed</span>
                </label>

                {/* Sort Dropdown */}
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 font-medium">Sort by:</label>
                  <select
                    value={hbSortBy}
                    onChange={(e) => setHbSortBy(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-amber-600"
                  >
                    <option value="name">Name (A-Z)</option>
                    <option value="credits">Credits Remaining</option>
                    <option value="enrolled">Recently Enrolled</option>
                    <option value="variant">Course Type</option>
                  </select>
                </div>
              </div>
            </div>

            {/* HB Summary Stats */}
            {getSortedHbStudents().length > 0 && (
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-amber-800">{getSortedHbStudents().length}</div>
                  <div className="text-xs text-amber-600">Showing</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-red-800">{getSortedHbStudents().filter(s => s.creditsRemaining > 0).length}</div>
                  <div className="text-xs text-red-600">Active</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-800">{getSortedHbStudents().filter(s => s.creditsRemaining === 0 && s.creditsAllocated > 0).length}</div>
                  <div className="text-xs text-green-600">Completed</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-800">{hbStudentsList.length}</div>
                  <div className="text-xs text-blue-600">Total HB</div>
                </div>
              </div>
            )}

            {/* Bulk Action Bar */}
            {selectedHB.size > 0 && (
              <div className="flex items-center gap-3 mb-4 p-3 bg-amber-100 rounded-lg border border-amber-300">
                <span className="text-sm font-medium text-amber-900">{selectedHB.size} selected</span>
                <button
                  onClick={markSelectedDone}
                  disabled={bulkProcessing}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {bulkProcessing ? 'Processing...' : 'Mark Done (all credits used)'}
                </button>
                <button
                  onClick={bulkSetCredits}
                  disabled={bulkProcessing}
                  className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                >
                  Set Credits
                </button>
                <button
                  onClick={cancelSelected}
                  disabled={bulkProcessing}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  Remove
                </button>
                <button
                  onClick={() => setSelectedHB(new Set())}
                  className="px-3 py-1.5 text-gray-600 text-sm hover:text-gray-900"
                >
                  Clear
                </button>
              </div>
            )}

            {loading ? (
              <p className="text-center text-gray-400 py-12">Loading...</p>
            ) : getSortedHbStudents().length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 mb-3">
                  {hbStudentsList.length === 0
                    ? "No handbuilding students found"
                    : hideCompleted
                      ? "No active HB students (all completed)"
                      : "No students match the current filters"
                  }
                </p>
                {hbStudentsList.length === 0 && (
                  <p className="text-sm text-gray-400">Click "Re-sync All HB Orders" to pull in missing orders from Shopify</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-amber-200 bg-amber-50/50">
                      <th className="py-3 px-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectedHB.size === getSortedHbStudents().length && getSortedHbStudents().length > 0}
                          onChange={toggleSelectAllHB}
                          className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                        />
                      </th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-900 w-8">#</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-900">Name</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-900">Email</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-900">Variant</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-900">Credits</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-900">Purchased</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSortedHbStudents().map((student, index) => {
                      const isSelected = selectedHB.has(student.enrollmentId);
                      const allUsed = student.creditsRemaining === 0 && student.creditsAllocated > 0;
                      const creditPercent = student.creditsAllocated > 0
                        ? (student.creditsRemaining / student.creditsAllocated) * 100
                        : 0;

                      return (
                        <tr
                          key={student.enrollmentId || index}
                          className={`border-b border-gray-100 transition-colors ${
                            isSelected ? 'bg-amber-50' : allUsed ? 'bg-gray-50 opacity-60' : 'hover:bg-amber-50/30'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => toggleHBSelect(student.enrollmentId, e)}
                              className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-xs text-gray-400">{index + 1}</td>
                          <td className="py-2.5 px-3 font-medium text-gray-900">
                            <button
                              onClick={() => viewStudentDetail(student)}
                              className="text-left hover:text-amber-700 hover:underline focus:outline-none focus:text-amber-700 focus:underline transition-colors"
                            >
                              {student.name}
                            </button>
                            {allUsed && <span className="ml-1 text-xs text-green-600">&#10003;</span>}
                          </td>
                          <td className="py-2.5 px-3 text-gray-600 text-sm">{student.email}</td>
                          <td className="py-2.5 px-3">
                            <span className="text-sm font-medium text-amber-800">
                              {student.variantTitle || student.courseTitle || 'HB'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {editingCredits === student.enrollmentId ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={editCreditsUsed}
                                  onChange={(e) => setEditCreditsUsed(e.target.value)}
                                  className="w-12 px-1 py-0.5 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                                  min="0"
                                  placeholder="Used"
                                />
                                <span className="text-xs text-gray-400">/</span>
                                <input
                                  type="number"
                                  value={editCreditsAllocated}
                                  onChange={(e) => setEditCreditsAllocated(e.target.value)}
                                  className="w-12 px-1 py-0.5 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                                  min="0"
                                  placeholder="Total"
                                />
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                                  allUsed ? 'text-green-700 bg-green-100'
                                  : student.creditsAllocated === 0 ? 'text-gray-500 bg-gray-100'
                                  : creditPercent > 50 ? 'text-amber-700 bg-amber-100'
                                  : 'text-red-700 bg-red-100'
                                }`}>
                                  {student.creditsUsed}/{student.creditsAllocated}
                                </span>
                                {student.creditsAllocated > 0 && (
                                  <div className="w-12 bg-gray-200 rounded-full h-1.5">
                                    <div
                                      className={`h-1.5 rounded-full ${allUsed ? 'bg-green-500' : 'bg-amber-500'}`}
                                      style={{ width: `${Math.min(100, ((student.creditsUsed || 0) / student.creditsAllocated) * 100)}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">
                              {student.purchaseCount || 1}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {editingCredits === student.enrollmentId ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => saveInlineCredits(student)}
                                  className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors font-medium"
                                  title="Save changes"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={cancelEditingCredits}
                                  className="px-2 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors font-medium"
                                  title="Cancel editing"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEditingCredits(student)}
                                className="px-2 py-1 bg-amber-600 text-white text-xs rounded hover:bg-amber-700 transition-colors font-medium"
                                title={`Edit credits for ${student.name}`}
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Returning Students Section */}
        <div className="mb-8">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-blue-600 text-2xl">repeat</span>
              <h2 className="text-2xl font-bold text-gray-900">Returning Students ({stats.returningStudents})</h2>
            </div>
            <p className="text-sm text-gray-600 mb-6">Students who have purchased multiple courses</p>

            {loading ? (
              <p className="text-center text-gray-400 py-12">Loading...</p>
            ) : returningStudentsList.length === 0 ? (
              <p className="text-center text-gray-400 py-12">No returning students found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Name</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Email</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Course</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Purchased</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Status</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returningStudentsList.map((student, index) => (
                      <tr
                        key={index}
                        onClick={() => viewStudentDetail(student)}
                        className="border-b border-gray-100 hover:bg-blue-50 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 font-medium text-gray-900">{student.name}</td>
                        <td className="py-3 px-4 text-gray-600">{student.email}</td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-sm text-gray-900 bg-blue-100 px-2 py-1 rounded">
                            {student.courseIdentifier || 'N/A'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {student.coursePurchaseCount}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 capitalize">
                            Active
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm font-medium text-gray-500">
                            -
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
