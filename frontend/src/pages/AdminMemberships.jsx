import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import AdminPage from '../components/AdminPage';
// ─── Design tokens ────────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

// ─── Mobile hook ─────────────────────────────────────────────────────────────
function useIsMobile(bp = 768) {
  const [mobile, setMobile] = useState(() => window.innerWidth < bp);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < bp);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [bp]);
  return mobile;
}

// ─── Status / type helpers ────────────────────────────────────────────────────
const STATUS_STYLE = {
  pending:   { bg: '#EAF2FB', text: '#2A5C8A' },
  active:    { bg: TC_LIGHT,  text: TC_DARK  },
  expiring:  { bg: '#FFF7E6', text: '#9E6200' },
  expired:   { bg: ALT,       text: MUTED    },
  cancelled: { bg: ALT,       text: MUTED    },
};

const TIER_BADGE = {
  Bronze: { bg: '#CD7F32', color: '#FFF' },
  Silver: { bg: '#A0A0A0', color: '#FFF' },
  Gold:   { bg: '#D4A017', color: '#FFF' },
};

// Display name mapping for backward compatibility
function getDisplayType(rawType) {
  if (!rawType) return '—';
  // Map "Clay Club X Months" → "X Month" for display
  const match = rawType.match(/(\d+)\s*month/i);
  if (match) return `${match[1]} Month`;
  return rawType;
}

function getTier(rawType) {
  const match = (rawType || '').match(/(\d+)/);
  const months = match ? parseInt(match[1]) : 3;
  if (months >= 12) return 'Gold';
  if (months >= 6) return 'Silver';
  return 'Bronze';
}

function deriveStatus(membership) {
  if (membership.status === 'cancelled') return 'cancelled';
  // Reserved: purchased but not yet started (term begins on first studio visit).
  if (membership.status === 'pending' || !membership.endDate) return 'pending';
  const daysLeft = Math.ceil((new Date(membership.endDate) - new Date()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'expiring';
  return 'active';
}

function getDaysLeft(membership) {
  return Math.ceil((new Date(membership.endDate) - new Date()) / (1000 * 60 * 60 * 24));
}

function getTotalDays(membership) {
  return Math.ceil((new Date(membership.endDate) - new Date(membership.startDate)) / (1000 * 60 * 60 * 24));
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AdminMemberships() {
  const navigate   = useNavigate();
  const { logout } = useAuth();
  const isMobile   = useIsMobile();

  // ── State ──────────────────────────────────────────────────────────────────
  const [memberships,         setMemberships]         = useState([]);
  const [students,            setStudents]            = useState([]);
  const [loading,             setLoading]             = useState(false);
  const [tab,                 setTab]                 = useState('all');
  const [search,              setSearch]              = useState('');
  const [showCreateModal,     setShowCreateModal]     = useState(false);
  const [editing,             setEditing]             = useState(null); // membership object being edited
  const [showSettings,        setShowSettings]        = useState(false);
  const [settings,            setSettings]            = useState(null);
  const [savingSettings,      setSavingSettings]      = useState(false);

  const [createForm, setCreateForm] = useState({
    customerId:     '',
    membershipType: '3 Month',
    startDate:      new Date().toISOString().split('T')[0],
    endDate:        '',
    perks:          {},
  });

  const membershipPerks = {
    '3 Month': {
      'Unlimited studio access':    '3 months',
      'Free dedicated storage':     'Secure storage space',
      'Free shelving space':        'Shelving for your work',
      'All studio glazes included': 'Access to all glazes',
    },
    '6 Month': {
      'Unlimited studio access':       '6 months',
      'Free dedicated storage':        'Secure storage space',
      'Free shelving space':           'Shelving for your work',
      'All studio glazes included':    'Access to all glazes',
      'Studio-assisted clay reclaim':  'Clay recycling service',
      'FREE 1x Firing (worth $90)':   'Complimentary firing',
      '10% off clay, tools, firing & courses': 'Member discount',
    },
    '12 Month': {
      'Unlimited studio access':       '12 months',
      'Free dedicated storage':        'Secure storage space',
      'Free shelving space':           'Shelving for your work',
      'All studio glazes included':    'Access to all glazes',
      'Studio-assisted clay reclaim':  'Clay recycling service',
      'FREE 2x $130 Firing Basket (worth $260)': 'Complimentary firing',
      '10% off clay, tools, firing & courses': 'Member discount',
    },
  };

  // ── Data loading ───────────────────────────────────────────────────────────
  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [membershipsRes, studentsRes] = await Promise.all([
        api.get('/admin/memberships'),
        api.get('/admin/customers'),
      ]);
      setMemberships(membershipsRes.data.memberships || []);
      setStudents(studentsRes.data.customers);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  // ── Create handlers ────────────────────────────────────────────────────────
  const handleMembershipTypeChange = (type) => {
    const start  = new Date(createForm.startDate);
    const months = parseInt(type.split(' ')[0]);
    const end    = new Date(start);
    end.setMonth(end.getMonth() + months);
    setCreateForm({
      ...createForm,
      membershipType: type,
      endDate:        end.toISOString().split('T')[0],
      perks:          membershipPerks[type],
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editing) return;
    try {
      setLoading(true);
      await api.put(`/admin/memberships/${editing.id}`, {
        membershipType: editing.type,
        startDate:      editing.startDate,
        endDate:        editing.endDate,
        status:         editing.status,
      });
      setEditing(null);
      await loadData();
    } catch (error) {
      console.error('Failed to update membership:', error);
      alert('Failed to update membership');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (!confirm(`Delete membership for ${editing.studentName || editing.studentEmail}? This cannot be undone.`)) return;
    try {
      setLoading(true);
      await api.delete(`/admin/memberships/${editing.id}`);
      setEditing(null);
      await loadData();
    } catch (error) {
      console.error('Failed to delete membership:', error);
      alert('Failed to delete membership');
    } finally {
      setLoading(false);
    }
  };

  // Activate a reserved (pending) membership — starts the term on the member's
  // first studio visit. Prompts for the start date (defaults to today).
  const handleActivate = async (m, name) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const input = prompt(
      `Activate ${name || 'member'}'s membership — start the term on their first visit.\n\nStart date (YYYY-MM-DD):`,
      todayStr
    );
    if (input === null) return; // cancelled
    const startDate = input.trim() || todayStr;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      alert('Please enter a valid date as YYYY-MM-DD.');
      return;
    }
    try {
      setLoading(true);
      await api.post(`/admin/memberships/${m.id}/activate`, { startDate });
      await loadData();
    } catch (error) {
      console.error('Failed to activate membership:', error);
      alert('Failed to activate membership');
    } finally {
      setLoading(false);
    }
  };

  const openSettings = async () => {
    setShowSettings(true);
    if (settings) return;
    try {
      const res = await api.get('/admin/settings/membership');
      setSettings(res.data);
    } catch (err) {
      console.error('Failed to load membership settings:', err);
      alert('Failed to load settings');
      setShowSettings(false);
    }
  };

  const handleSettingsSubmit = async (e) => {
    e.preventDefault();
    if (!settings) return;
    try {
      setSavingSettings(true);
      await api.put('/admin/settings/membership', {
        accessCode:  settings.accessCode,
        studioHours: settings.studioHours,
      });
      setShowSettings(false);
    } catch (err) {
      console.error('Failed to save membership settings:', err);
      alert(err?.response?.data?.error || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await api.post('/admin/memberships', {
        customerId:     parseInt(createForm.customerId),
        membershipType: createForm.membershipType,
        startDate:      createForm.startDate,
        endDate:        createForm.endDate,
        perks:          createForm.perks,
        status:         'active',
      });
      setShowCreateModal(false);
      setCreateForm({
        customerId:     '',
        membershipType: '3 Month',
        startDate:      new Date().toISOString().split('T')[0],
        endDate:        '',
        perks:          {},
      });
      await loadData();
    } catch (error) {
      console.error('Failed to create membership:', error);
      alert('Failed to create membership');
    } finally {
      setLoading(false);
    }
  };

  // ── Derived data: group memberships by member ─────────────────────────────
  // Each member gets one card, with all their membership periods listed inside.
  const STATUS_ORDER = { pending: 0, expiring: 1, active: 2, expired: 3, cancelled: 4 };

  function memberStatus(periods) {
    const seen = periods.map(deriveStatus);
    if (seen.includes('pending'))  return 'pending';
    if (seen.includes('active'))   return 'active';
    if (seen.includes('expiring')) return 'expiring';
    if (seen.includes('expired'))  return 'expired';
    return 'cancelled';
  }

  const members = (() => {
    const groups = new Map();
    for (const m of memberships) {
      const key = m.studentEmail || `id-${m.id}`;
      if (!groups.has(key)) {
        groups.set(key, { email: m.studentEmail, name: m.studentName, periods: [] });
      }
      groups.get(key).periods.push(m);
    }
    for (const g of groups.values()) {
      // newest first by end date
      g.periods.sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
      g.status = memberStatus(g.periods);
    }
    return [...groups.values()];
  })();

  const counts = {
    all:       members.length,
    pending:   members.filter(g => g.status === 'pending').length,
    active:    members.filter(g => g.status === 'active').length,
    expiring:  members.filter(g => g.status === 'expiring').length,
    expired:   members.filter(g => g.status === 'expired').length,
    cancelled: members.filter(g => g.status === 'cancelled').length,
  };

  const filtered = members
    .filter(g => {
      if (tab === 'all')     return true;
      if (tab === 'expired') return g.status === 'expired' || g.status === 'cancelled';
      return g.status === tab;
    })
    .filter(g =>
      (g.name  || '').toLowerCase().includes(search.toLowerCase()) ||
      (g.email || '').toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const sa = STATUS_ORDER[a.status] ?? 4;
      const sb = STATUS_ORDER[b.status] ?? 4;
      if (sa !== sb) return sa - sb;
      // tie-break: latest period end date, newest first
      return new Date(b.periods[0].endDate) - new Date(a.periods[0].endDate);
    });

  // ── Stat button style ─────────────────────────────────────────────────────
  const statBtn = (key, label) => ({
    backgroundColor: tab === key ? '#FFFFFF' : 'transparent',
    border: tab === key ? `1px solid ${RULE}` : '1px solid transparent',
    borderBottom: tab === key ? `2px solid ${INK}` : '2px solid transparent',
    cursor: 'pointer', padding: '14px 20px', textAlign: 'left',
    transition: 'all 0.15s',
  });

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <AdminPage
        title="Memberships"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={openSettings}
              title="Membership settings"
              style={{ padding: isMobile ? '9px 12px' : '10px 14px', backgroundColor: '#FFF', color: INK, border: `1px solid ${RULE}`, fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>settings</span>
              {!isMobile && 'Settings'}
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{ padding: isMobile ? '9px 14px' : '10px 18px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              + Create Membership
            </button>
          </div>
        }
      >
        {/* ── Stats row (clickable tab selectors) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(6, 1fr)', gap: '1px', backgroundColor: RULE, border: `1px solid ${RULE}`, marginBottom: '24px' }}>
          {[
            { key: 'all',       label: 'Total',     value: counts.all       },
            { key: 'pending',   label: 'Reserved',   value: counts.pending   },
            { key: 'active',    label: 'Active',     value: counts.active    },
            { key: 'expiring',  label: 'Expiring',   value: counts.expiring  },
            { key: 'expired',   label: 'Expired',    value: counts.expired   },
            { key: 'cancelled', label: 'Cancelled',  value: counts.cancelled },
          ].map(s => (
            <button key={s.key} onClick={() => setTab(s.key)} style={{
              ...statBtn(s.key),
              backgroundColor: tab === s.key ? '#FFFFFF' : '#FAFAFA',
            }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: tab === s.key ? INK : MUTED }}>{s.value}</div>
              <div style={{ fontSize: '10px', color: tab === s.key ? TC : MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '3px', fontWeight: 700 }}>{s.label}</div>
            </button>
          ))}
        </div>

        {/* ── Search bar ── */}
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: MUTED, pointerEvents: 'none' }}>search</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search members..."
            style={{ width: '100%', padding: '11px 12px 11px 36px', border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', fontSize: '13px', color: INK, outline: 'none', boxSizing: 'border-box', fontFamily: 'Atak, sans-serif' }}
          />
        </div>

        {/* ── Cards ── */}
        {loading && (
          <div style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading memberships...</div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No members found</div>
        )}

        {!loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(group => {
              const current   = group.periods[0]; // newest by endDate
              const status    = group.status;
              const tier      = getTier(current.type);
              const tierStyle = TIER_BADGE[tier] || TIER_BADGE.Bronze;

              return (
                <div
                  key={group.email || `id-${current.id}`}
                  style={{
                    border: `1px solid ${status === 'expiring' ? '#E6A817' : RULE}`,
                    backgroundColor: '#FFFFFF',
                    transition: 'box-shadow 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                >
                  {/* Member header */}
                  <div
                    onClick={() => group.email && navigate(`/admin/students/${encodeURIComponent(group.email)}`, { state: { from: 'memberships' } })}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', cursor: group.email ? 'pointer' : 'default', borderBottom: `1px solid ${RULE}` }}
                  >
                    <span style={{ fontSize: '14px', fontWeight: 700, color: INK }}>{group.name || '—'}</span>
                    <span style={{
                      fontSize: '8px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      padding: '2px 6px', backgroundColor: tierStyle.bg, color: tierStyle.color,
                    }}>{tier}</span>
                    <span style={{ fontSize: '11px', color: MUTED, flex: 1 }}>{group.email || ''}</span>
                    <span style={{ fontSize: '10px', color: MUTED, flexShrink: 0 }}>
                      {group.periods.length} period{group.periods.length === 1 ? '' : 's'}
                    </span>
                    <span style={{
                      fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      padding: '4px 8px', flexShrink: 0,
                      backgroundColor: STATUS_STYLE[status]?.bg || ALT,
                      color: STATUS_STYLE[status]?.text || MUTED,
                    }}>{status}</span>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: MUTED, flexShrink: 0 }}>chevron_right</span>
                  </div>

                  {/* Period rows */}
                  <div>
                    {group.periods.map((m, idx) => {
                      const pStatus    = deriveStatus(m);
                      const daysLeft   = getDaysLeft(m);
                      const totalDays  = getTotalDays(m);
                      const pct        = totalDays > 0 ? Math.min(100, Math.max(0, Math.round(((totalDays - Math.max(daysLeft, 0)) / totalDays) * 100))) : 100;
                      const displayType = getDisplayType(m.type);
                      return (
                        <div
                          key={m.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: isMobile ? '10px' : '20px', flexWrap: 'wrap',
                            padding: '10px 16px',
                            borderBottom: idx === group.periods.length - 1 ? 'none' : `1px solid ${RULE}`,
                            backgroundColor: idx === 0 ? '#FFF' : '#FCFBFA',
                          }}
                        >
                          <span style={{
                            fontSize: '8px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                            padding: '3px 7px', flexShrink: 0,
                            backgroundColor: STATUS_STYLE[pStatus]?.bg || ALT,
                            color: STATUS_STYLE[pStatus]?.text || MUTED,
                          }}>{pStatus}</span>
                          <div style={{ minWidth: '60px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: INK }}>{displayType}</div>
                          </div>
                          {pStatus === 'pending' ? (
                            <div style={{ minWidth: '160px', fontSize: '12px', color: INK }}>
                              Starts on first visit
                              <span style={{ color: MUTED }}> · purchased {fmtDate(m.purchaseDate || m.startDate)}</span>
                            </div>
                          ) : (
                            <>
                              <div style={{ minWidth: '160px', fontSize: '12px', color: INK }}>
                                {fmtDate(m.startDate)} <span style={{ color: MUTED }}>→</span> <span style={{ fontWeight: pStatus === 'expiring' ? 700 : 400, color: pStatus === 'expiring' ? '#9E6200' : INK }}>{fmtDate(m.endDate)}</span>
                              </div>
                              <div style={{ width: '120px', flexShrink: 0 }}>
                                <div style={{ fontSize: '10px', color: MUTED, marginBottom: '3px' }}>
                                  {daysLeft > 0 ? `${daysLeft} days left` : pStatus === 'cancelled' ? 'Cancelled' : 'Expired'}
                                </div>
                                <div style={{ height: '3px', backgroundColor: 'rgba(40,40,40,0.08)', position: 'relative' }}>
                                  <div style={{
                                    position: 'absolute', left: 0, top: 0, height: '3px',
                                    width: `${pStatus === 'expired' || pStatus === 'cancelled' ? 100 : pct}%`,
                                    backgroundColor: pStatus === 'expired' || pStatus === 'cancelled' ? MUTED : pStatus === 'expiring' ? '#E6A817' : TC,
                                  }} />
                                </div>
                              </div>
                            </>
                          )}
                          <div style={{ flex: 1 }} />
                          {pStatus === 'pending' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleActivate(m, group.name); }}
                              title="Activate — start the term on the member's first visit"
                              style={{ border: 'none', background: TC, color: '#FFF', cursor: 'pointer', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: 'Atak, sans-serif' }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>play_arrow</span>
                              Activate
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditing({ ...m, studentName: group.name, studentEmail: group.email }); }}
                            title="Edit period"
                            style={{ border: `1px solid ${RULE}`, background: '#FFF', cursor: 'pointer', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, fontSize: '11px', color: INK, fontFamily: 'Atak, sans-serif' }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>edit</span>
                            Edit
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminPage>

      {/* ── Create Membership Modal ────────────────────────────────────────────── */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#FFFFFF', padding: '32px', width: '480px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>Create Membership</div>
              <button onClick={() => setShowCreateModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: MUTED }}>
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Student *</label>
                <select value={createForm.customerId} onChange={e => setCreateForm({ ...createForm, customerId: e.target.value })} required style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box', outline: 'none' }}>
                  <option value="">Select a student...</option>
                  {students.map(student => (
                    <option key={student.dbId} value={student.dbId}>
                      {student.firstName} {student.lastName} ({student.email})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Membership Plan *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {['3 Month', '6 Month', '12 Month'].map(type => (
                    <button key={type} type="button" onClick={() => handleMembershipTypeChange(type)} style={{
                      padding: '12px 8px',
                      border: `2px solid ${createForm.membershipType === type ? TC : RULE}`,
                      backgroundColor: createForm.membershipType === type ? TC_LIGHT : '#FFFFFF',
                      cursor: 'pointer', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: createForm.membershipType === type ? TC_DARK : INK }}>{type}</div>
                      <div style={{ fontSize: '10px', color: MUTED, marginTop: '2px' }}>
                        {type === '3 Month' ? '$150' : type === '6 Month' ? '$280' : '$500'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Start Date *</label>
                <input type="date" value={createForm.startDate} onChange={e => { setCreateForm({ ...createForm, startDate: e.target.value }); handleMembershipTypeChange(createForm.membershipType); }} required style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>End Date (auto-calculated)</label>
                <input type="date" value={createForm.endDate} readOnly style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box', backgroundColor: ALT, color: MUTED, cursor: 'not-allowed' }} />
              </div>
              {Object.keys(createForm.perks).length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '8px' }}>Included Perks</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {Object.keys(createForm.perks).map(perk => (
                      <span key={perk} style={{ fontSize: '11px', padding: '4px 10px', backgroundColor: TC_LIGHT, border: '1px solid rgba(196,98,45,0.2)', color: TC_DARK }}>
                        {perk}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowCreateModal(false)} style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={loading} style={{ flex: 1, padding: '12px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
                  {loading ? 'Creating...' : 'Create Membership'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Membership Modal ──────────────────────────────────────────────── */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#FFFFFF', padding: '32px', width: '480px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>Edit Membership</div>
              <button onClick={() => setEditing(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: MUTED }}>✕</button>
            </div>
            <div style={{ fontSize: '12px', color: MUTED, marginBottom: '20px' }}>
              {editing.studentName} <span style={{ color: RULE }}>·</span> {editing.studentEmail}
            </div>

            <form onSubmit={handleEditSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Plan</label>
                <select
                  value={editing.type || ''}
                  onChange={e => setEditing({ ...editing, type: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box', outline: 'none' }}
                >
                  {['3 Month', '6 Month', '12 Month'].map(t => <option key={t} value={t}>{t}</option>)}
                  {editing.type && !['3 Month', '6 Month', '12 Month'].includes(editing.type) && (
                    <option value={editing.type}>{editing.type}</option>
                  )}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Start Date</label>
                  <input
                    type="date"
                    value={(editing.startDate || '').slice(0, 10)}
                    onChange={e => setEditing({ ...editing, startDate: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>End Date</label>
                  <input
                    type="date"
                    value={(editing.endDate || '').slice(0, 10)}
                    onChange={e => setEditing({ ...editing, endDate: e.target.value })}
                    required
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Status</label>
                <select
                  value={editing.status || 'active'}
                  onChange={e => setEditing({ ...editing, status: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box', outline: 'none' }}
                >
                  <option value="pending">pending (reserved)</option>
                  <option value="active">active</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>

              {/* Quick-extend shortcuts */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '6px' }}>Quick extend</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[
                    { label: '+7 days',  days: 7 },
                    { label: '+30 days', days: 30 },
                    { label: '+3 months', days: 90 },
                    { label: '+6 months', days: 180 },
                    { label: '+1 year',  days: 365 },
                  ].map(opt => (
                    <button
                      key={opt.days}
                      type="button"
                      onClick={() => {
                        const base = editing.endDate ? new Date(editing.endDate) : new Date();
                        base.setDate(base.getDate() + opt.days);
                        setEditing({ ...editing, endDate: base.toISOString().slice(0, 10) });
                      }}
                      style={{ padding: '6px 10px', border: `1px solid ${RULE}`, backgroundColor: '#FFF', fontSize: '11px', cursor: 'pointer', fontFamily: 'Atak, sans-serif' }}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={handleDelete} disabled={loading} style={{ padding: '12px 14px', border: `1px solid ${RULE}`, backgroundColor: '#FFF', color: '#C0392B', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  Delete
                </button>
                <div style={{ flex: 1 }} />
                <button type="button" onClick={() => setEditing(null)} style={{ padding: '12px 18px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={loading} style={{ padding: '12px 18px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
                  {loading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Membership Settings Modal ──────────────────────────────────────────── */}
      {showSettings && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#FFFFFF', padding: '32px', width: '520px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>Membership Settings</div>
              <button onClick={() => setShowSettings(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: MUTED }}>✕</button>
            </div>
            <div style={{ fontSize: '12px', color: MUTED, marginBottom: '20px' }}>
              Values shown in the membership confirmation email sent on every Clay Club purchase.
            </div>

            {!settings ? (
              <div style={{ padding: '24px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading…</div>
            ) : (
              <form onSubmit={handleSettingsSubmit}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Studio Entry Code</label>
                  <input
                    type="text"
                    value={settings.accessCode}
                    onChange={e => setSettings({ ...settings, accessCode: e.target.value })}
                    required
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '14px', fontFamily: 'SFMono-Regular, Menlo, Consolas, monospace', letterSpacing: '0.06em', boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '8px' }}>Studio Access Hours</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {settings.studioHours.map((entry, idx) => (
                      <div key={entry.day} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '8px', alignItems: 'center' }}>
                        <div style={{ fontSize: '13px', color: INK }}>{entry.day}</div>
                        <input
                          type="text"
                          value={entry.hours}
                          onChange={e => {
                            const next = settings.studioHours.slice();
                            next[idx] = { ...next[idx], hours: e.target.value };
                            setSettings({ ...settings, studioHours: next });
                          }}
                          placeholder="e.g. 11:00 am – 6:00 pm or Closed"
                          style={{ width: '100%', padding: '8px 10px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box', outline: 'none' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1 }} />
                  <button type="button" onClick={() => setShowSettings(false)} style={{ padding: '12px 18px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={savingSettings} style={{ padding: '12px 18px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', opacity: savingSettings ? 0.5 : 1 }}>
                    {savingSettings ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
