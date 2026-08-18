import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import AdminPage from '../components/AdminPage';
function useIsMobile(bp = 768) {
  const [m, setM] = useState(typeof window !== 'undefined' ? window.innerWidth < bp : false);
  useEffect(() => {
    const h = () => setM(window.innerWidth < bp);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [bp]);
  return m;
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';
const MEMBER_BG = '#F3F0FF';
const MEMBER_COLOR = '#7C3AED';

// ─── Allocation progress bar ──────────────────────────────────────────────────
function AllocBar({ label, used, total, color }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div style={{ marginBottom: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
        <span style={{ fontSize: '9px', color: MUTED }}>{label}</span>
        <span style={{ fontSize: '9px', color: MUTED }}>{used}/{total}</span>
      </div>
      <div style={{ height: '3px', backgroundColor: ALT, position: 'relative', width: '60px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, backgroundColor: color || TC }} />
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, label }) {
  const map = {
    active:    { label: 'Active',    bg: '#E8F5E9', color: '#2E7D32' },
    upcoming:  { label: 'Upcoming',  bg: TC_LIGHT,  color: TC_DARK },
    paused:    { label: 'Paused',    bg: '#FFF8E1', color: '#F57F17' },
    // Past students split by what the studio can actually prove. 'completed'
    // is the honest default — true of every alumnus — and 'collected' is only
    // claimed for the few whose batches are all terminal. A student with no
    // batch record stays 'completed'; the pipeline started partway through the
    // studio's history, so a blank record is unknown, not clear.
    completed: { label: 'Course finished', bg: ALT, color: MUTED },
    collected: { label: 'Works collected', bg: '#E8F5E9', color: '#2E7D32' },
    hb:        { label: 'HB',        bg: '#FFF3E0', color: '#E65100' },
    member:    { label: 'Member',    bg: MEMBER_BG, color: MEMBER_COLOR },
    pending:   { label: 'Pending',   bg: '#EEF2FF', color: '#3730A3' },
    expiring:  { label: 'Expiring',  bg: '#FFF7E6', color: '#9E6200' },
    expired:   { label: 'Expired',   bg: ALT,       color: MUTED },
    // Same palette the booking rows use for an unbooked credit, so the list and
    // the student page describe the same state in the same colour.
    unbooked:  { label: 'Unbooked',  bg: '#FFFBEA', color: '#9E6200' },
  };
  const cfg = map[status] || map.active;
  const text = label || cfg.label;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      fontSize: '9px',
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      backgroundColor: cfg.bg,
      color: cfg.color,
    }}>
      {text}
    </span>
  );
}

// ─── Uncollected work ─────────────────────────────────────────────────────────
// Wording matches the pipeline page (AdminPiecePipeline STATUS_LABELS) so a
// batch reads the same wherever you meet it.
const PIECE_LABELS = {
  logged:       'Logged / Drying',
  bisque_fired: 'Bisque Fired',
  glaze_fired:  'Glaze Fired',
  ready:        'Ready for Collection',
  collecting:   'Collection Scheduled',
  delivering:   'Delivery Scheduled',
  in_cabinet:   'In Cabinet',
};
// Finished and waiting on the student — these are the ones worth a nudge.
const PIECE_WAITING = ['ready', 'collecting', 'delivering', 'in_cabinet'];

function PieceStatus({ pieces }) {
  if (!pieces) return null;

  // No batch record at all is UNKNOWN, not collected. The piece pipeline only
  // started partway through the studio's history, so most older students have
  // no row — a tick here would be a false all-clear on work that may still be
  // on a shelf. Render nothing and let the blank speak for itself.
  if (!pieces.hasRecord) return null;

  if (pieces.outstandingBatches === 0) {
    return (
      <div style={{ fontSize: '10px', color: '#2E7D32', marginTop: '2px' }}>
        &#10003; Work collected
      </div>
    );
  }

  const waiting = PIECE_WAITING.includes(pieces.furthestStatus);
  const label = PIECE_LABELS[pieces.furthestStatus] || 'In the studio';
  const days = pieces.readyAt
    ? Math.floor((Date.now() - new Date(pieces.readyAt)) / 86400000)
    : null;

  return (
    <div style={{ fontSize: '10px', color: waiting ? '#B3261E' : '#9E6200', marginTop: '2px', fontWeight: 600 }}>
      {pieces.outstandingPieces} {pieces.outstandingPieces === 1 ? 'piece' : 'pieces'} — {label}
      {waiting && days != null && days > 0 && (
        <span style={{ fontWeight: 400 }}> · waiting {days}d</span>
      )}
    </div>
  );
}

// ─── Membership display helpers ───────────────────────────────────────────────
function getDisplayType(rawType) {
  if (!rawType) return '—';
  const match = rawType.match(/(\d+)\s*month/i);
  if (match) return `${match[1]} Month`;
  return rawType;
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function AdminStudents() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const isMobile = useIsMobile();

  const [loading,     setLoading]     = useState(false);
  const [summaryStats, setSummaryStats] = useState(null);

  // Stats
  const [stats, setStats] = useState({
    totalStudents: 0,
    activeStudents: 0,
    returningStudents: 0,
    inactiveStudents: 0,
  });

  const [courseStats,    setCourseStats]    = useState({});
  const [topPerformers,  setTopPerformers]  = useState({ topReturning: [], topActive: [], topBooked: [] });

  // Student lists
  const [activeStudentsList,     setActiveStudentsList]     = useState([]);
  const [pausedStudentsList,     setPausedStudentsList]     = useState([]);
  const [returningStudentsList,  setReturningStudentsList]  = useState([]);
  const [upcomingEnrollmentsList,setUpcomingEnrollmentsList]= useState([]);
  const [hbStudentsList,         setHbStudentsList]         = useState([]);
  // Students whose every enrollment is finished. Kept out of the default view
  // but still in the app, so they can be found, chased for uncollected work,
  // and included in a mailout.
  const [pastStudentsList,       setPastStudentsList]       = useState([]);

  // Members data
  const [membersList,        setMembersList]        = useState([]);
  const [membershipByEmail,  setMembershipByEmail]  = useState({});

  // WT sorting / filter
  const [sortBy,         setSortBy]         = useState('earliest');
  const [selectedCohort, setSelectedCohort] = useState('all');

  // HB sorting / filter
  const [hbSortBy,       setHbSortBy]       = useState('name');
  const [showCompleted,  setShowCompleted]  = useState(false);

  // HB inline editing
  const [editingCredits,      setEditingCredits]      = useState(null);
  const [resumingId,          setResumingId]          = useState(null);
  const [editCreditsUsed,     setEditCreditsUsed]     = useState('');
  const [editCreditsAllocated,setEditCreditsAllocated]= useState('');

  // HB bulk selection
  const [resyncingHB,   setResyncingHB]   = useState(false);
  const [markingDone,   setMarkingDone]   = useState(null);
  const [selectedHB,    setSelectedHB]    = useState(new Set());
  const [bulkProcessing,setBulkProcessing]= useState(false);

  // UI: active tab, search, sort within unified view
  const [tab,    setTab]    = useState('all');   // 'all' | 'students' | 'members' | 'student-member'
  const [search, setSearch] = useState('');
  const [uiFilter, setUiFilter] = useState('all'); // 'all'|'wt-all'|'pkg-wt6'|'pkg-wt7'|'pkg-wt10'|'pkg-wt18'|'hb-all'|'pkg-hb4'|'pkg-hb8'|'members'
  const [uiSort, setUiSort] = useState('recent'); // 'cohort'|'name'|'recent'|'expiry'|'plan'
  const [pageSize, setPageSize] = useState('all'); // 10 | 50 | 'all'
                                                   // member sorts: 'expiry'|'plan'|'name'|'recent'

  // Server-side pagination
  const [pagination, setPagination] = useState({ page: 0, total: 0, totalPages: 0 });
  const [loadingMore, setLoadingMore] = useState(false);
  const SERVER_PAGE_SIZE = 'all';

  // Students owed classes with nothing booked ahead of them. Surfaced as a
  // filter on this list rather than a page of its own, the same way the paused
  // view was folded in — they are the same students, seen from another angle.
  const [owedEnrollmentIds, setOwedEnrollmentIds] = useState(new Set());
  const [owedSummary, setOwedSummary] = useState({ students: 0, classes: 0 });

  useEffect(() => {
    // Phase 1: instant summary counts
    api.get('/admin/students/stats/summary').then(({ data }) => {
      setSummaryStats(data);
    }).catch(() => {});
    // Phase 2: fast student list (2 queries instead of 10)
    loadStudentList(1);
    // Phase 3: who is owed classes but has nothing coming
    api.get('/admin/students/idle-credits').then(({ data }) => {
      setOwedEnrollmentIds(new Set((data.students || []).map(s => s.enrollmentId)));
      setOwedSummary({ students: data.totalStudents || 0, classes: data.totalClassesOwed || 0 });
    }).catch(() => {});
  }, []);

  // ─── Data loading (fast endpoint) ──────────────────────────────────────────
  const loadStudentList = async (page = 1, append = false) => {
    try {
      if (append) setLoadingMore(true); else setLoading(true);
      const { data } = await api.get('/admin/students/list', {
        params: { page, limit: SERVER_PAGE_SIZE }
      });

      const students = data.students || [];
      // Split into categories for existing UI
      // Past students are keyed off the server's isPastStudent flag, not off
      // status: a finished HB that still has credits also carries status
      // 'completed' but belongs in the HB list, where its credit workflow lives.
      const past = students.filter(s => s.isPastStudent);
      const wt = students.filter(s => s.isWT && !s.isPastStudent && s.enrollmentStatus !== 'paused' && s.enrollmentStatus !== 'completed');
      const hb = students.filter(s => s.isHB && !s.isPastStudent);
      const paused = students.filter(s => s.enrollmentStatus === 'paused');
      const members = students.filter(s => s.enrollmentStatus === 'member');

      if (append) {
        setActiveStudentsList(prev => [...prev, ...wt]);
        setHbStudentsList(prev => [...prev, ...hb]);
        setPausedStudentsList(prev => [...prev, ...paused]);
        setMembersList(prev => [...prev, ...members]);
        setPastStudentsList(prev => [...prev, ...past]);
      } else {
        setActiveStudentsList(wt);
        setHbStudentsList(hb);
        setPausedStudentsList(paused);
        setMembersList(members);
        setPastStudentsList(past);
      }
      setMembershipByEmail(prev => ({ ...(append ? prev : {}), ...(data.membershipByEmail || {}) }));
      setPagination(data.pagination || { page: 1, total: 0, totalPages: 1 });
    } catch (error) {
      console.error('[AdminStudents] Failed to load:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (pagination.page < pagination.totalPages) {
      loadStudentList(pagination.page + 1, true);
    }
  };

  const loadAll = async () => {
    try {
      setLoadingMore(true);
      const { data } = await api.get('/admin/students/list', {
        params: { limit: 'all' }
      });
      const students = data.students || [];
      setActiveStudentsList(students.filter(s => s.isWT && !s.isPastStudent && s.enrollmentStatus !== 'paused' && s.enrollmentStatus !== 'completed'));
      setHbStudentsList(students.filter(s => s.isHB && !s.isPastStudent));
      setPausedStudentsList(students.filter(s => s.enrollmentStatus === 'paused'));
      setMembersList(students.filter(s => s.enrollmentStatus === 'member'));
      setPastStudentsList(students.filter(s => s.isPastStudent));
      setMembershipByEmail(data.membershipByEmail || {});
      setPagination(data.pagination || { page: 1, total: 0, totalPages: 1 });
    } catch (error) {
      console.error('[AdminStudents] Failed to load all:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const resyncHBOrders = async () => {
    try {
      setResyncingHB(true);
      const customersResponse = await api.post('/admin/sync-shopify-customers');
      const ordersResponse    = await api.post('/admin/sync-shopify-orders', { sinceDate: '2025-07-01T00:00:00Z' });
      const hbResponse        = await api.post('/admin/backfill-hb-credits');
      await loadStats();
      alert(
        `HB Re-sync Complete!\n\n` +
        `Customers synced: ${customersResponse.data.count || 0}\n` +
        `New enrollments: ${ordersResponse.data.enrollmentsCreated || 0}\n` +
        `Already existed: ${ordersResponse.data.skippedCount || 0}\n` +
        `HB credits fixed: ${hbResponse.data.fixed || 0}`
      );
    } catch (error) {
      alert(`Failed to re-sync: ${error.response?.data?.error || error.message}`);
    } finally {
      setResyncingHB(false);
    }
  };

  // ─── HB bulk helpers ──────────────────────────────────────────────────────
  const toggleHBSelect = (enrollmentId, e) => {
    e.stopPropagation();
    setSelectedHB(prev => {
      const next = new Set(prev);
      if (next.has(enrollmentId)) next.delete(enrollmentId); else next.add(enrollmentId);
      return next;
    });
  };

  const toggleSelectAllHB = (e) => {
    e.stopPropagation();
    const sorted = getSortedHbStudents();
    setSelectedHB(selectedHB.size === sorted.length ? new Set() : new Set(sorted.map(s => s.enrollmentId)));
  };

  const startEditingCredits = (student) => {
    setEditingCredits(student.enrollmentId);
    setEditCreditsUsed((student.creditsUsed || 0).toString());
    setEditCreditsAllocated((student.creditsAllocated || 0).toString());
  };

  const cancelEditingCredits = () => {
    setEditingCredits(null);
    setEditCreditsUsed('');
    setEditCreditsAllocated('');
  };

  // Resume a paused enrollment. Lives here rather than on a separate page so
  // paused students are actioned from the same list they already appear in.
  const handleResumeStudent = async (student) => {
    if (!student.studentId) { alert('Cannot resume: student id missing'); return; }
    if (!confirm(`Resume ${student.name}?\n\nTheir paused enrolment becomes active again.`)) return;
    try {
      setResumingId(student.studentId);
      await api.post(`/admin/students/${student.studentId}/resume`);
      await loadStats();
    } catch (error) {
      alert(`Failed to resume: ${error.response?.data?.error || error.message}`);
    } finally {
      setResumingId(null);
    }
  };

  const saveInlineCredits = async (student) => {
    const used      = parseInt(editCreditsUsed);
    const allocated = parseInt(editCreditsAllocated);
    if (isNaN(used) || isNaN(allocated) || used < 0 || allocated < 0) { alert('Please enter valid numbers'); return; }
    if (used > allocated) { alert('Used credits cannot exceed allocated credits'); return; }
    try {
      await api.post(`/admin/hb-enrollments/${student.enrollmentId}/set-credits`, { allocated, used });
      await loadStats();
      cancelEditingCredits();
    } catch (error) {
      alert(`Failed: ${error.response?.data?.error || error.message}`);
    }
  };

  const setIndividualCredits = async (student) => {
    const currentUsed      = student.creditsUsed || 0;
    const currentAllocated = student.creditsAllocated || 0;
    const input = prompt(
      `Set credits for ${student.name}\n\nCurrent: ${currentUsed}/${currentAllocated}\n\nEnter "used/allocated":`,
      `${currentUsed}/${currentAllocated}`
    );
    if (!input) return;
    const match = input.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!match) { alert('Invalid format. Use "used/allocated" e.g. "3/6"'); return; }
    const used = parseInt(match[1]), allocated = parseInt(match[2]);
    if (used > allocated) { alert('Used credits cannot exceed allocated credits'); return; }
    if (!confirm(`Set ${student.name} to ${used}/${allocated} credits?`)) return;
    try {
      await api.post(`/admin/hb-enrollments/${student.enrollmentId}/set-credits`, { allocated, used });
      await loadStats();
    } catch (error) {
      alert(`Failed: ${error.response?.data?.error || error.message}`);
    }
  };

  // Closes the credit block rather than forcing used = allocated. Same outcome
  // on screen; the difference is that the reason survives and the counter stops
  // contradicting the bookings ledger.
  const markSelectedDone = async () => {
    const selected = hbStudentsList.filter(s => selectedHB.has(s.enrollmentId) && s.creditsRemaining > 0);
    if (selected.length === 0) { alert('No selected students with remaining credits'); return; }

    const totalWrittenOff = selected.reduce((sum, s) => sum + (s.creditsRemaining || 0), 0);
    const reason = prompt(
      `Close the credit block for ${selected.length} student(s)?\n\n` +
      `${selected.map(s => `${s.name} — ${s.creditsRemaining} left`).join('\n')}\n\n` +
      `${totalWrittenOff} class(es) will be written off.\n\nReason (required):`,
      'Block finished — remaining classes written off'
    );
    if (!reason || !reason.trim()) return;

    try {
      setBulkProcessing(true);
      const results = await Promise.allSettled(selected.map(s =>
        api.post(`/admin/enrollments/${s.enrollmentId}/close-credits`, { reason: reason.trim() })
      ));
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length) {
        alert(`${results.length - failed.length} closed, ${failed.length} failed:\n` +
          failed.map(f => f.reason?.response?.data?.error || f.reason?.message).join('\n'));
      }
      setSelectedHB(new Set());
      await loadStats();
    } catch (error) {
      alert(`Failed: ${error.response?.data?.error || error.message}`);
    } finally {
      setBulkProcessing(false);
    }
  };

  const bulkSetCredits = async () => {
    const selected = hbStudentsList.filter(s => selectedHB.has(s.enrollmentId));
    if (selected.length === 0) { alert('No students selected'); return; }
    const input = prompt(`Set credits for ${selected.length} student(s)\nFormat: used/allocated`, '');
    if (!input) return;
    const match = input.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!match) { alert('Invalid format. Use "used/allocated" e.g. "3/4"'); return; }
    const used = parseInt(match[1]), allocated = parseInt(match[2]);
    if (!confirm(`Set ${selected.length} student(s) to ${used}/${allocated} credits?`)) return;
    try {
      setBulkProcessing(true);
      await Promise.all(selected.map(s =>
        api.post(`/admin/hb-enrollments/${s.enrollmentId}/set-credits`, { allocated, used })
      ));
      setSelectedHB(new Set());
      await loadStats();
    } catch (error) {
      alert(`Failed: ${error.response?.data?.error || error.message}`);
    } finally {
      setBulkProcessing(false);
    }
  };

  const cancelSelected = async () => {
    const selected = hbStudentsList.filter(s => selectedHB.has(s.enrollmentId));
    if (selected.length === 0) { alert('No students selected'); return; }
    if (!confirm(`Remove ${selected.length} student(s) from HB list?\n\n${selected.map(s => s.name).join('\n')}`)) return;
    try {
      setBulkProcessing(true);
      await Promise.all(selected.map(s =>
        api.post(`/admin/hb-enrollments/${s.enrollmentId}/set-status`, { status: 'cancelled' })
      ));
      setSelectedHB(new Set());
      await loadStats();
    } catch (error) {
      alert(`Failed: ${error.response?.data?.error || error.message}`);
    } finally {
      setBulkProcessing(false);
    }
  };

  const viewStudentDetail = (student) => {
    navigate(`/admin/students/${encodeURIComponent(student.email)}`);
  };

  // ─── Course identifier helpers ─────────────────────────────────────────────
  const parseCourseStartDate = (courseIdentifier) => {
    if (!courseIdentifier || courseIdentifier === 'N/A') return null;
    const match = courseIdentifier.match(/^[A-Z]{2}(\d{4})([A-Z]{2})?/);
    if (!match) return null;
    const ddmm = match[1];
    const timeOfDay = match[2];
    const day   = parseInt(ddmm.substring(0, 2));
    const month = parseInt(ddmm.substring(2, 4));
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    let hour = 12;
    if (timeOfDay === 'AM') hour = 9;
    else if (timeOfDay === 'PM') hour = 19;
    else if (timeOfDay === 'NT') hour = 20;
    return new Date(2026, month - 1, day, hour, 0, 0);
  };

  const getStudentCohort = (student) => {
    const courseDate = parseCourseStartDate(student.courseIdentifier);
    if (!courseDate) return null;
    const day   = courseDate.getDate();
    const month = courseDate.getMonth();
    if (month === 0 && [17, 19, 20, 22, 23].includes(day)) return 'cohort1';
    if (month === 1 && day === 28) return 'cohort2';
    if (month === 2 && [1, 5, 6, 10].includes(day)) return 'cohort2';
    return null;
  };

  // ─── WT sorted list (used by legacy sort controls + unified table) ─────────
  const getSortedActiveStudents = () => {
    const combined = [
      ...activeStudentsList,
      ...upcomingEnrollmentsList.map(s => ({ ...s, enrollmentStatus: 'upcoming', weeksRemaining: s.weeksRemaining || 0 })),
    ];
    let filtered = combined;
    if (selectedCohort !== 'all') filtered = combined.filter(s => getStudentCohort(s) === selectedCohort);
    switch (sortBy) {
      case 'earliest': return filtered.sort((a, b) => (parseCourseStartDate(a.courseIdentifier) || new Date(0)) - (parseCourseStartDate(b.courseIdentifier) || new Date(0)));
      case 'latest':   return filtered.sort((a, b) => (parseCourseStartDate(b.courseIdentifier) || new Date(0)) - (parseCourseStartDate(a.courseIdentifier) || new Date(0)));
      case 'name':     return filtered.sort((a, b) => a.name.localeCompare(b.name));
      case 'remaining':return filtered.sort((a, b) => (b.weeksRemaining || 0) - (a.weeksRemaining || 0));
      default:         return filtered;
    }
  };

  const getSortedHbStudents = () => {
    let filtered = [...hbStudentsList];
    if (!showCompleted) filtered = filtered.filter(s => s.creditsRemaining > 0 || s.creditsAllocated === 0 || s.enrollmentStatus === 'active');
    switch (hbSortBy) {
      case 'name':     return filtered.sort((a, b) => a.name.localeCompare(b.name));
      case 'credits':  return filtered.sort((a, b) => { const d = (b.creditsRemaining||0)-(a.creditsRemaining||0); return d !== 0 ? d : (b.creditsAllocated||0)-(a.creditsAllocated||0); });
      case 'enrolled': return filtered.sort((a, b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));
      case 'variant':  return filtered.sort((a, b) => (a.variantTitle||a.courseTitle||'HB').localeCompare(b.variantTitle||b.courseTitle||'HB'));
      default:         return filtered;
    }
  };

  // A 10-class package is a 6-week cohort plus flex classes that may be taken later,
  // in another cohort or as HB. Once the block ends the cohort variant
  // ("FRIDAYS • 6 Mar–17 Apr") no longer describes what the student holds, so lead
  // with the package. The cohort code still renders beneath for calendar and roster
  // lookup. The count comes from the real allocation rather than the product title —
  // an allocation can legitimately exceed the product sold, via carry-over or an
  // admin adjustment, and the label must never contradict the bar beside it.
  const packageLabel = (s) => {
    const allocated = s.numberOfWeeks || 0;
    if (allocated < 10) return null; // package family only; HB variants already state their length
    const noExpiry = /NO EXPIRY/i.test(s.courseTitle || '');
    return `${allocated} Classes${noExpiry ? ' · NO EXPIRY' : ''}`;
  };

  // Variant titles come from Shopify and are not consistently formatted: three
  // different dash characters, "Jun"/"June", "Sept"/"Sep", stray spaces around the
  // dash, and a few that glue the time onto the date range with no bullet. On a
  // package row the cohort is supporting detail, so reduce every shape to one:
  //   FRIDAYS • 6 Mar – 17 Apr
  // Times and "NO CLASS" notes are dropped — they describe a cohort that has ended.
  const CV_DASH = '[\\u2010-\\u2015\\-]'; // hyphen through horizontal bar, per the order-sync fix
  const CV_MONTHS = {
    JANUARY: 'Jan', JAN: 'Jan', FEBRUARY: 'Feb', FEB: 'Feb', MARCH: 'Mar', MAR: 'Mar',
    APRIL: 'Apr', APR: 'Apr', MAY: 'May', JUNE: 'Jun', JUN: 'Jun', JULY: 'Jul', JUL: 'Jul',
    AUGUST: 'Aug', AUG: 'Aug', SEPTEMBER: 'Sep', SEPT: 'Sep', SEP: 'Sep', OCTOBER: 'Oct',
    OCT: 'Oct', NOVEMBER: 'Nov', NOV: 'Nov', DECEMBER: 'Dec', DEC: 'Dec',
  };
  const cohortDayAndDates = (variantTitle) => {
    if (!variantTitle) return null;
    const parts = variantTitle.split('•').map(p => p.trim()).filter(Boolean);
    if (!parts.length) return null;
    const day = parts[0].toUpperCase();
    let dates = (parts[1] || '')
      .replace(/\s*\d{1,2}[:.]\d{2}\s*(am|pm).*$/i, '')  // time glued on with no bullet
      .replace(/\s*NO\s*CLASS.*$/i, '')                   // trailing exception note
      .trim();
    if (!dates) return day;
    dates = dates
      .replace(new RegExp(`\\s*${CV_DASH}\\s*`, 'g'), ' – ')
      .replace(/\b([A-Za-z]{3,9})\b/g, m => CV_MONTHS[m.toUpperCase()] || m);
    return `${day} • ${dates}`;
  };

  // ─── Unified list: students + members together ──────────────────────────────
  const buildUnifiedList = () => {
    const wtActive = getSortedActiveStudents().map(s => {
      const membership = membershipByEmail[s.email];
      return {
        ...s,
        _type: membership ? 'student-member' : (s.enrollmentStatus === 'upcoming' ? 'wt-next' : 'wt-now'),
        _cardType: 'student',
        _wtUsed: s.classesAttended || 0,
        _wtTotal: s.classesAllocated || 6,
        _hbUsed: null, _hbTotal: null,
        _purchaseCount: s.coursePurchaseCount || 1,
        _enrollmentId: s.enrollmentId,
        _variantTitle: packageLabel(s) || s.variantTitle || s.courseIdentifier || '',
        _cohortLine: packageLabel(s) ? cohortDayAndDates(s.variantTitle) : null,
        _lastClassDate: null,
        _recentDate: s.latestEnrollmentDate || s.enrollmentCreatedAt || s.coursePurchaseDate || null,
        _membership: membership || null,
        _statusKey: s.enrollmentStatus === 'upcoming' ? 'upcoming' : 'active',
        _courseEnded: s.courseEnded || false,
        _unbookedCredits: s.unbookedCredits || 0,
        _packageTotalCourses: s.packageTotalCourses || null,
        _upcomingCourse: s.upcomingCourse || null,
      };
    });

    const hbAll = getSortedHbStudents().map(s => {
      const membership = membershipByEmail[s.email];
      return {
        ...s,
        _type: membership ? 'student-member' : 'hb',
        _cardType: 'hb',
        _wtUsed: null, _wtTotal: null,
        _hbUsed: s.creditsUsed || 0,
        _hbTotal: s.creditsAllocated || 0,
        _purchaseCount: s.coursePurchaseCount || s.purchaseCount || 1,
        _enrollmentId: s.enrollmentId,
        _variantTitle: s.variantTitle || s.courseTitle || 'HB',
        _lastClassDate: null,
        _recentDate: s.latestEnrollmentDate || s.enrollmentCreatedAt || s.createdAt || null,
        _membership: membership || null,
        _statusKey: 'hb',
      };
    });

    const paused = pausedStudentsList.map(s => {
      const membership = membershipByEmail[s.email];
      return {
        ...s,
        _type: membership ? 'student-member' : 'paused',
        _cardType: 'paused',
        _wtUsed: null, _wtTotal: null,
        _hbUsed: null, _hbTotal: null,
        _purchaseCount: s.coursePurchaseCount || 1,
        _enrollmentId: s.enrollmentId,
        _variantTitle: packageLabel(s) || s.variantTitle || s.courseIdentifier || '',
        _cohortLine: packageLabel(s) ? cohortDayAndDates(s.variantTitle) : null,
        _lastClassDate: null,
        _recentDate: s.latestEnrollmentDate || s.enrollmentCreatedAt || s.coursePurchaseDate || null,
        _membership: membership || null,
        _statusKey: 'paused',
      };
    });

    // Members-only (no student enrollment)
    const membersOnly = membersList.map(m => {
      const mem = m.membership || m; // membership data may be nested or flat
      return {
        ...m,
        _type: 'member',
        _cardType: 'member',
        _wtUsed: null, _wtTotal: null,
        _hbUsed: null, _hbTotal: null,
        _purchaseCount: 0,
        _enrollmentId: null,
        _variantTitle: getDisplayType(mem.membershipType),
        _lastClassDate: null,
        _recentDate: mem.startDate || m.enrollmentCreatedAt || null,
        _membership: mem,
        _statusKey: mem.membershipStatus || 'member',
      };
    });

    const pastStudents = pastStudentsList.map(s => {
      const membership = membershipByEmail[s.email];
      return {
        ...s,
        _type: membership ? 'student-member' : 'past',
        _cardType: 'student',
        _wtUsed: s.classesAttended || 0,
        _wtTotal: s.isWT ? (s.classesAllocated || 6) : null,
        _hbUsed: s.isHB ? (s.creditsUsed || 0) : null,
        _hbTotal: s.isHB ? (s.creditsAllocated || 0) : null,
        _purchaseCount: s.coursePurchaseCount || 1,
        _enrollmentId: s.enrollmentId,
        _variantTitle: packageLabel(s) || s.variantTitle || s.courseIdentifier || '',
        _cohortLine: packageLabel(s) ? cohortDayAndDates(s.variantTitle) : null,
        _lastClassDate: s.lastClassDate || null,
        _recentDate: s.lastClassDate || s.courseEndDate || s.latestEnrollmentDate || s.enrollmentCreatedAt || null,
        _membership: membership || null,
        _statusKey: 'completed',
        _packageTotalCourses: s.packageTotalCourses || null,
      };
    });

    return [...wtActive, ...hbAll, ...paused, ...membersOnly, ...pastStudents];
  };

  const tabFilter = (student) => {
    if (tab === 'all')            return true;
    if (tab === 'students')       return student._cardType !== 'member';
    if (tab === 'members')        return student._type === 'member' || student._type === 'student-member';
    if (tab === 'student-member') return student._type === 'student-member';
    return true;
  };

  // Sort options differ based on tab
  const isOnMemberTab = tab === 'members';

  const applySort = (list) => {
    switch (uiSort) {
      case 'name':       return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      case 'course-asc': return [...list].sort((a, b) => (parseCourseStartDate(a.courseIdentifier) || new Date(9e14)) - (parseCourseStartDate(b.courseIdentifier) || new Date(9e14)));
      case 'course-desc':return [...list].sort((a, b) => (parseCourseStartDate(b.courseIdentifier) || new Date(0)) - (parseCourseStartDate(a.courseIdentifier) || new Date(0)));
      case 'recent':     return [...list].sort((a, b) => new Date(b._recentDate || 0) - new Date(a._recentDate || 0));
      case 'expiry':     return [...list].sort((a, b) => {
        const statusOrder = { active: 0, expiring: 0, expired: 1, cancelled: 2 };
        const sa = statusOrder[a._membership?.membershipStatus] ?? 3;
        const sb = statusOrder[b._membership?.membershipStatus] ?? 3;
        if (sa !== sb) return sa - sb;
        return (a._membership?.daysRemaining ?? 9999) - (b._membership?.daysRemaining ?? 9999);
      });
      case 'plan':       return [...list].sort((a, b) => (a._membership?.membershipType || '').localeCompare(b._membership?.membershipType || ''));
      case 'cohort':
      default: {
        return [...list].sort((a, b) => {
          const ca = a.courseIdentifier || a._variantTitle || 'zzz';
          const cb = b.courseIdentifier || b._variantTitle || 'zzz';
          return ca !== cb ? ca.localeCompare(cb) : (a.name || '').localeCompare(b.name || '');
        });
      }
    }
  };

  const allUsers  = buildUnifiedList();
  // Headline counts describe who is currently in the studio. Past students are
  // excluded so "Students" keeps meaning what it always did — folding 189
  // alumni in would turn ~109 into ~298 and make the number useless at a
  // glance. Their own filter carries their count.
  const currentUsers = allUsers.filter(s => s._statusKey !== 'completed');
  const tabCounts = {
    all:              currentUsers.length,
    students:         currentUsers.filter(s => s._cardType !== 'member').length,
    members:          currentUsers.filter(s => s._type === 'member' || s._type === 'student-member').length,
    'student-member': currentUsers.filter(s => s._type === 'student-member').length,
  };

  // Package type filter helper
  const getPackageKey = (s) => {
    const isWT = s._cardType === 'hb' ? false : (s._wtTotal != null);
    const isHB = s._cardType === 'hb';
    // For WT: check package_total_courses first (3-course package = pkg-wt18)
    if (isWT && s._packageTotalCourses === 3) return 'pkg-wt18';
    const total = isWT ? (s._wtTotal || 6) : (s._hbTotal || 0);
    if (isWT && total <= 6) return 'pkg-wt6';
    if (isWT && total === 7) return 'pkg-wt7';
    if (isWT && total > 7) return 'pkg-wt10';   // 8+ classes = class-pool package (e.g. 10-class); real 3-course bundle is caught above via _packageTotalCourses === 3
    if (isHB && total <= 4) return 'pkg-hb4';
    if (isHB) return 'pkg-hb8';
    return 'pkg-other';
  };

  const searchLower  = search.toLowerCase();
  const visibleRows  = applySort(
    allUsers
      .filter(tabFilter)
      .filter(s => {
        // Past students stay out of every current-student view — 189 of them
        // would bury the ~109 people actually in the studio. A search overrides
        // this: typing a name should find anyone, whichever filter is selected.
        const isPast = s._statusKey === 'completed';
        if (uiFilter === 'past')             return isPast;
        if (uiFilter === 'past-uncollected') return isPast && (s.pieces?.outstandingBatches || 0) > 0;
        if (uiFilter === 'past-credit')      return isPast && (s.creditBalance || 0) > 0;
        if (uiFilter === 'past-collected')   return isPast && s.pieces?.hasRecord && s.pieces.outstandingBatches === 0;
        if (isPast) return searchLower.length > 0;
        if (uiFilter === 'all' || isOnMemberTab) return true;
        if (uiFilter === 'members') return s._type === 'member' || s._type === 'student-member';
        // Replaces the old standalone /admin/students/paused page.
        if (uiFilter === 'paused') return s._statusKey === 'paused';
        // Owed classes with nothing booked ahead — Nicole Wong's case, where a
        // cancelled follow-on cohort left classes owed and nobody prompted.
        if (uiFilter === 'owed') return owedEnrollmentIds.has(s.enrollmentId);
        if (uiFilter === 'wt-all') return getPackageKey(s).startsWith('pkg-wt');
        if (uiFilter === 'hb-all') return getPackageKey(s).startsWith('pkg-hb');
        return getPackageKey(s) === uiFilter;
      })
      .filter(s =>
        (s.name  || '').toLowerCase().includes(searchLower) ||
        (s.email || '').toLowerCase().includes(searchLower)
      )
  );

  // Past students who still have work in the studio — the actionable subset,
  // and the reason keeping alumni in the app matters. Counted over the whole
  // past list, not the visible rows, so the number is stable as filters change.
  const pastUncollected = pastStudentsList.reduce((acc, s) => {
    if ((s.pieces?.outstandingBatches || 0) > 0) {
      acc.students += 1;
      acc.pieces += s.pieces.outstandingPieces || 0;
    }
    return acc;
  }, { students: 0, pieces: 0 });

  // Past students still holding VES $ credit — money they've paid that the
  // studio hasn't delivered against. Disjoint from the uncollected-work group
  // today, so it's a genuinely separate list to work through.
  const pastCredit = pastStudentsList.reduce((acc, s) => {
    if ((s.creditBalance || 0) > 0) {
      acc.students += 1;
      acc.amount += s.creditBalance;
    }
    return acc;
  }, { students: 0, amount: 0 });

  // Alumni the pipeline can positively confirm are clear — every batch of
  // theirs reached collected/shipped/recycled. Deliberately not "everyone
  // without outstanding work": 166 past students have no batch record at all,
  // and unknown is not the same as collected.
  const pastCollected = pastStudentsList.filter(
    s => s.pieces?.hasRecord && s.pieces.outstandingBatches === 0
  ).length;

  // Sort options based on current tab
  const studentFilterOptions = [
    { key: 'all',        label: 'All' },
    { key: 'wt-all',    label: 'All WT' },
    { key: 'pkg-wt6',   label: '  WT 6 Weeks' },
    { key: 'pkg-wt7',   label: '  WT 7 Weeks' },
    { key: 'pkg-wt10',  label: '  WT 10 Class' },
    { key: 'pkg-wt18',  label: '  WT 6 Weeks x3' },
    { key: 'hb-all',    label: 'All HB' },
    { key: 'pkg-hb4',   label: '  HB 4 Weeks' },
    { key: 'pkg-hb8',   label: '  HB 8 Weeks' },
    { key: 'members',   label: 'Memberships' },
    { key: 'paused',    label: 'Paused' },
    { key: 'owed',      label: owedSummary.students ? `Owed classes (${owedSummary.students})` : 'Owed classes' },
    { key: 'past',      label: pastStudentsList.length ? `Past students (${pastStudentsList.length})` : 'Past students' },
    { key: 'past-uncollected', label: pastUncollected.students
        ? `  Uncollected work (${pastUncollected.students})`
        : '  Uncollected work' },
    { key: 'past-collected', label: pastCollected
        ? `  Works collected (${pastCollected})`
        : '  Works collected' },
    { key: 'past-credit', label: pastCredit.students
        ? `  Has credit (${pastCredit.students})`
        : '  Has credit' },
  ];

  const studentSortOptions = [
    { key: 'cohort',      label: 'Cohort' },
    { key: 'course-asc',  label: 'Course (earliest)' },
    { key: 'course-desc', label: 'Course (latest)' },
    { key: 'name',        label: 'Name' },
    { key: 'recent',      label: 'Recent signup' },
  ];

  const memberSortOptions = [
    { key: 'expiry', label: 'Expiry' },
    { key: 'plan',   label: 'Plan' },
    { key: 'name',   label: 'Name' },
    { key: 'recent', label: 'Recent' },
  ];

  const currentSortOptions = (isOnMemberTab || uiFilter === 'members') ? memberSortOptions : studentSortOptions;

  // When switching tabs, reset sort if current sort doesn't exist in new tab
  const handleTabChange = (newTab) => {
    setTab(newTab);
    const newIsOnMember = newTab === 'members';
    if (newIsOnMember) {
      setUiSort('expiry');
    } else {
      const validSorts = studentSortOptions.map(o => o.key);
      if (!validSorts.includes(uiSort)) {
        setUiSort('cohort');
      }
    }
    setUiFilter(newIsOnMember ? 'all' : 'wt-all');
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <AdminPage title="Users">

        {/* ── Stats strip (clickable filter) + sort ────────────────────── */}
        <div style={{ border: `1px solid ${RULE}`, marginBottom: '0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', backgroundColor: RULE }}>
            {[
              { key: 'all',            label: 'All Users',        value: tabCounts.all },
              { key: 'students',       label: 'Students',         value: tabCounts.students },
              { key: 'members',        label: 'Members',          value: tabCounts.members },
              { key: 'student-member', label: 'Student & Member', value: tabCounts['student-member'] },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => handleTabChange(s.key)}
                style={{
                  backgroundColor: tab === s.key ? INK : '#FFFFFF',
                  padding: isMobile ? '10px 12px' : '16px 20px', border: 'none', cursor: 'pointer', textAlign: 'left',
                  transition: 'background-color 0.1s',
                }}
              >
                <div style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: 700, color: tab === s.key ? '#FFF' : INK, lineHeight: 1 }}>
                  {loading ? (summaryStats ? (summaryStats[s.key === 'all' ? 'totalStudents' : s.key === 'students' ? 'activeStudents' : s.key === 'members' ? 'activeMembers' : 'studentMembers'] ?? '—') : '—') : s.value}
                </div>
                <div style={{ fontSize: isMobile ? '8px' : '10px', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '4px', color: tab === s.key ? 'rgba(255,255,255,0.55)' : MUTED }}>
                  {s.label}
                </div>
              </button>
            ))}
          </div>
          {/* Sort row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: isMobile ? '6px 10px' : '8px 16px', borderTop: `1px solid ${RULE}`, backgroundColor: ALT }}>
            {!isOnMemberTab && (
              <>
                <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>Filter</span>
                <select
                  value={uiFilter}
                  onChange={e => {
                    setUiFilter(e.target.value);
                    if (e.target.value === 'members') setUiSort('expiry');
                    else if (uiSort === 'expiry' || uiSort === 'plan') setUiSort('cohort');
                  }}
                  style={{ padding: '4px 8px', border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', fontSize: '11px', fontWeight: 700, color: INK, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}
                >
                  {studentFilterOptions.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </>
            )}
            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>Sort</span>
            <select
              value={uiSort}
              onChange={e => setUiSort(e.target.value)}
              style={{ padding: '4px 8px', border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', fontSize: '11px', fontWeight: 700, color: INK, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}
            >
              {currentSortOptions.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Search ────────────────────────────────────────────────────── */}
        <div style={{ borderBottom: `1px solid ${RULE}`, borderLeft: `1px solid ${RULE}`, borderRight: `1px solid ${RULE}`, marginBottom: '24px' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search users…"
            style={{ width: '100%', padding: isMobile ? '8px 10px' : '10px 14px', border: 'none', backgroundColor: '#FFFFFF', fontSize: isMobile ? '12px' : '13px', color: INK, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
        </div>

        {/* ── HB bulk action bar (shown only when viewing HB students with selections) */}
        {(tab === 'all' || tab === 'students') && selectedHB.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', backgroundColor: TC_LIGHT, border: `1px solid ${RULE}`, borderTop: 'none' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: TC_DARK }}>{selectedHB.size} selected</span>
            <button onClick={markSelectedDone} disabled={bulkProcessing} style={{ padding: '5px 12px', backgroundColor: '#2E7D32', color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, cursor: bulkProcessing ? 'not-allowed' : 'pointer', opacity: bulkProcessing ? 0.5 : 1 }}>Mark Done</button>
            <button onClick={bulkSetCredits} disabled={bulkProcessing} style={{ padding: '5px 12px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, cursor: bulkProcessing ? 'not-allowed' : 'pointer', opacity: bulkProcessing ? 0.5 : 1 }}>Set Credits</button>
            <button onClick={cancelSelected} disabled={bulkProcessing} style={{ padding: '5px 12px', backgroundColor: '#B71C1C', color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, cursor: bulkProcessing ? 'not-allowed' : 'pointer', opacity: bulkProcessing ? 0.5 : 1 }}>Remove</button>
            <button onClick={() => setSelectedHB(new Set())} style={{ padding: '5px 12px', backgroundColor: 'transparent', border: `1px solid ${RULE}`, fontSize: '11px', fontWeight: 700, color: MUTED, cursor: 'pointer' }}>Clear</button>
            <div style={{ flex: 1 }} />
            <button onClick={resyncHBOrders} disabled={resyncingHB} style={{ padding: '5px 12px', backgroundColor: 'transparent', border: `1px solid ${RULE}`, fontSize: '11px', fontWeight: 700, color: INK, cursor: resyncingHB ? 'not-allowed' : 'pointer', opacity: resyncingHB ? 0.5 : 1 }}>
              {resyncingHB ? 'Re-syncing…' : 'Re-sync HB Orders'}
            </button>
          </div>
        )}

        {/* ── User table ─────────────────────────────────────────────── */}
        <div style={{ border: `1px solid ${RULE}`, borderTop: 'none', backgroundColor: '#FFFFFF', overflowX: 'auto' }}>

          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 100px 100px', minWidth: '600px', padding: isMobile ? '8px 10px' : '10px 16px', backgroundColor: ALT, borderBottom: `1px solid ${RULE}` }}>
            {['User', 'Course / Membership', 'Progress', 'Status'].map((h, i) => (
              <span key={i} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{h}</span>
            ))}
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
              {summaryStats ? `Loading ${summaryStats.totalStudents} users…` : 'Loading…'}
            </div>
          )}

          {/* Empty */}
          {!loading && visibleRows.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No users found</div>
          )}

          {/* Rows */}
          {!loading && (pageSize === 'all' ? visibleRows : visibleRows.slice(0, pageSize)).map((student, i) => {
            const isMember       = student._cardType === 'member';
            const isDual         = student._type === 'student-member';
            const isHB           = student._cardType === 'hb';
            const isSelected     = isHB && selectedHB.has(student._enrollmentId);
            const hbAllUsed      = isHB && student._hbTotal > 0 && (student.classesAttended || 0) >= student._hbTotal;
            const membership     = student._membership;

            // Determine status key for badge
            let statusKey = student._statusKey;
            if (isMember && membership) statusKey = membership.membershipStatus || 'member';
            // Upgrade a past student's badge only where the pipeline can prove
            // every batch left the studio. _statusKey itself stays 'completed'
            // so the past-student filters and the last-class line keep working
            // off a single marker.
            if (student._statusKey === 'completed'
                && student.pieces?.hasRecord
                && student.pieces.outstandingBatches === 0) {
              statusKey = 'collected';
            }
            // Every class of this course is in the past, but the student has not
            // spent what they paid for. Badging that ACTIVE beside the course's
            // own finished date range reads as "still attending a course that
            // ended in February"; what is actually true is that classes are owed.
            const unbookedLeft = student._courseEnded ? (student._unbookedCredits || 0) : 0;
            if (statusKey === 'active' && unbookedLeft > 0) statusKey = 'unbooked';

            return (
              <div
                key={`${student._enrollmentId || student.email}-${i}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 180px 100px 100px',
                  minWidth: '600px',
                  padding: isDual ? (isMobile ? '10px 10px' : '14px 16px') : (isMobile ? '8px 10px' : '12px 16px'),
                  borderBottom: i < visibleRows.length - 1 ? `1px solid ${RULE}` : 'none',
                  backgroundColor: isSelected ? TC_LIGHT : isDual ? '#FAFBFF' : hbAllUsed ? '#FAFAFA' : '#FFFFFF',
                  alignItems: (isDual || student._upcomingCourse) ? 'start' : 'center',
                  transition: 'background-color 0.1s',
                  cursor: 'pointer',
                  opacity: hbAllUsed ? 0.65 : 1,
                  borderLeft: isDual ? `3px solid ${MEMBER_COLOR}` : isMember ? `3px solid ${MEMBER_COLOR}` : '3px solid transparent',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = TC_LIGHT; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = isSelected ? TC_LIGHT : isDual ? '#FAFBFF' : hbAllUsed ? '#FAFAFA' : '#FFFFFF'; }}
                onClick={() => viewStudentDetail(student)}
              >
                {/* Name + email + type badge */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                    <span style={{ fontSize: isMobile ? '12px' : '13px', fontWeight: 700 }}>{student.name}</span>
                    {isDual && (
                      <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '1px 5px', backgroundColor: MEMBER_BG, color: MEMBER_COLOR }}>S+M</span>
                    )}
                    {hbAllUsed && (
                      <span style={{ fontSize: '9px', fontWeight: 700, color: '#2E7D32' }}>&#10003; Done</span>
                    )}
                  </div>
                  <div style={{ fontSize: isMobile ? '10px' : '11px', color: MUTED }}>{student.email}</div>
                  <div style={{ fontSize: '10px', color: student.lastLoginAt ? '#059669' : '#D97706', marginTop: '2px' }}>
                    {student.lastLoginAt
                      ? `Last login: ${new Date(student.lastLoginAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${student.loginCount > 0 ? ` (${student.loginCount})` : ''}`
                      : 'Never logged in'}
                  </div>
                  {/* Both sit on every row type, not just alumni — a current
                      student or a member can just as easily have work waiting
                      or credit unspent. */}
                  <PieceStatus pieces={student.pieces} />
                  {student.creditBalance > 0 && (
                    <div style={{ fontSize: '10px', color: TC_DARK, marginTop: '2px', fontWeight: 700 }}>
                      ${student.creditBalance} credit
                    </div>
                  )}
                  {/* The date they were last in the studio, derived from
                      bookings — not the planned course end, which is null for
                      credit-based HB rows and occasionally sits in the future
                      on an enrollment whose course never ran. */}
                  {student._statusKey === 'completed' && student._lastClassDate && (
                    <div style={{ fontSize: '10px', color: MUTED, marginTop: '2px' }}>
                      Last class {new Date(student._lastClassDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </div>
                  )}
                  {/* Enrolled, paid, and never booked into anything. Rarer and
                      more serious than a missing date — it means the studio owes
                      them classes nobody has scheduled. */}
                  {student._statusKey === 'completed' && !student._lastClassDate && (
                    <div style={{ fontSize: '10px', color: '#B3261E', marginTop: '2px', fontWeight: 600 }}>
                      Never booked into a class
                    </div>
                  )}
                </div>

                {/* Course + Progress + Status — stacked sub-rows */}
                <div style={{ display: 'contents' }}>
                  {/* Active course row */}
                  {!isMember && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '2 / -1', alignItems: 'center' }}>
                      <div>
                        {student._variantTitle ? (
                          <span style={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 700, color: isHB ? '#555' : TC_DARK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px', display: 'block' }}>
                            {student._variantTitle}
                          </span>
                        ) : (
                          <span style={{ fontSize: '10px', color: MUTED }}>—</span>
                        )}
                        {student.courseIdentifier && (
                          <span style={{ fontFamily: 'monospace', fontSize: '9px', color: MUTED, display: 'block' }}>{student.courseIdentifier}</span>
                        )}
                        {/* Package rows lead with the package, so the cohort the block ran
                            in would otherwise be lost. Keep it on the grey line. */}
                        {student._cohortLine && (
                          <span style={{ fontSize: '9px', color: MUTED, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }}>
                            {student._cohortLine}
                          </span>
                        )}
                      </div>
                      <div>
                        {student._wtTotal != null && (
                          <AllocBar label="WT" used={student._wtUsed} total={student._wtTotal} color={TC} />
                        )}
                        {student._hbTotal != null && (
                          <AllocBar label="HB" used={student.classesAttended || 0} total={student._hbTotal} color={isHB && hbAllUsed ? '#2E7D32' : '#E65100'} />
                        )}
                        {/* Paused rows carry no WT/HB allocation, so show how far
                            through the course the pause happened instead. */}
                        {student._statusKey === 'paused' && student.numberOfWeeks != null && (
                          <AllocBar label="WT" used={student.weeksCompleted || 0} total={student.numberOfWeeks} color={MUTED} />
                        )}
                        {student._wtTotal == null && student._hbTotal == null
                          && !(student._statusKey === 'paused' && student.numberOfWeeks != null) && (
                          <span style={{ fontSize: '10px', color: MUTED }}>—</span>
                        )}

                        {/* HB inline credit edit */}
                        {isHB && editingCredits === student._enrollmentId && (
                          <div
                            onClick={e => e.stopPropagation()}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}
                          >
                            <input
                              type="number" min="0" value={editCreditsUsed}
                              onChange={e => setEditCreditsUsed(e.target.value)}
                              style={{ width: '36px', padding: '2px 4px', fontSize: '11px', border: `1px solid ${RULE}`, outline: 'none', fontFamily: 'inherit' }}
                              placeholder="Used"
                            />
                            <span style={{ fontSize: '10px', color: MUTED }}>/</span>
                            <input
                              type="number" min="0" value={editCreditsAllocated}
                              onChange={e => setEditCreditsAllocated(e.target.value)}
                              style={{ width: '36px', padding: '2px 4px', fontSize: '11px', border: `1px solid ${RULE}`, outline: 'none', fontFamily: 'inherit' }}
                              placeholder="Total"
                            />
                            <button onClick={e => { e.stopPropagation(); saveInlineCredits(student); }} style={{ padding: '2px 6px', backgroundColor: '#2E7D32', color: '#FFF', border: 'none', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>Save</button>
                            <button onClick={e => { e.stopPropagation(); cancelEditingCredits(); }} style={{ padding: '2px 6px', backgroundColor: MUTED, color: '#FFF', border: 'none', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>×</button>
                          </div>
                        )}
                      </div>
                      <div>
                        <StatusBadge
                          status={statusKey}
                          label={statusKey === 'unbooked' ? `${unbookedLeft} unbooked` : undefined}
                        />
                        {statusKey === 'paused' && (
                          <button
                            onClick={e => { e.stopPropagation(); handleResumeStudent(student); }}
                            disabled={resumingId === student.studentId}
                            style={{
                              display: 'block', marginTop: '4px', padding: '2px 6px',
                              backgroundColor: 'transparent', color: '#2E7D32', border: '1px solid #A5D6A7',
                              fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                              cursor: resumingId === student.id ? 'default' : 'pointer', opacity: resumingId === student.id ? 0.5 : 1,
                            }}
                          >
                            {resumingId === student.id ? '…' : 'Resume'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Upcoming course row */}
                  {!isMember && student._upcomingCourse && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '2 / -1', alignItems: 'center', marginTop: '8px' }}>
                      <div>
                        {student._upcomingCourse.variantTitle && (
                          <span style={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 700, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px', display: 'block' }}>
                            {student._upcomingCourse.variantTitle}
                          </span>
                        )}
                        <span style={{ fontFamily: 'monospace', fontSize: '9px', color: MUTED, display: 'block' }}>
                          {student._upcomingCourse.courseIdentifier}
                        </span>
                      </div>
                      <div>
                        <AllocBar label="WT" used={0} total={student._upcomingCourse.numberOfWeeks || 6} color={MUTED} />
                      </div>
                      <div><StatusBadge status="upcoming" /></div>
                    </div>
                  )}

                  {/* Member-only row */}
                  {isMember && !isDual && membership && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '2 / -1', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: MEMBER_COLOR }}>{getDisplayType(membership.membershipType)}</span>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: membership.membershipStatus === 'expired' ? MUTED : INK, marginTop: '2px' }}>{fmtDate(membership.endDate)}</div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: membership.membershipStatus === 'expiring' ? '#9E6200' : membership.membershipStatus === 'expired' ? MUTED : TC_DARK }}>
                          {membership.daysRemaining > 0 ? `${membership.daysRemaining} days left` : 'Expired'}
                        </div>
                      </div>
                      <div>
                        <AllocBar
                          label="Time"
                          used={Math.max(0, (membership.totalDays || 0) - (membership.daysRemaining || 0))}
                          total={membership.totalDays || 1}
                          color={membership.membershipStatus === 'expiring' ? '#E6A817' : membership.membershipStatus === 'expired' ? MUTED : MEMBER_COLOR}
                        />
                      </div>
                      <div><StatusBadge status={membership.membershipStatus || 'member'} /></div>
                    </div>
                  )}

                  {/* Dual membership row */}
                  {isDual && membership && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '2 / -1', alignItems: 'center', marginTop: '8px' }}>
                      <div>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: MEMBER_COLOR }}>{getDisplayType(membership.membershipType)}</span>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: membership.membershipStatus === 'expired' ? MUTED : INK, marginTop: '2px' }}>{fmtDate(membership.endDate)}</div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: membership.membershipStatus === 'expiring' ? '#9E6200' : membership.membershipStatus === 'expired' ? MUTED : TC_DARK }}>
                          {membership.daysRemaining > 0 ? `${membership.daysRemaining} days left` : 'Expired'}
                        </div>
                      </div>
                      <div>
                        <AllocBar
                          label="Mem"
                          used={Math.max(0, (membership.totalDays || 0) - (membership.daysRemaining || 0))}
                          total={membership.totalDays || 1}
                          color={membership.membershipStatus === 'expiring' ? '#E6A817' : MEMBER_COLOR}
                        />
                      </div>
                      <div><StatusBadge status={membership.membershipStatus || 'member'} /></div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Footer count + page size + load more ────────────────────── */}
        {!loading && visibleRows.length > 0 && (
          <div style={{ padding: isMobile ? '10px 0' : '14px 0', fontSize: '11px', color: MUTED, display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
            {/* Load more / pagination row */}
            {pagination.page < pagination.totalPages && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={{
                    padding: '6px 16px', fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
                    border: `1px solid ${TC}`, backgroundColor: '#FFF', color: TC,
                    cursor: loadingMore ? 'wait' : 'pointer', opacity: loadingMore ? 0.6 : 1,
                  }}
                >
                  {loadingMore ? 'Loading...' : `Load more (page ${pagination.page + 1}/${pagination.totalPages})`}
                </button>
                <button
                  onClick={loadAll}
                  disabled={loadingMore}
                  style={{
                    padding: '6px 12px', fontSize: '11px', fontWeight: 600, fontFamily: 'inherit',
                    border: `1px solid ${RULE}`, backgroundColor: '#FFF', color: MUTED,
                    cursor: loadingMore ? 'wait' : 'pointer', opacity: loadingMore ? 0.6 : 1,
                  }}
                >
                  Load all
                </button>
              </div>
            )}

            {/* Count + page size row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>
                {pageSize === 'all' ? visibleRows.length : Math.min(pageSize, visibleRows.length)} of {visibleRows.length} loaded
                {pagination.total > 0 && visibleRows.length < pagination.total ? ` (${pagination.total} total)` : ''}
              </span>
              <span style={{ color: RULE }}>|</span>
              <span>Show</span>
              <select
                value={pageSize}
                onChange={e => setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                style={{ padding: '2px 6px', fontSize: '11px', border: `1px solid ${RULE}`, backgroundColor: '#FFF', color: INK, fontFamily: 'inherit', cursor: 'pointer' }}
              >
                <option value={10}>10</option>
                <option value={50}>50</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>
        )}

    </AdminPage>
  );
}
