import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';

// ─── Design tokens ────────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

// ─── Admin nav links ──────────────────────────────────────────────────────────
const NAV = [
  { id: 'classes',     label: 'Classes',   href: '/admin/classes' },
  { id: 'students',    label: 'Students',  href: '/admin/students' },
  { id: 'memberships', label: 'Members',   href: '/admin/memberships' },
];

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
            <a
              key={link.id}
              href={link.href}
              style={{
                padding: '0 14px',
                height: '52px',
                display: 'flex',
                alignItems: 'center',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: active === link.id ? TC : MUTED,
                textDecoration: 'none',
                borderBottom: `2px solid ${active === link.id ? TC : 'transparent'}`,
              }}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 10px', backgroundColor: INK, color: '#FFF', flexShrink: 0 }}>
          Admin
        </span>
      </div>
    </header>
  );
}

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
function StatusBadge({ status }) {
  const map = {
    active:    { label: 'Active',    bg: '#E8F5E9', color: '#2E7D32' },
    upcoming:  { label: 'Upcoming',  bg: TC_LIGHT,  color: TC_DARK },
    paused:    { label: 'Paused',    bg: '#FFF8E1', color: '#F57F17' },
    completed: { label: 'Done',      bg: ALT,       color: MUTED },
    hb:        { label: 'HB',        bg: '#FFF3E0', color: '#E65100' },
  };
  const cfg = map[status] || map.active;
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
      {cfg.label}
    </span>
  );
}

export default function AdminStudents() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [loading,  setLoading]  = useState(false);
  const [syncing,  setSyncing]  = useState(false);

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

  // WT sorting / filter
  const [sortBy,         setSortBy]         = useState('earliest');
  const [selectedCohort, setSelectedCohort] = useState('all');

  // HB sorting / filter
  const [hbSortBy,       setHbSortBy]       = useState('name');
  const [hideCompleted,  setHideCompleted]  = useState(false);

  // HB inline editing
  const [editingCredits,      setEditingCredits]      = useState(null);
  const [editCreditsUsed,     setEditCreditsUsed]     = useState('');
  const [editCreditsAllocated,setEditCreditsAllocated]= useState('');

  // HB bulk selection
  const [resyncingHB,   setResyncingHB]   = useState(false);
  const [markingDone,   setMarkingDone]   = useState(null);  // kept for compat
  const [selectedHB,    setSelectedHB]    = useState(new Set());
  const [bulkProcessing,setBulkProcessing]= useState(false);

  // UI: active tab, search, sort within unified view
  const [tab,    setTab]    = useState('all');   // 'all' | 'wt-now' | 'wt-next' | 'hb' | 'paused'
  const [search, setSearch] = useState('');
  const [uiSort, setUiSort] = useState('cohort'); // 'cohort'|'earliest'|'latest'|'name'|'orders'

  useEffect(() => { loadStats(); }, []);

  // ─── Data loading ─────────────────────────────────────────────────────────
  const loadStats = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/students/stats');
      setStats(data.stats);
      setCourseStats(data.courseStats);
      setTopPerformers(data.topPerformers);
      setActiveStudentsList(data.activeStudentsList || []);
      setPausedStudentsList(data.pausedStudentsList || []);
      setReturningStudentsList(data.returningStudentsList || []);
      setUpcomingEnrollmentsList(data.upcomingEnrollmentsList || []);
      setHbStudentsList(data.hbStudentsList || []);
    } catch (error) {
      console.error('[AdminStudents] Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncFromShopify = async () => {
    try {
      setSyncing(true);
      const customersResponse = await api.post('/admin/sync-shopify-customers');
      const ordersResponse    = await api.post('/admin/sync-shopify-orders');
      const hbResponse        = await api.post('/admin/backfill-hb-credits');
      await loadStats();
      alert(
        `Successfully synced from Shopify!\n\n` +
        `Customers: ${customersResponse.data.count || 0}\n` +
        `Enrollments created: ${ordersResponse.data.enrollmentsCreated || 0}\n` +
        `Orders processed: ${ordersResponse.data.processedCount || 0}\n` +
        `HB credits fixed: ${hbResponse.data.fixed || 0}`
      );
    } catch (error) {
      alert(`Failed to sync from Shopify: ${error.response?.data?.error || error.message}`);
    } finally {
      setSyncing(false);
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

  const markSelectedDone = async () => {
    const selected = hbStudentsList.filter(s => selectedHB.has(s.enrollmentId) && s.creditsRemaining > 0);
    if (selected.length === 0) { alert('No selected students with remaining credits'); return; }
    if (!confirm(`Mark ${selected.length} student(s) as fully completed?\n\n${selected.map(s => `${s.name}`).join('\n')}`)) return;
    try {
      setBulkProcessing(true);
      for (const s of selected) {
        await api.post(`/admin/hb-enrollments/${s.enrollmentId}/set-credits`, { allocated: s.creditsAllocated, used: s.creditsAllocated });
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
      for (const s of selected) {
        await api.post(`/admin/hb-enrollments/${s.enrollmentId}/set-credits`, { allocated, used });
      }
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
      for (const s of selected) {
        await api.post(`/admin/hb-enrollments/${s.enrollmentId}/set-status`, { status: 'cancelled' });
      }
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
    if (hideCompleted) filtered = filtered.filter(s => s.creditsRemaining > 0 || s.creditsAllocated === 0);
    switch (hbSortBy) {
      case 'name':     return filtered.sort((a, b) => a.name.localeCompare(b.name));
      case 'credits':  return filtered.sort((a, b) => { const d = (b.creditsRemaining||0)-(a.creditsRemaining||0); return d !== 0 ? d : (b.creditsAllocated||0)-(a.creditsAllocated||0); });
      case 'enrolled': return filtered.sort((a, b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));
      case 'variant':  return filtered.sort((a, b) => (a.variantTitle||a.courseTitle||'HB').localeCompare(b.variantTitle||b.courseTitle||'HB'));
      default:         return filtered;
    }
  };

  // ─── Unified student table helpers ────────────────────────────────────────
  // Merge all lists into a flat structure for the single unified table
  const buildUnifiedList = () => {
    const wtActive = getSortedActiveStudents().map(s => ({
      ...s,
      _type: s.enrollmentStatus === 'upcoming' ? 'wt-next' : 'wt-now',
      _wtUsed: s.classesAttended || 0,
      _wtTotal: s.classesAllocated || 6,
      _hbUsed: null, _hbTotal: null,
      _purchaseCount: s.coursePurchaseCount || 1,
      _enrollmentId: s.enrollmentId,
      _variantTitle: s.variantTitle || s.courseIdentifier || '',
      _lastClassDate: null,
    }));

    const hbAll = getSortedHbStudents().map(s => ({
      ...s,
      _type: 'hb',
      _wtUsed: null, _wtTotal: null,
      _hbUsed: s.creditsUsed || 0,
      _hbTotal: s.creditsAllocated || 0,
      _purchaseCount: s.purchaseCount || 1,
      _enrollmentId: s.enrollmentId,
      _variantTitle: s.variantTitle || s.courseTitle || 'HB',
      _lastClassDate: null,
    }));

    const paused = pausedStudentsList.map(s => ({
      ...s,
      _type: 'paused',
      _wtUsed: null, _wtTotal: null,
      _hbUsed: null, _hbTotal: null,
      _purchaseCount: s.coursePurchaseCount || 1,
      _enrollmentId: s.enrollmentId,
      _variantTitle: s.variantTitle || s.courseIdentifier || '',
      _lastClassDate: null,
    }));

    return [...wtActive, ...hbAll, ...paused];
  };

  const tabFilter = (student) => {
    if (tab === 'all')     return true;
    if (tab === 'wt-now')  return student._type === 'wt-now';
    if (tab === 'wt-next') return student._type === 'wt-next';
    if (tab === 'hb')      return student._type === 'hb';
    if (tab === 'paused')  return student._type === 'paused';
    return true;
  };

  const applySort = (list) => {
    switch (uiSort) {
      case 'name':     return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      case 'earliest': return [...list].sort((a, b) => (parseCourseStartDate(a.courseIdentifier) || new Date(9e14)) - (parseCourseStartDate(b.courseIdentifier) || new Date(9e14)));
      case 'latest':   return [...list].sort((a, b) => (parseCourseStartDate(b.courseIdentifier) || new Date(0)) - (parseCourseStartDate(a.courseIdentifier) || new Date(0)));
      case 'orders':   return [...list].sort((a, b) => (b._purchaseCount || 0) - (a._purchaseCount || 0));
      case 'cohort':
      default: {
        return [...list].sort((a, b) => {
          const ca = a.courseIdentifier || 'zzz';
          const cb = b.courseIdentifier || 'zzz';
          return ca !== cb ? ca.localeCompare(cb) : (a.name || '').localeCompare(b.name || '');
        });
      }
    }
  };

  const allStudents  = buildUnifiedList();
  const tabCounts = {
    all:      allStudents.length,
    'wt-now': allStudents.filter(s => s._type === 'wt-now').length,
    'wt-next':allStudents.filter(s => s._type === 'wt-next').length,
    hb:       allStudents.filter(s => s._type === 'hb').length,
    paused:   allStudents.filter(s => s._type === 'paused').length,
  };

  const searchLower  = search.toLowerCase();
  const visibleRows  = applySort(
    allStudents
      .filter(tabFilter)
      .filter(s =>
        (s.name  || '').toLowerCase().includes(searchLower) ||
        (s.email || '').toLowerCase().includes(searchLower)
      )
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <AdminNav active="students" />

      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '32px 24px 60px' }}>

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>Admin</div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>Students</h1>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={syncFromShopify}
              disabled={syncing}
              style={{ padding: '10px 16px', backgroundColor: 'transparent', border: `1px solid ${RULE}`, color: INK, fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: syncing ? 'not-allowed' : 'pointer', opacity: syncing ? 0.5 : 1 }}
            >
              {syncing ? 'Syncing…' : 'Sync Shopify'}
            </button>
          </div>
        </div>

        {/* ── Stats strip ──────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1px', backgroundColor: RULE, border: `1px solid ${RULE}`, marginBottom: '24px' }}>
          {[
            { label: 'Total',       value: tabCounts.all },
            { label: 'WT Current',  value: tabCounts['wt-now'] },
            { label: 'WT Upcoming', value: tabCounts['wt-next'] },
            { label: 'HB Ongoing',  value: tabCounts.hb },
            { label: 'Paused',      value: tabCounts.paused },
          ].map((s, i) => (
            <div key={i} style={{ backgroundColor: '#FFFFFF', padding: '16px 20px' }}>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{loading ? '—' : s.value}</div>
              <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '3px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Search + filter tabs + sort ───────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${RULE}`, gap: 0, flexWrap: 'wrap' }}>

          {/* Search */}
          <div style={{ position: 'relative', width: '220px', flexShrink: 0, borderRight: `1px solid ${RULE}` }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search students…"
              style={{ width: '100%', height: '100%', padding: '10px 12px', border: 'none', backgroundColor: '#FFFFFF', fontSize: '13px', color: INK, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', flex: 1, overflowX: 'auto' }}>
            {[
              { key: 'all',      label: 'All' },
              { key: 'wt-now',   label: 'WT Current' },
              { key: 'wt-next',  label: 'WT Upcoming' },
              { key: 'hb',       label: 'HB' },
              { key: 'paused',   label: 'Paused' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap',
                  color: tab === t.key ? INK : MUTED,
                  borderBottom: `2px solid ${tab === t.key ? INK : 'transparent'}`,
                  marginBottom: '-1px',
                }}
              >
                {t.label}{' '}
                <span style={{ color: tab === t.key ? TC : MUTED, marginLeft: '3px' }}>{tabCounts[t.key]}</span>
              </button>
            ))}
          </div>

          {/* Sort */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0 12px', borderLeft: `1px solid ${RULE}`, flexShrink: 0 }}>
            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginRight: '4px' }}>Sort</span>
            {[
              { key: 'cohort',   label: 'Cohort' },
              { key: 'earliest', label: 'Earliest' },
              { key: 'latest',   label: 'Latest' },
              { key: 'name',     label: 'Name' },
              { key: 'orders',   label: 'Orders' },
            ].map(s => (
              <button
                key={s.key}
                onClick={() => setUiSort(s.key)}
                style={{
                  padding: '5px 10px',
                  border: `1px solid ${uiSort === s.key ? INK : RULE}`,
                  backgroundColor: uiSort === s.key ? INK : 'transparent',
                  color: uiSort === s.key ? '#FFF' : MUTED,
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── HB bulk action bar (shown only when in HB tab with selections) */}
        {tab === 'hb' && selectedHB.size > 0 && (
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

        {/* HB hide-completed + sort controls */}
        {tab === 'hb' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 16px', backgroundColor: '#FFFDF9', border: `1px solid ${RULE}`, borderTop: 'none' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: MUTED, cursor: 'pointer' }}>
              <input type="checkbox" checked={hideCompleted} onChange={e => setHideCompleted(e.target.checked)} />
              Hide Completed
            </label>
            <span style={{ fontSize: '9px', color: RULE }}>|</span>
            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>HB Sort</span>
            {[
              { key: 'name',     label: 'Name' },
              { key: 'credits',  label: 'Credits' },
              { key: 'enrolled', label: 'Recent' },
              { key: 'variant',  label: 'Type' },
            ].map(s => (
              <button
                key={s.key}
                onClick={() => setHbSortBy(s.key)}
                style={{
                  padding: '4px 8px',
                  border: `1px solid ${hbSortBy === s.key ? INK : RULE}`,
                  backgroundColor: hbSortBy === s.key ? INK : 'transparent',
                  color: hbSortBy === s.key ? '#FFF' : MUTED,
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Student table ─────────────────────────────────────────────── */}
        <div style={{ border: `1px solid ${RULE}`, borderTop: 'none', backgroundColor: '#FFFFFF', overflowX: 'auto' }}>

          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: tab === 'hb' ? '32px 1fr 140px 80px 100px 80px' : '1fr 140px 80px 100px 100px', minWidth: '600px', padding: '10px 16px', backgroundColor: ALT, borderBottom: `1px solid ${RULE}` }}>
            {tab === 'hb' && (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={selectedHB.size === getSortedHbStudents().length && getSortedHbStudents().length > 0}
                  onChange={toggleSelectAllHB}
                />
              </div>
            )}
            {['Student', 'Course / Variant', 'Allocations', 'Status', tab === 'hb' ? 'Actions' : 'Orders'].map((h, i) => (
              <span key={i} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{h}</span>
            ))}
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading…</div>
          )}

          {/* Empty */}
          {!loading && visibleRows.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No students found</div>
          )}

          {/* Rows */}
          {!loading && visibleRows.map((student, i) => {
            const isHB      = student._type === 'hb';
            const isSelected= isHB && selectedHB.has(student._enrollmentId);
            const hbAllUsed = isHB && student._hbTotal > 0 && student._hbUsed >= student._hbTotal;
            const statusKey = student._type === 'wt-now' ? 'active' : student._type === 'wt-next' ? 'upcoming' : student._type === 'hb' ? 'hb' : 'paused';

            const gridCols = isHB
              ? '32px 1fr 140px 80px 100px 80px'
              : '1fr 140px 80px 100px 100px';

            return (
              <div
                key={`${student._enrollmentId || student.email}-${i}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: gridCols,
                  minWidth: '600px',
                  padding: '12px 16px',
                  borderBottom: i < visibleRows.length - 1 ? `1px solid ${RULE}` : 'none',
                  backgroundColor: isSelected ? TC_LIGHT : hbAllUsed ? '#FAFAFA' : '#FFFFFF',
                  alignItems: 'center',
                  transition: 'background-color 0.1s',
                  cursor: 'pointer',
                  opacity: hbAllUsed ? 0.65 : 1,
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = TC_LIGHT; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = isSelected ? TC_LIGHT : hbAllUsed ? '#FAFAFA' : '#FFFFFF'; }}
                onClick={() => viewStudentDetail(student)}
              >
                {/* HB checkbox */}
                {isHB && (
                  <div onClick={e => toggleHBSelect(student._enrollmentId, e)} style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={e => toggleHBSelect(student._enrollmentId, e)}
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                )}

                {/* Name + email */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>{student.name}</span>
                    {hbAllUsed && (
                      <span style={{ fontSize: '9px', fontWeight: 700, color: '#2E7D32' }}>&#10003; Done</span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: MUTED }}>{student.email}</div>
                </div>

                {/* Course / variant */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {student._variantTitle ? (
                    <span style={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 700, color: isHB ? '#555' : TC_DARK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {student._variantTitle}
                    </span>
                  ) : (
                    <span style={{ fontSize: '10px', color: MUTED }}>—</span>
                  )}
                  {student.courseIdentifier && student.courseIdentifier !== student._variantTitle && (
                    <span style={{ fontFamily: 'monospace', fontSize: '9px', color: MUTED }}>{student.courseIdentifier}</span>
                  )}
                </div>

                {/* Allocations (progress bars) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {student._wtTotal != null && (
                    <AllocBar label="WT" used={student._wtUsed} total={student._wtTotal} color={TC} />
                  )}
                  {student._hbTotal != null && (
                    <AllocBar label="HB" used={student._hbUsed} total={student._hbTotal} color={isHB && hbAllUsed ? '#2E7D32' : '#E65100'} />
                  )}
                  {student._wtTotal == null && student._hbTotal == null && (
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

                {/* Status badge */}
                <div>
                  <StatusBadge status={statusKey} />
                </div>

                {/* Actions / purchase count */}
                {isHB ? (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
                  >
                    {editingCredits === student._enrollmentId ? null : (
                      <button
                        onClick={e => { e.stopPropagation(); startEditingCredits(student); }}
                        style={{ padding: '4px 8px', backgroundColor: TC_LIGHT, border: `1px solid ${RULE}`, color: TC_DARK, fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); viewStudentDetail(student); }}
                      style={{ padding: '4px 8px', backgroundColor: INK, border: 'none', color: '#FFF', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      View
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>{student._purchaseCount}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Footer count ─────────────────────────────────────────────── */}
        {!loading && visibleRows.length > 0 && (
          <div style={{ padding: '14px 0', fontSize: '11px', color: MUTED, textAlign: 'right' }}>
            {visibleRows.length} student{visibleRows.length !== 1 ? 's' : ''}
          </div>
        )}

      </main>
    </div>
  );
}
