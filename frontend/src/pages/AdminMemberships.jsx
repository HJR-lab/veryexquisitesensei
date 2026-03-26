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

  // ── Derived data ───────────────────────────────────────────────────────────
  const counts = {
    all:       memberships.length,
    active:    memberships.filter(m => deriveStatus(m) === 'active').length,
    expiring:  memberships.filter(m => deriveStatus(m) === 'expiring').length,
    expired:   memberships.filter(m => deriveStatus(m) === 'expired').length,
    cancelled: memberships.filter(m => deriveStatus(m) === 'cancelled').length,
  };

  const filtered = memberships
    .filter(m => {
      if (tab === 'all')       return true;
      if (tab === 'expired')   return deriveStatus(m) === 'expired' || deriveStatus(m) === 'cancelled';
      return deriveStatus(m) === tab;
    })
    .filter(m =>
      (m.studentName  || '').toLowerCase().includes(search.toLowerCase()) ||
      (m.studentEmail || '').toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const order = { active: 0, expiring: 1, expired: 2, cancelled: 3 };
      const sa = order[deriveStatus(a)] ?? 4;
      const sb = order[deriveStatus(b)] ?? 4;
      if (sa !== sb) return sa - sb;
      return new Date(a.endDate) - new Date(b.endDate);
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
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '32px 24px 60px' }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: '24px', display: 'flex', alignItems: isMobile ? 'flex-start' : 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>Admin</div>
            <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>Memberships</h1>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{ padding: isMobile ? '9px 14px' : '10px 18px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            + Create Membership
          </button>
        </div>

        {/* ── Stats row (clickable tab selectors) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: '1px', backgroundColor: RULE, border: `1px solid ${RULE}`, marginBottom: '24px' }}>
          {[
            { key: 'all',       label: 'Total',     value: counts.all       },
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
          <div style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No memberships found</div>
        )}

        {!loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(m => {
              const status    = deriveStatus(m);
              const daysLeft  = getDaysLeft(m);
              const totalDays = getTotalDays(m);
              const pct       = totalDays > 0 ? Math.min(100, Math.max(0, Math.round(((totalDays - Math.max(daysLeft, 0)) / totalDays) * 100))) : 100;
              const tier      = getTier(m.type);
              const tierStyle = TIER_BADGE[tier] || TIER_BADGE.Bronze;
              const displayType = getDisplayType(m.type);
              const perks     = m.perks ? (typeof m.perks === 'object' ? Object.keys(m.perks) : m.perks) : [];

              return (
                <div
                  key={m.id}
                  onClick={() => m.studentEmail && navigate(`/admin/students/${encodeURIComponent(m.studentEmail)}`, { state: { from: 'memberships' } })}
                  style={{
                    border: `1px solid ${status === 'expiring' ? '#E6A817' : RULE}`,
                    backgroundColor: '#FFFFFF',
                    cursor: 'pointer',
                    transition: 'box-shadow 0.15s',
                    padding: '14px 16px',
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                >
                  {/* Row 1: name, tier, status, arrow */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: INK }}>{m.studentName || '—'}</span>
                    <span style={{
                      fontSize: '8px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      padding: '2px 6px', backgroundColor: tierStyle.bg, color: tierStyle.color,
                    }}>{tier}</span>
                    <span style={{ fontSize: '11px', color: MUTED, flex: 1 }}>{m.studentEmail || ''}</span>
                    <span style={{
                      fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      padding: '4px 8px', flexShrink: 0,
                      backgroundColor: STATUS_STYLE[status]?.bg || ALT,
                      color: STATUS_STYLE[status]?.text || MUTED,
                    }}>{status}</span>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: MUTED, flexShrink: 0 }}>chevron_right</span>
                  </div>

                  {/* Row 2: plan, dates, progress bar, perks */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '24px', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: '60px' }}>
                      <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Plan</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: INK }}>{displayType}</div>
                    </div>
                    <div style={{ minWidth: '80px' }}>
                      <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Start</div>
                      <div style={{ fontSize: '12px', color: INK }}>{fmtDate(m.startDate)}</div>
                    </div>
                    <div style={{ minWidth: '80px' }}>
                      <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Expires</div>
                      <div style={{ fontSize: '12px', fontWeight: status === 'expiring' ? 700 : 400, color: status === 'expiring' ? '#9E6200' : INK }}>{fmtDate(m.endDate)}</div>
                    </div>
                    <div style={{ width: '120px', flexShrink: 0 }}>
                      <div style={{ fontSize: '10px', color: MUTED, marginBottom: '4px' }}>
                        {daysLeft > 0 ? `${daysLeft} days left` : status === 'cancelled' ? 'Cancelled' : 'Expired'}
                      </div>
                      <div style={{ height: '3px', backgroundColor: 'rgba(40,40,40,0.08)', position: 'relative' }}>
                        <div style={{
                          position: 'absolute', left: 0, top: 0, height: '3px',
                          width: `${status === 'expired' || status === 'cancelled' ? 100 : pct}%`,
                          backgroundColor: status === 'expired' || status === 'cancelled' ? MUTED : status === 'expiring' ? '#E6A817' : TC,
                        }} />
                      </div>
                    </div>
                    {/* Perks inline */}
                    {perks.length > 0 && !isMobile && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', flex: 1, minWidth: 0 }}>
                        {perks.slice(0, 3).map((p, j) => (
                          <span key={j} style={{ fontSize: '10px', padding: '2px 7px', backgroundColor: ALT, color: MUTED, whiteSpace: 'nowrap' }}>{p}</span>
                        ))}
                        {perks.length > 3 && <span style={{ fontSize: '10px', color: MUTED }}>+{perks.length - 3}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

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
    </div>
  );
}
