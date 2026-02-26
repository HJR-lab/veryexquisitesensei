import { useState } from 'react';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

const NAV = [
  { id: 'dashboard',    label: 'Dashboard', href: '/test/admin' },
  { id: 'classes',      label: 'Classes',   href: '/test/admin/classes' },
  { id: 'students',     label: 'Students',  href: '/test/admin/students' },
  { id: 'memberships',  label: 'Members',   href: '/test/admin/memberships' },
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
        <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 10px', backgroundColor: INK, color: '#FFF', flexShrink: 0 }}>
          Admin
        </span>
      </div>
    </header>
  );
}

const STATS = [
  { label: 'Active Students',   value: 12, sub: '3 new this month',   icon: 'group' },
  { label: 'Active Members',    value: 8,  sub: '2 expiring soon',    icon: 'card_membership' },
  { label: 'Classes This Week', value: 14, sub: '6 open spots',       icon: 'event' },
  { label: 'Gallery Pieces',    value: 87, sub: '5 added this month', icon: 'photo_library' },
];

const MODULES = [
  { label: 'Students',  icon: 'group',          href: '/test/admin/students',    desc: 'Allocations & accounts' },
  { label: 'Classes',   icon: 'event',           href: '/test/admin/classes',     desc: 'Schedule & bookings' },
  { label: 'Members',   icon: 'card_membership', href: '/test/admin/memberships', desc: 'Studio memberships' },
  { label: 'Gallery',   icon: 'photo_library',   href: '#',                       desc: 'Student pottery works' },
  { label: 'Courses',   icon: 'school',          href: '#',                       desc: 'Course templates' },
  { label: 'Reference', icon: 'inventory_2',     href: '#',                       desc: 'Clay types & glazes' },
];

const ALERTS = [
  { type: 'membership', text: 'Diana Lim — 6 Month expires Mar 5' },
  { type: 'membership', text: 'Kenny Toh — 12 Month expires Mar 12' },
  { type: 'class',      text: 'WT Sat Mar 7 — 1 spot remaining' },
  { type: 'class',      text: 'HB Wed Mar 4 — now full' },
  { type: 'student',    text: 'Chloe Lim — upcoming enrollment Mar 1' },
];

const RECENT = [
  { action: 'New booking',    who: 'Sarah Tan',   detail: 'WT Feb 28, 2pm',   when: '2h ago' },
  { action: 'Membership',     who: 'Priya Nair',  detail: '1 Month started',  when: '1d ago' },
  { action: 'Gallery upload', who: 'Mei Lin',     detail: 'Handbuilding vase', when: '1d ago' },
  { action: 'Cancelled',      who: 'Marcus Wong', detail: 'HB Feb 25',        when: '2d ago' },
  { action: 'New student',    who: 'Ryan Ong',    detail: 'HB course started', when: '3d ago' },
];

export default function TestAdminDash() {
  const [hoveredModule, setHoveredModule] = useState(null);

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <AdminNav active="dashboard" />

      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '32px 24px 60px' }}>

        {/* Page header */}
        <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>VES Pottery Studio</div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>Admin Dashboard</h1>
          </div>
          <div style={{ fontSize: '12px', color: MUTED }}>Thu, 26 Feb 2026</div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', backgroundColor: RULE, border: `1px solid ${RULE}`, marginBottom: '28px' }}>
          {STATS.map((s, i) => (
            <div key={i} style={{ backgroundColor: '#FFFFFF', padding: '22px 20px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: TC, display: 'block', marginBottom: '14px' }}>{s.icon}</span>
              <div style={{ fontSize: '36px', fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: INK, marginTop: '6px' }}>{s.label}</div>
              <div style={{ fontSize: '11px', color: MUTED, marginTop: '3px' }}>{s.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 300px', gap: '24px', alignItems: 'start' }}>

          {/* Module grid */}
          <div style={{ gridColumn: 'span 2' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>Manage</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', backgroundColor: RULE, border: `1px solid ${RULE}` }}>
              {MODULES.map((m, i) => (
                <a key={i} href={m.href}
                  style={{
                    backgroundColor: hoveredModule === i ? TC_LIGHT : '#FFFFFF',
                    padding: '22px 20px', textDecoration: 'none', color: INK, display: 'block',
                    transition: 'background-color 0.1s',
                  }}
                  onMouseEnter={() => setHoveredModule(i)}
                  onMouseLeave={() => setHoveredModule(null)}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px', color: TC, display: 'block', marginBottom: '10px' }}>{m.icon}</span>
                  <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '3px' }}>{m.label}</div>
                  <div style={{ fontSize: '11px', color: MUTED }}>{m.desc}</div>
                </a>
              ))}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Alerts */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>Alerts</div>
              <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF' }}>
                {ALERTS.map((alert, i) => (
                  <div key={i} style={{
                    padding: '11px 14px',
                    borderBottom: i < ALERTS.length - 1 ? `1px solid ${RULE}` : 'none',
                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px', color: TC, flexShrink: 0, marginTop: '1px' }}>
                      {alert.type === 'membership' ? 'card_membership' : alert.type === 'class' ? 'event' : 'person'}
                    </span>
                    <span style={{ fontSize: '12px', color: INK, lineHeight: 1.4 }}>{alert.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent activity */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>Recent Activity</div>
              <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF' }}>
                {RECENT.map((r, i) => (
                  <div key={i} style={{
                    padding: '11px 14px',
                    borderBottom: i < RECENT.length - 1 ? `1px solid ${RULE}` : 'none',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: TC, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{r.action}</span>
                      <span style={{ fontSize: '10px', color: MUTED }}>{r.when}</span>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>{r.who}</div>
                    <div style={{ fontSize: '11px', color: MUTED }}>{r.detail}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
