import { useState } from 'react';

// ─── Design tokens ────────────────────────────────────────────────────────────
const TC       = '#C4622D';   // terracotta
const TC_LIGHT = '#F9EDE6';   // terracotta tint
const TC_DARK  = '#9E4A1E';   // terracotta deep
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

// ─── Mock data ────────────────────────────────────────────────────────────────
const STUDENT = { name: 'Sarah', classesLeft: 3, nextDate: 'Wed 4 Mar', nextTime: '7:00 PM' };

const COURSES = [
  { id: 1, title: 'Wheel Throwing — Beginners', attended: 4, total: 6, status: 'active' },
  { id: 2, title: 'Handbuilding Basics',         attended: 1, total: 6, status: 'upcoming' },
];

const CLASSES = [
  { date: 'Wed', day: '4',  month: 'Mar', time: '7:00 – 9:30 PM',   course: 'Wheel Throwing' },
  { date: 'Sat', day: '7',  month: 'Mar', time: '10:00 – 12:30 PM', course: 'Handbuilding'   },
  { date: 'Wed', day: '11', month: 'Mar', time: '7:00 – 9:30 PM',   course: 'Wheel Throwing' },
];

const MY_PIECES = [
  { id: 1, title: 'First Bowl',    img: 'https://picsum.photos/seed/ves-p1/600/600' },
  { id: 2, title: 'Mug No. 2',    img: 'https://picsum.photos/seed/ves-p2/600/600' },
  { id: 3, title: 'Vase Attempt', img: 'https://picsum.photos/seed/ves-p3/600/600' },
  { id: 4, title: 'Teapot',       img: 'https://picsum.photos/seed/ves-p4/600/600' },
];

const COMMUNITY = [
  { id: 1, student: 'Ming',  title: 'Glazed Bowl',  img: 'https://picsum.photos/seed/ves-c1/600/600' },
  { id: 2, student: 'Priya', title: 'Yunomi Cup',   img: 'https://picsum.photos/seed/ves-c2/600/600' },
  { id: 3, student: 'Jun',   title: 'Slab Plate',   img: 'https://picsum.photos/seed/ves-c3/600/600' },
  { id: 4, student: 'Farah', title: 'Coil Vase',    img: 'https://picsum.photos/seed/ves-c4/600/600' },
];

// ─── Tiny reusable components ─────────────────────────────────────────────────
function SectionLabel({ children, action, actionLabel }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED }}>
        {children}
      </span>
      {action && (
        <a href="#" onClick={e => e.preventDefault()} style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: TC, textDecoration: 'none' }}>
          {actionLabel} →
        </a>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ height: '1px', backgroundColor: RULE, margin: '0 0 28px' }} />;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TestDash() {
  const [activeTab, setActiveTab] = useState('home');
  const [showPast, setShowPast] = useState(false);

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

      {/* ── TOP BAR ── */}
      <header style={{
        position: 'sticky', top: 8, zIndex: 40,
        backgroundColor: '#FFFFFF',
        borderBottom: `1px solid ${RULE}`,
      }}>
        <div style={{ maxWidth: '520px', margin: '0 auto', padding: '0 20px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
            alt="VES"
            style={{ height: '26px', width: 'auto' }}
          />
        </div>
      </header>

      {/* ── SCROLL BODY ── */}
      <main style={{ maxWidth: '520px', margin: '0 auto', padding: '0 20px 88px' }}>

        {/* ── 1. GREETING ── */}
        <div style={{ padding: '32px 0 24px', borderBottom: `1px solid ${RULE}`, marginBottom: '28px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1.05, margin: '0 0 10px' }}>
            Hi {STUDENT.name}.
          </h1>
          <div style={{ display: 'flex', gap: '6px 16px', fontSize: '14px', color: MUTED }}>
            {COURSES.map((c, i) => {
              const left = c.total - c.attended;
              const label = c.title.startsWith('Wheel') ? 'Wheelthrowing' : 'Handbuilding';
              return (
                <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {i > 0 && <span style={{ color: RULE }}>·</span>}
                  <strong style={{ color: INK }}>{left}</strong>&nbsp;{label}
                </span>
              );
            })}
          </div>
          <div style={{ fontSize: '13px', color: MUTED, marginTop: '4px' }}>
            Next: <strong style={{ color: INK }}>{STUDENT.nextDate}</strong>, {STUDENT.nextTime}
          </div>
        </div>

        {/* ── 3. MY COURSES ── */}
        <section style={{ marginBottom: '28px' }}>
          <SectionLabel>My Courses</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {[...COURSES].sort((a, b) => {
              // WT always first
              const aWT = a.title.startsWith('Wheel');
              const bWT = b.title.startsWith('Wheel');
              return aWT === bWT ? 0 : aWT ? -1 : 1;
            }).map(c => {
              const pct = Math.round((c.attended / c.total) * 100);
              const isActive = c.status === 'active';
              const typeLabel = c.title.startsWith('Wheel') ? 'Wheelthrowing' : 'Handbuilding';
              return (
                <div key={c.id} style={{ padding: '14px', border: `1px solid ${RULE}`, backgroundColor: ALT, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Top row: type + badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>
                      {typeLabel}
                    </div>
                    <span style={{
                      fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                      padding: '3px 6px', flexShrink: 0,
                      backgroundColor: isActive ? TC_LIGHT : '#EBEBEB',
                      color: isActive ? TC_DARK : MUTED,
                    }}>
                      {c.status}
                    </span>
                  </div>
                  {/* Count */}
                  <div style={{ fontSize: '13px', color: MUTED }}>
                    Attended: <strong style={{ color: INK }}>{c.attended}/{c.total}</strong>
                  </div>
                  {/* Progress track */}
                  <div style={{ height: '2px', backgroundColor: 'rgba(40,40,40,0.1)', position: 'relative', marginTop: '2px' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '2px', width: `${pct}%`, backgroundColor: TC }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <Divider />

        {/* ── 4. UPCOMING CLASSES ── */}
        <section style={{ marginBottom: '28px' }}>
          <SectionLabel action actionLabel="Browse classes">
            Upcoming Classes <span style={{ color: '#CCC', fontWeight: 400, marginLeft: '4px' }}>{CLASSES.length}</span>
          </SectionLabel>
          <div>
            {CLASSES.map((cls, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '12px 0',
                borderBottom: i < CLASSES.length - 1 ? `1px solid ${RULE}` : 'none',
              }}>
                {/* Date block */}
                <div style={{ width: '36px', flexShrink: 0, textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>{cls.date}</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1.1 }}>{cls.day}</div>
                  <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>{cls.month}</div>
                </div>
                {/* Thin rule */}
                <div style={{ width: '1px', height: '42px', backgroundColor: RULE, flexShrink: 0 }} />
                {/* Detail */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px' }}>{cls.course}</div>
                  <div style={{ fontSize: '11px', color: MUTED }}>{cls.time}</div>
                </div>
                {/* Status */}
                <span style={{
                  fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                  padding: '4px 8px', backgroundColor: TC_LIGHT, color: TC_DARK, flexShrink: 0,
                }}>
                  booked
                </span>
              </div>
            ))}
          </div>
          {/* Past classes toggle */}
          <button
            onClick={() => setShowPast(v => !v)}
            style={{ marginTop: '12px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: MUTED }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
              {showPast ? 'expand_less' : 'expand_more'}
            </span>
            Past classes (8)
          </button>
        </section>

        <Divider />

        {/* ── 5. MY GALLERY ── */}
        <section style={{ marginBottom: '28px' }}>
          <SectionLabel action actionLabel="View all">My Gallery</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {MY_PIECES.map(p => (
              <div key={p.id} style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', backgroundColor: '#F0EDE9', cursor: 'pointer' }}>
                <img src={p.img} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'linear-gradient(to top, rgba(20,10,5,0.65) 0%, transparent 100%)',
                  padding: '24px 10px 8px',
                }}>
                  <div style={{ fontSize: '11px', color: '#FFF', fontWeight: 600, letterSpacing: '0.02em' }}>{p.title}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '12px' }}>
            <button style={{
              width: '100%', padding: '15px', border: 'none', cursor: 'pointer',
              backgroundColor: TC, color: '#FFFFFF',
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>add_photo_alternate</span>
              Upload a piece
            </button>
          </div>
        </section>

        <Divider />

        {/* ── 6. COMMUNITY ── */}
        <section style={{ marginBottom: '28px' }}>
          <SectionLabel action actionLabel="Share yours">Community</SectionLabel>
          <p style={{ fontSize: '13px', color: MUTED, margin: '0 0 16px', lineHeight: 1.5 }}>
            Get inspired by what your fellow potters are making.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            {COMMUNITY.map(p => (
              <div key={p.id} style={{ cursor: 'pointer' }}>
                <div style={{ aspectRatio: '1', overflow: 'hidden', backgroundColor: '#F0EDE9', marginBottom: '8px' }}>
                  <img src={p.img} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '1px' }}>{p.title}</div>
                <div style={{ fontSize: '11px', color: MUTED }}>by {p.student}</div>
              </div>
            ))}
          </div>
        </section>

        <Divider />

      </main>

      {/* ── BOTTOM TAB BAR ── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        backgroundColor: '#FFFFFF',
        borderTop: `1px solid ${RULE}`,
        display: 'flex',
        height: '60px',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {[
          { id: 'home',    label: 'Home',    icon: 'home'           },
          { id: 'classes', label: 'Classes', icon: 'calendar_month' },
          { id: 'gallery', label: 'Gallery', icon: 'photo_library'  },
          { id: 'account', label: 'Account', icon: 'person', badge: true },
        ].map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, border: 'none', background: 'transparent', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '2px', padding: '8px 0', position: 'relative',
              }}
            >
              {/* Membership badge on Account */}
              {tab.badge && (
                <span style={{
                  position: 'absolute', top: '7px', right: 'calc(50% - 16px)',
                  width: '6px', height: '6px', borderRadius: '50%',
                  backgroundColor: TC,
                }} />
              )}
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '22px',
                  color: active ? TC : '#BBBBBB',
                  fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400",
                  transition: 'color 0.15s ease',
                }}
              >
                {tab.icon}
              </span>
              <span style={{
                fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: active ? TC : '#BBBBBB',
                transition: 'color 0.15s ease',
              }}>
                {tab.label}
              </span>
              {/* Active indicator */}
              {active && (
                <span style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: '20px', height: '2px', backgroundColor: TC,
                }} />
              )}
            </button>
          );
        })}
      </nav>

    </div>
  );
}
