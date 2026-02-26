import { useState, useEffect } from 'react';

function useIsMobile(bp = 768) {
  const [mobile, setMobile] = useState(() => window.innerWidth < bp);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < bp);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, [bp]);
  return mobile;
}

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

const NAV = [
  { id: 'dashboard',   label: 'Dashboard', href: '/test/admin' },
  { id: 'classes',     label: 'Classes',   href: '/test/admin/classes' },
  { id: 'students',    label: 'Students',  href: '/test/admin/students' },
  { id: 'memberships', label: 'Members',   href: '/test/admin/memberships' },
];

function AdminNav({ active }) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: '#FFFFFF', borderBottom: `1px solid ${RULE}` }}>
      <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '24px' }}>
        <img src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600" alt="VES" style={{ height: '22px', width: 'auto', flexShrink: 0 }} />
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

const MEMBERSHIPS = [
  { id: 1,  name: 'Diana Lim',    email: 'diana.lim@email.com',   type: '6 Month',  start: '5 Jan 2026',  end: '5 Mar 2026',  daysLeft: 7,   status: 'expiring', perks: ['Unlimited access', 'Free storage', 'Studio glazes', '1x Firing ($90)', '10% off'] },
  { id: 2,  name: 'Kenny Toh',    email: 'kenny.toh@email.com',   type: '12 Month', start: '12 Mar 2025', end: '12 Mar 2026',  daysLeft: 14,  status: 'expiring', perks: ['Unlimited access', 'Free storage', 'Studio glazes', 'Clay reclaim', '2x Firing ($260)', '10% off', '10% renewal'] },
  { id: 3,  name: 'Priya Nair',   email: 'priya.nair@email.com',  type: '1 Month',  start: '1 Feb 2026',  end: '1 Mar 2026',  daysLeft: 3,   status: 'expiring', perks: ['Unlimited access', 'Free storage', 'Studio glazes'] },
  { id: 4,  name: 'Sarah Tan',    email: 'sarah.tan@email.com',   type: '6 Month',  start: '5 Nov 2025',  end: '5 May 2026',  daysLeft: 68,  status: 'active',   perks: ['Unlimited access', 'Free storage', 'Studio glazes', '1x Firing ($90)', '10% off', '10% renewal'] },
  { id: 5,  name: 'Mei Lin',      email: 'mei.lin@email.com',     type: '12 Month', start: '1 Dec 2025',  end: '1 Dec 2026',  daysLeft: 278, status: 'active',   perks: ['Unlimited access', 'Free storage', 'Studio glazes', 'Clay reclaim', '2x Firing ($260)', '10% off', '10% renewal'] },
  { id: 6,  name: 'Stella Koh',   email: 'stella.koh@email.com',  type: '6 Month',  start: '1 Jan 2026',  end: '1 Jul 2026',  daysLeft: 125, status: 'active',   perks: ['Unlimited access', 'Free storage', 'Studio glazes', '1x Firing ($90)', '10% off', '10% renewal'] },
  { id: 7,  name: 'Sooji Kim',    email: 'sooji.kim@email.com',   type: '6 Month',  start: '1 Jun 2025',  end: '1 Dec 2025',  daysLeft: -87, status: 'expired',  perks: [] },
  { id: 8,  name: 'Marcus Wong',  email: 'marcus.wong@email.com', type: '1 Month',  start: '1 Oct 2025',  end: '1 Nov 2025',  daysLeft: -117, status: 'expired', perks: [] },
];

const STATUS_STYLE = {
  active:   { bg: TC_LIGHT,  text: TC_DARK  },
  expiring: { bg: '#FFF7E6', text: '#9E6200' },
  expired:  { bg: ALT,       text: MUTED    },
};

const TYPE_BADGE = {
  '1 Month':  { bg: ALT,  text: INK  },
  '6 Month':  { bg: TC_LIGHT, text: TC_DARK },
  '12 Month': { bg: INK,  text: '#FFF' },
};

export default function TestAdminMemberships() {
  const isMobile = useIsMobile();
  const [tab, setTab]         = useState('all');
  const [search, setSearch]   = useState('');
  const [memberships, setMemberships] = useState(MEMBERSHIPS);
  const [showCreate, setShowCreate]   = useState(false);
  const [expanded, setExpanded]       = useState(null);
  const [editMembership, setEditMembership] = useState(null); // { ...member }
  const [editDraft, setEditDraft]     = useState({});

  const cols = isMobile ? '1fr 80px 110px 80px' : '180px 200px 100px 130px 130px 120px 1fr';

  function openEdit(m, e) {
    e.stopPropagation();
    setEditDraft({ type: m.type, start: m.start, end: m.end });
    setEditMembership(m);
  }
  function saveEdit() {
    setMemberships(ms => ms.map(m => m.id === editMembership.id ? { ...m, ...editDraft } : m));
    setEditMembership(null);
  }

  const filtered = memberships
    .filter(m => tab === 'all' || m.status === tab)
    .filter(m =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase())
    );

  const counts = {
    all:      memberships.length,
    active:   memberships.filter(m => m.status === 'active').length,
    expiring: memberships.filter(m => m.status === 'expiring').length,
    expired:  memberships.filter(m => m.status === 'expired').length,
  };

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <AdminNav active="memberships" />

      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '32px 24px 60px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px', display: 'flex', alignItems: isMobile ? 'flex-start' : 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>Admin</div>
            <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>Memberships</h1>
          </div>
          <button onClick={() => setShowCreate(true)} style={{ padding: isMobile ? '9px 14px' : '10px 18px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
            + Create Membership
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '1px', backgroundColor: RULE, border: `1px solid ${RULE}`, marginBottom: '24px' }}>
          {[
            { label: 'Total Members',    value: MEMBERSHIPS.length },
            { label: 'Active',           value: counts.active },
            { label: 'Expiring Soon',    value: counts.expiring },
            { label: 'Expired',          value: counts.expired },
          ].map((s, i) => (
            <div key={i} style={{ backgroundColor: '#FFFFFF', padding: '16px 20px' }}>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{s.value}</div>
              <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '3px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search + tabs */}
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
                {t} <span style={{ color: tab === t ? TC : MUTED, marginLeft: '3px' }}>{counts[t]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ border: `1px solid ${RULE}`, borderTop: 'none', backgroundColor: '#FFFFFF' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: cols, padding: '10px 16px', backgroundColor: ALT, borderBottom: `1px solid ${RULE}` }}>
            {(isMobile ? ['Member', 'Plan', 'Expires', 'Status'] : ['Member', 'Email', 'Plan', 'Start', 'Expires', 'Status', '']).map((h, i) => (
              <span key={i} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{h}</span>
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No memberships found</div>
          )}

          {filtered.map((m, i) => (
            <div key={m.id}>
              <div
                onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                style={{
                  display: 'grid', gridTemplateColumns: cols,
                  padding: '13px 16px', borderBottom: `1px solid ${RULE}`,
                  backgroundColor: expanded === m.id ? TC_LIGHT : '#FFFFFF',
                  alignItems: 'center', cursor: 'pointer',
                  borderLeft: m.status === 'expiring' ? `3px solid #E6A817` : '3px solid transparent',
                  transition: 'background-color 0.1s',
                }}
              >
                {/* Member (+ email stacked on mobile) */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{m.name}</div>
                  {isMobile && <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{m.email}</div>}
                </div>

                {!isMobile && <span style={{ fontSize: '12px', color: MUTED }}>{m.email}</span>}

                {/* Type badge */}
                <span style={{
                  fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                  padding: '4px 8px', display: 'inline-block',
                  backgroundColor: TYPE_BADGE[m.type]?.bg || ALT,
                  color: TYPE_BADGE[m.type]?.text || MUTED,
                }}>{m.type}</span>

                {!isMobile && <span style={{ fontSize: '12px', color: MUTED }}>{m.start}</span>}

                <span style={{ fontSize: '12px', color: m.status === 'expiring' ? '#9E6200' : MUTED, fontWeight: m.status === 'expiring' ? 700 : 400 }}>{m.end}</span>

                {/* Status */}
                <span style={{
                  fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                  padding: '4px 8px', display: 'inline-block',
                  backgroundColor: STATUS_STYLE[m.status]?.bg || ALT,
                  color: STATUS_STYLE[m.status]?.text || MUTED,
                }}>
                  {m.status === 'expiring'
                    ? `${m.daysLeft}d left`
                    : m.status === 'expired'
                      ? 'expired'
                      : `${m.daysLeft}d`}
                </span>

                {/* Actions — desktop only inline; mobile via expand */}
                {!isMobile && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' }}>
                    {m.status !== 'expired' && (
                      <button onClick={e => openEdit(m, e)} style={{ padding: '5px 12px', border: `1px solid ${TC}`, backgroundColor: 'transparent', color: TC, fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>Edit</button>
                    )}
                    {(m.status === 'expiring' || m.status === 'expired') && (
                      <button onClick={e => e.stopPropagation()} style={{ padding: '5px 12px', border: 'none', backgroundColor: TC, color: '#FFF', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>Renew</button>
                    )}
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: MUTED, transition: 'transform 0.2s', transform: expanded === m.id ? 'rotate(90deg)' : 'none' }}>chevron_right</span>
                  </div>
                )}
              </div>

              {/* Expanded: perks */}
              {expanded === m.id && (
                <div style={{ backgroundColor: TC_LIGHT, borderBottom: `1px solid rgba(196,98,45,0.15)`, padding: '14px 16px 14px 20px' }}>
                  {m.perks.length > 0 && (
                    <>
                      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TC_DARK, marginBottom: '10px' }}>Included Perks</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: isMobile ? '12px' : '0' }}>
                        {m.perks.map((p, j) => (
                          <span key={j} style={{ fontSize: '11px', padding: '4px 10px', backgroundColor: '#FFFFFF', border: `1px solid rgba(196,98,45,0.2)`, color: INK }}>
                            {p}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  {isMobile && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: m.perks.length > 0 ? '0' : '0' }}>
                      {m.status !== 'expired' && (
                        <button onClick={e => openEdit(m, e)} style={{ padding: '8px 16px', border: `1px solid ${TC}`, backgroundColor: 'transparent', color: TC, fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>Edit</button>
                      )}
                      {(m.status === 'expiring' || m.status === 'expired') && (
                        <button style={{ padding: '8px 16px', border: 'none', backgroundColor: TC, color: '#FFF', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>Renew</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

      </main>

      {/* Edit Membership Modal */}
      {editMembership && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#FFFFFF', padding: '32px', width: '440px', maxWidth: '90vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>Edit Membership</div>
                <div style={{ fontSize: '12px', color: MUTED, marginTop: '2px' }}>{editMembership.name}</div>
              </div>
              <button onClick={() => setEditMembership(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: MUTED }}>✕</button>
            </div>

            {[
              { label: 'Plan', key: 'type', type: 'select', options: ['1 Month', '6 Month', '12 Month'] },
              { label: 'Start Date', key: 'start', type: 'text' },
              { label: 'End Date',   key: 'end',   type: 'text' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>{f.label}</label>
                {f.type === 'select'
                  ? <select value={editDraft[f.key]} onChange={e => setEditDraft(d => ({ ...d, [f.key]: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box', outline: 'none' }}>
                      {f.options.map(o => <option key={o}>{o}</option>)}
                    </select>
                  : <input value={editDraft[f.key]} onChange={e => setEditDraft(d => ({ ...d, [f.key]: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box', outline: 'none' }} />
                }
              </div>
            ))}

            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setEditMembership(null)} style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveEdit} style={{ flex: 1, padding: '12px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Membership Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#FFFFFF', padding: '32px', width: '460px', maxWidth: '90vw' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px' }}>Create Membership</div>

            {[
              { label: 'Student', type: 'select-student' },
              { label: 'Membership Plan', type: 'select-plan' },
              { label: 'Start Date', type: 'date', value: '2026-02-26' },
              { label: 'End Date', type: 'date' },
            ].map((f, i) => (
              <div key={i} style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>{f.label}</label>
                {f.type === 'select-student'
                  ? <select style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box' }}>
                      <option>Select student…</option>
                      <option>Sarah Tan</option>
                      <option>Joey Lim</option>
                      <option>Jess Yeo</option>
                      <option>Ryan Ong</option>
                    </select>
                  : f.type === 'select-plan'
                    ? <select style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box' }}>
                        <option>1 Month — $350</option>
                        <option>6 Month — $1,260</option>
                        <option>12 Month — $1,995</option>
                      </select>
                    : <input type={f.type} defaultValue={f.value} style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box' }} />
                }
              </div>
            ))}

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
              <button style={{ flex: 1, padding: '12px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Create</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
