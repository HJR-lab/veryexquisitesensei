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

// ─── Nav ──────────────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { id: 'dashboard',   label: 'Dashboard', href: '/admin' },
  { id: 'classes',     label: 'Classes',   href: '/admin/classes' },
  { id: 'students',    label: 'Students',  href: '/admin/students' },
  { id: 'memberships', label: 'Members',   href: '/admin/memberships' },
];

function AdminNav({ active }) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: '#FFFFFF', borderBottom: `1px solid ${RULE}` }}>
      <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '24px' }}>
        <img
          src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
          alt="VES"
          style={{ height: '22px', width: 'auto', flexShrink: 0 }}
        />
        <div style={{ width: '1px', height: '18px', backgroundColor: RULE, flexShrink: 0 }} />
        <nav style={{ display: 'flex', flex: 1 }}>
          {NAV_LINKS.map(link => (
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

// ─── Status / type helpers ────────────────────────────────────────────────────
const STATUS_STYLE = {
  active:    { bg: TC_LIGHT,  text: TC_DARK  },
  expiring:  { bg: '#FFF7E6', text: '#9E6200' },
  expired:   { bg: ALT,       text: MUTED    },
  cancelled: { bg: ALT,       text: MUTED    },
};

const TYPE_BADGE = {
  '3 Month':  { bg: ALT,      text: INK     },
  '6 Month':  { bg: TC_LIGHT, text: TC_DARK },
  '12 Month': { bg: INK,      text: '#FFF'  },
};

// Derive a display status from raw API data
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

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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
  const [expanded,            setExpanded]            = useState(null);
  const [showCreateModal,     setShowCreateModal]     = useState(false);
  const [showEditModal,       setShowEditModal]       = useState(false);
  const [selectedMembership,  setSelectedMembership]  = useState(null);

  const [createForm, setCreateForm] = useState({
    customerId:     '',
    membershipType: '3 Month',
    startDate:      new Date().toISOString().split('T')[0],
    endDate:        '',
    perks:          {},
  });

  const membershipPerks = {
    '3 Month': {
      'Studio Access':    '3 months unlimited access',
      'Dedicated Storage':'Secure storage space',
      'Studio Glazes':    'Access to all glazes',
      '5% Discount':      'On clay and tools',
    },
    '6 Month': {
      'Studio Access':            '6 months unlimited access',
      'Dedicated Storage':        'Secure storage space',
      'Studio Glazes':            'Access to all glazes',
      'FREE $65 Firing Basket':   'Complimentary firing credits',
      '10% Discount':             'On clay, tools, and firings',
    },
    '12 Month': {
      'Unlimited Studio Access':      '12 months 7 days a week',
      'Free Dedicated Storage':       'Secure storage for your work',
      'Studio-Assisted Clay Reclaim': 'Clay recycling service',
      'FREE $130 Firing Basket':      'Complimentary firing credits',
      'All Studio Glazes Included':   'Access to professional glazes',
      '10% Discount':                 'On clay, tools, and additional firings',
    },
  };

  // ── Data loading ───────────────────────────────────────────────────────────
  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const membershipsRes = await api.get('/admin/memberships');
      setMemberships(membershipsRes.data.memberships || []);
      const studentsRes = await api.get('/admin/customers');
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

  // ── Edit handlers ──────────────────────────────────────────────────────────
  const openEdit = (membership, e) => {
    e.stopPropagation();
    setSelectedMembership({ ...membership });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await api.put(`/admin/memberships/${selectedMembership.id}`, {
        startDate: selectedMembership.startDate,
        endDate:   selectedMembership.endDate,
        status:    selectedMembership.status,
      });
      setShowEditModal(false);
      setSelectedMembership(null);
      await loadData();
      alert('Membership updated successfully!');
    } catch (error) {
      console.error('Failed to update membership:', error);
      alert('Failed to update membership');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedMembership.studentName}'s membership? This action cannot be undone.`)) return;
    try {
      setLoading(true);
      await api.delete(`/admin/memberships/${selectedMembership.id}`);
      setShowEditModal(false);
      setSelectedMembership(null);
      await loadData();
      alert('Membership deleted successfully!');
    } catch (error) {
      console.error('Failed to delete membership:', error);
      alert('Failed to delete membership');
    } finally {
      setLoading(false);
    }
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  const counts = {
    all:      memberships.length,
    active:   memberships.filter(m => deriveStatus(m) === 'active').length,
    expiring: memberships.filter(m => deriveStatus(m) === 'expiring').length,
    expired:  memberships.filter(m => deriveStatus(m) === 'expired' || deriveStatus(m) === 'cancelled').length,
  };

  const filtered = memberships
    .filter(m => {
      if (tab === 'all')      return true;
      if (tab === 'expired')  return deriveStatus(m) === 'expired' || deriveStatus(m) === 'cancelled';
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

  // ── Grid columns ───────────────────────────────────────────────────────────
  const cols = isMobile ? '1fr 80px 110px 80px' : '180px 200px 100px 130px 130px 120px 1fr';

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <AdminNav active="memberships" />

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

        {/* ── Stats row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '1px', backgroundColor: RULE, border: `1px solid ${RULE}`, marginBottom: '24px' }}>
          {[
            { label: 'Total Members', value: counts.all       },
            { label: 'Active',        value: counts.active    },
            { label: 'Expiring Soon', value: counts.expiring  },
            { label: 'Expired',       value: counts.expired   },
          ].map((s, i) => (
            <div key={i} style={{ backgroundColor: '#FFFFFF', padding: '16px 20px' }}>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{s.value}</div>
              <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '3px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Search + tabs ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: '0', borderBottom: `1px solid ${RULE}`, marginBottom: '0' }}>
          <div style={{ position: 'relative', width: isMobile ? '100%' : '280px', flexShrink: 0, borderRight: isMobile ? 'none' : `1px solid ${RULE}`, borderBottom: isMobile ? `1px solid ${RULE}` : 'none' }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: MUTED, pointerEvents: 'none' }}>search</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search members…"
              style={{ width: '100%', height: '100%', padding: '10px 12px 10px 34px', border: 'none', backgroundColor: '#FFFFFF', fontSize: '13px', color: INK, outline: 'none', boxSizing: 'border-box', fontFamily: 'Atak, sans-serif' }}
            />
          </div>
          <div style={{ display: 'flex' }}>
            {['all', 'active', 'expiring', 'expired'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '12px 18px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'capitalize',
                color: tab === t ? INK : MUTED,
                borderBottom: `2px solid ${tab === t ? INK : 'transparent'}`,
                marginBottom: '-1px',
              }}>
                {t} <span style={{ color: tab === t ? TC : MUTED, marginLeft: '3px' }}>{counts[t] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Table ── */}
        <div style={{ border: `1px solid ${RULE}`, borderTop: 'none', backgroundColor: '#FFFFFF' }}>

          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: cols, padding: '10px 16px', backgroundColor: ALT, borderBottom: `1px solid ${RULE}` }}>
            {(isMobile
              ? ['Member', 'Plan', 'Expires', 'Status']
              : ['Member', 'Email', 'Plan', 'Start', 'Expires', 'Status', '']
            ).map((h, i) => (
              <span key={i} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{h}</span>
            ))}
          </div>

          {loading && (
            <div style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading memberships…</div>
          )}

          {!loading && filtered.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No memberships found</div>
          )}

          {!loading && filtered.map((m) => {
            const status   = deriveStatus(m);
            const daysLeft = getDaysLeft(m);
            const perks    = m.perks ? (typeof m.perks === 'object' ? Object.keys(m.perks) : m.perks) : [];

            return (
              <div key={m.id}>
                {/* Row */}
                <div
                  onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                  style={{
                    display: 'grid', gridTemplateColumns: cols,
                    padding: '13px 16px', borderBottom: `1px solid ${RULE}`,
                    backgroundColor: expanded === m.id ? TC_LIGHT : '#FFFFFF',
                    alignItems: 'center', cursor: 'pointer',
                    borderLeft: status === 'expiring' ? `3px solid #E6A817` : '3px solid transparent',
                    transition: 'background-color 0.1s',
                  }}
                >
                  {/* Member name (+ email stacked on mobile) */}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>{m.studentName || '—'}</div>
                    {isMobile && <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{m.studentEmail || ''}</div>}
                  </div>

                  {/* Email — desktop only */}
                  {!isMobile && <span style={{ fontSize: '12px', color: MUTED }}>{m.studentEmail || '—'}</span>}

                  {/* Plan badge */}
                  <span style={{
                    fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                    padding: '4px 8px', display: 'inline-block',
                    backgroundColor: TYPE_BADGE[m.type]?.bg || ALT,
                    color:           TYPE_BADGE[m.type]?.text || MUTED,
                  }}>
                    {m.type || '—'}
                  </span>

                  {/* Start — desktop only */}
                  {!isMobile && <span style={{ fontSize: '12px', color: MUTED }}>{fmtDate(m.startDate)}</span>}

                  {/* End date */}
                  <span style={{ fontSize: '12px', color: status === 'expiring' ? '#9E6200' : MUTED, fontWeight: status === 'expiring' ? 700 : 400 }}>
                    {fmtDate(m.endDate)}
                  </span>

                  {/* Status badge */}
                  <span style={{
                    fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                    padding: '4px 8px', display: 'inline-block',
                    backgroundColor: STATUS_STYLE[status]?.bg || ALT,
                    color:           STATUS_STYLE[status]?.text || MUTED,
                  }}>
                    {status === 'expiring'
                      ? `${daysLeft}d left`
                      : status === 'expired'
                        ? 'Expired'
                        : status === 'cancelled'
                          ? 'Cancelled'
                          : `${daysLeft}d`}
                  </span>

                  {/* Actions — desktop inline */}
                  {!isMobile && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' }}>
                      {status !== 'expired' && status !== 'cancelled' && (
                        <button
                          onClick={e => openEdit(m, e)}
                          style={{ padding: '5px 12px', border: `1px solid ${TC}`, backgroundColor: 'transparent', color: TC, fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
                        >
                          Edit
                        </button>
                      )}
                      {(status === 'expiring' || status === 'expired') && (
                        <button
                          onClick={e => { e.stopPropagation(); openEdit(m, e); }}
                          style={{ padding: '5px 12px', border: 'none', backgroundColor: TC, color: '#FFF', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
                        >
                          Renew
                        </button>
                      )}
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: MUTED, transition: 'transform 0.2s', transform: expanded === m.id ? 'rotate(90deg)' : 'none' }}>chevron_right</span>
                    </div>
                  )}
                </div>

                {/* Expanded row: perks + mobile actions */}
                {expanded === m.id && (
                  <div style={{ backgroundColor: TC_LIGHT, borderBottom: `1px solid rgba(196,98,45,0.15)`, padding: '14px 16px 14px 20px' }}>
                    {perks.length > 0 && (
                      <>
                        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TC_DARK, marginBottom: '10px' }}>Included Perks</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: isMobile ? '12px' : '0' }}>
                          {perks.map((p, j) => (
                            <span key={j} style={{ fontSize: '11px', padding: '4px 10px', backgroundColor: '#FFFFFF', border: `1px solid rgba(196,98,45,0.2)`, color: INK }}>
                              {p}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    {isMobile && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: perks.length > 0 ? '12px' : '0' }}>
                        {status !== 'expired' && status !== 'cancelled' && (
                          <button
                            onClick={e => openEdit(m, e)}
                            style={{ padding: '8px 16px', border: `1px solid ${TC}`, backgroundColor: 'transparent', color: TC, fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
                          >
                            Edit
                          </button>
                        )}
                        {(status === 'expiring' || status === 'expired') && (
                          <button
                            onClick={e => { e.stopPropagation(); openEdit(m, e); }}
                            style={{ padding: '8px 16px', border: 'none', backgroundColor: TC, color: '#FFF', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
                          >
                            Renew
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* ── Edit Membership Modal ──────────────────────────────────────────────── */}
      {showEditModal && selectedMembership && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#FFFFFF', padding: '32px', width: '440px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>Edit Membership</div>
                <div style={{ fontSize: '12px', color: MUTED, marginTop: '2px' }}>{selectedMembership.studentName}</div>
              </div>
              <button
                onClick={() => { setShowEditModal(false); setSelectedMembership(null); }}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: MUTED }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              {/* Plan (read-only display) */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Plan</label>
                <div style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', backgroundColor: ALT, color: MUTED, boxSizing: 'border-box' }}>
                  {selectedMembership.type}
                </div>
              </div>

              {/* Start Date */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Start Date</label>
                <input
                  type="date"
                  value={selectedMembership.startDate || ''}
                  onChange={e => setSelectedMembership({ ...selectedMembership, startDate: e.target.value })}
                  required
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box', outline: 'none' }}
                />
              </div>

              {/* End Date */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>End Date</label>
                <input
                  type="date"
                  value={selectedMembership.endDate || ''}
                  onChange={e => setSelectedMembership({ ...selectedMembership, endDate: e.target.value })}
                  required
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box', outline: 'none' }}
                />
              </div>

              {/* Status */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Status</label>
                <select
                  value={selectedMembership.status || 'active'}
                  onChange={e => setSelectedMembership({ ...selectedMembership, status: e.target.value })}
                  required
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box', outline: 'none' }}
                >
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={loading}
                  style={{ padding: '12px 16px', border: 'none', backgroundColor: '#FEE2E2', color: '#EF4444', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
                >
                  Delete
                </button>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setSelectedMembership(null); }}
                  style={{ padding: '12px 16px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{ padding: '12px 16px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
                >
                  {loading ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Create Membership Modal ────────────────────────────────────────────── */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#FFFFFF', padding: '32px', width: '480px', maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>Create Membership</div>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: MUTED }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              {/* Student */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Student *</label>
                <select
                  value={createForm.customerId}
                  onChange={e => setCreateForm({ ...createForm, customerId: e.target.value })}
                  required
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box', outline: 'none' }}
                >
                  <option value="">Select a student…</option>
                  {students.map(student => (
                    <option key={student.dbId} value={student.dbId}>
                      {student.firstName} {student.lastName} ({student.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Plan selector */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Membership Plan *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {['3 Month', '6 Month', '12 Month'].map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleMembershipTypeChange(type)}
                      style={{
                        padding: '12px 8px',
                        border: `2px solid ${createForm.membershipType === type ? TC : RULE}`,
                        backgroundColor: createForm.membershipType === type ? TC_LIGHT : '#FFFFFF',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 700, color: createForm.membershipType === type ? TC_DARK : INK }}>{type}</div>
                      <div style={{ fontSize: '10px', color: MUTED, marginTop: '2px' }}>
                        {type === '3 Month' ? '$150' : type === '6 Month' ? '$280' : '$500'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Start date */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Start Date *</label>
                <input
                  type="date"
                  value={createForm.startDate}
                  onChange={e => { setCreateForm({ ...createForm, startDate: e.target.value }); handleMembershipTypeChange(createForm.membershipType); }}
                  required
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box', outline: 'none' }}
                />
              </div>

              {/* End date (read-only) */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>End Date (auto-calculated)</label>
                <input
                  type="date"
                  value={createForm.endDate}
                  readOnly
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box', backgroundColor: ALT, color: MUTED, cursor: 'not-allowed' }}
                />
              </div>

              {/* Perks preview */}
              {Object.keys(createForm.perks).length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '8px' }}>Included Perks</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {Object.keys(createForm.perks).map(perk => (
                      <span key={perk} style={{ fontSize: '11px', padding: '4px 10px', backgroundColor: TC_LIGHT, border: `1px solid rgba(196,98,45,0.2)`, color: TC_DARK }}>
                        {perk}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{ flex: 1, padding: '12px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
                >
                  {loading ? 'Creating…' : 'Create Membership'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
