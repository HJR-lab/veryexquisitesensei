import { useState } from 'react';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

const HISTORY = [
  { id: 1, title: 'Wheel Throwing — Beginners', type: 'WT', start: 'Sep 2025', end: 'Oct 2025', classes: 6, status: 'completed' },
  { id: 2, title: 'Handbuilding Basics',         type: 'HB', start: 'Nov 2025', end: 'Dec 2025', classes: 6, status: 'completed' },
  { id: 3, title: 'Wheel Throwing — Beginners', type: 'WT', start: 'Jan 2026', end: 'Feb 2026', classes: 4, status: 'active'    },
  { id: 4, title: 'Handbuilding Basics',         type: 'HB', start: 'Feb 2026', end: 'Mar 2026', classes: 1, status: 'active'    },
];

function FieldRow({ label, value, type = 'text', readOnly = false }) {
  const [val, setVal] = useState(value);
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '6px' }}>
        {label}
      </label>
      <input
        type={type}
        value={val}
        readOnly={readOnly}
        onChange={e => setVal(e.target.value)}
        style={{
          width: '100%', padding: '10px 12px',
          border: `1px solid ${RULE}`, backgroundColor: readOnly ? ALT : '#FFFFFF',
          fontSize: '14px', color: readOnly ? MUTED : INK,
          outline: 'none', boxSizing: 'border-box',
          fontFamily: 'Atak, sans-serif',
        }}
      />
    </div>
  );
}

export default function TestAccount() {
  const [activeTab, setActiveTab] = useState('account');
  const [section, setSection] = useState('details'); // 'details' | 'password' | 'history'

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#FFFFFF', minHeight: '100vh' }}>

{/* ── MEMBERSHIP HINT ── */}
      <div style={{ backgroundColor: TC_LIGHT, width: '100%' }}>
        <div style={{
          maxWidth: '520px', margin: '0 auto', padding: '9px 20px',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: TC_DARK, flexShrink: 0 }}>
            Ves • Clay Club Membership
          </span>
          <span style={{ fontSize: '11px', color: INK, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Unlock unlimited studio access now!
          </span>
          <a href="#" onClick={e => e.preventDefault()} style={{
            fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: TC, textDecoration: 'none', whiteSpace: 'nowrap',
            borderBottom: `1px solid ${TC}`, paddingBottom: '1px', flexShrink: 0,
          }}>
            View plans
          </a>
        </div>
      </div>
      {/* TOP BAR */}
      <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: '#FFFFFF', borderBottom: `1px solid ${RULE}` }}>
        <div style={{ maxWidth: '520px', margin: '0 auto', padding: '0 20px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600" alt="VES" style={{ height: '26px', width: 'auto' }} />
        </div>
      </header>

      <main style={{ maxWidth: '520px', margin: '0 auto', padding: '0 0 88px' }}>

        {/* Page header + avatar */}
        <div style={{ padding: '28px 20px 20px', borderBottom: `1px solid ${RULE}`, display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Avatar */}
          <div style={{ width: '56px', height: '56px', backgroundColor: TC_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '22px', fontWeight: 700, color: TC_DARK }}>S</span>
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.2px', margin: '0 0 3px' }}>Sarah Tan</h1>
            <div style={{ fontSize: '12px', color: MUTED }}>Member since Sep 2025</div>
          </div>
        </div>

        {/* Section tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${RULE}` }}>
          {[
            { id: 'details',  label: 'Details'  },
            { id: 'password', label: 'Password' },
            { id: 'history',  label: 'History'  },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setSection(t.id)}
              style={{
                flex: 1, padding: '12px 0', border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: section === t.id ? INK : MUTED,
                borderBottom: `2px solid ${section === t.id ? INK : 'transparent'}`,
                transition: 'all 0.15s ease',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* DETAILS */}
        {section === 'details' && (
          <div style={{ padding: '24px 20px' }}>
            <FieldRow label="First Name"    value="Sarah" />
            <FieldRow label="Last Name"     value="Tan" />
            <FieldRow label="Email"         value="sarah.tan@email.com" type="email" />
            <FieldRow label="Mobile"        value="+65 9123 4567" type="tel" />
            <FieldRow label="Date of Birth" value="1995-04-12" type="date" />

            <button style={{
              width: '100%', padding: '13px', marginTop: '8px',
              border: 'none', backgroundColor: INK, color: '#FFF',
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}>
              Save Changes
            </button>

            <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: `1px solid ${RULE}` }}>
              <button style={{
                width: '100%', padding: '13px',
                border: `1px solid rgba(200,50,50,0.3)`, backgroundColor: 'transparent',
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: 'pointer', color: '#C03030',
              }}>
                Sign Out
              </button>
            </div>
          </div>
        )}

        {/* PASSWORD */}
        {section === 'password' && (
          <div style={{ padding: '24px 20px' }}>
            <FieldRow label="Current Password" value=""    type="password" />
            <FieldRow label="New Password"     value=""    type="password" />
            <FieldRow label="Confirm Password" value=""    type="password" />
            <div style={{ fontSize: '11px', color: MUTED, marginTop: '-8px', marginBottom: '20px' }}>Minimum 6 characters</div>
            <button style={{
              width: '100%', padding: '13px',
              border: 'none', backgroundColor: INK, color: '#FFF',
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}>
              Change Password
            </button>
          </div>
        )}

        {/* COURSE HISTORY */}
        {section === 'history' && (
          <div style={{ padding: '24px 20px' }}>
            {/* Stats strip */}
            <div style={{ display: 'flex', gap: '1px', marginBottom: '24px' }}>
              {[
                { label: 'Courses', value: HISTORY.length },
                { label: 'Completed', value: HISTORY.filter(h => h.status === 'completed').length },
                { label: 'Classes Attended', value: HISTORY.reduce((s, h) => s + h.classes, 0) },
              ].map((stat, i) => (
                <div key={i} style={{ flex: 1, padding: '12px', backgroundColor: ALT, textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700 }}>{stat.value}</div>
                  <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '2px' }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Course list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {HISTORY.map(course => (
                <div key={course.id} style={{ padding: '14px', border: `1px solid ${RULE}`, backgroundColor: ALT }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '3px' }}>{course.title}</div>
                      <div style={{ fontSize: '11px', color: MUTED }}>{course.start} – {course.end}</div>
                    </div>
                    <span style={{
                      fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                      padding: '4px 8px', marginLeft: '8px', flexShrink: 0,
                      backgroundColor: TC_LIGHT,
                      color: TC_DARK,
                    }}>
                      {course.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '11px', color: MUTED }}>{course.classes} classes attended</div>
                    <a href="#" onClick={e => e.preventDefault()} style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: TC, textDecoration: 'none' }}>
                      View Gallery →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}

function BottomNav({ activeTab, setActiveTab }) {
  const TC = '#C4622D';
  const RULE = 'rgba(40,40,40,0.09)';
  const tabs = [
    { id: 'home',    label: 'Home',    icon: 'home',           href: '/test/dashboard' },
    { id: 'classes', label: 'Classes', icon: 'calendar_month', href: '/test/classes' },
    { id: 'gallery', label: 'Gallery', icon: 'photo_library',  href: '/test/gallery' },
    { id: 'account', label: 'Account', icon: 'person',         href: '/test/account', badge: true },
  ];
  return (
    <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, backgroundColor: '#FFFFFF', borderTop: `1px solid ${RULE}`, display: 'flex', height: '60px', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {tabs.map(tab => {
        const active = activeTab === tab.id;
        return (
          <a key={tab.id} href={tab.href} onClick={e => { e.preventDefault(); setActiveTab(tab.id); window.location.href = tab.href; }}
            style={{ flex: 1, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', padding: '8px 0', position: 'relative', textDecoration: 'none' }}
          >
            {tab.badge && <span style={{ position: 'absolute', top: '7px', right: 'calc(50% - 16px)', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: TC }} />}
            <span className="material-symbols-outlined" style={{ fontSize: '22px', color: active ? TC : '#BBBBBB', fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400" }}>{tab.icon}</span>
            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: active ? TC : '#BBBBBB' }}>{tab.label}</span>
            {active && <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '20px', height: '2px', backgroundColor: TC }} />}
          </a>
        );
      })}
    </nav>
  );
}
