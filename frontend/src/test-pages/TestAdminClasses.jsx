import { useState, useEffect } from 'react';

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

function useIsMobile(bp = 768) {
  const [m, setM] = useState(typeof window !== 'undefined' ? window.innerWidth < bp : false);
  useEffect(() => {
    const h = () => setM(window.innerWidth < bp);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [bp]);
  return m;
}

function AdminNav({ active }) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: '#FFFFFF', borderBottom: `1px solid ${RULE}` }}>
      <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '24px', overflowX: 'auto' }}>
        <img src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600" alt="VES" style={{ height: '22px', width: 'auto', flexShrink: 0 }} />
        <div style={{ width: '1px', height: '18px', backgroundColor: RULE, flexShrink: 0 }} />
        <nav style={{ display: 'flex', flex: 1 }}>
          {NAV.map(link => (
            <a key={link.id} href={link.href} style={{
              padding: '0 14px', height: '52px', display: 'flex', alignItems: 'center',
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: active === link.id ? TC : MUTED,
              textDecoration: 'none', whiteSpace: 'nowrap',
              borderBottom: `2px solid ${active === link.id ? TC : 'transparent'}`,
            }}>{link.label}</a>
          ))}
        </nav>
        <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '5px 10px', backgroundColor: INK, color: '#FFF', flexShrink: 0 }}>Admin</span>
      </div>
    </header>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const TODAY = new Date(2026, 1, 26);

const WT_COURSES = [
  {
    id: 'WT0802AM_DL6', type: 'WT', timeCode: 'AM', timeLabel: '9:30 AM',
    instructor: 'DL', instructorName: 'Dillon Lin', dayName: 'Sunday',
    startDate: new Date(2026, 1, 8), weeks: 6,
    capacity: 8, enrolled: 8, minPax: 4, status: 'confirmed', color: TC,
    students: [
      { name: 'Sarah Tan',  orders: 12 }, { name: 'Joey Lim',   orders: 8  },
      { name: 'Diana Lim',  orders: 5  }, { name: 'Priya Nair', orders: 3  },
      { name: 'Stella Koh', orders: 7  }, { name: 'Jess Yeo',   orders: 2  },
      { name: 'Ben Tan',    orders: 10 }, { name: 'Alex Chen',  orders: 6  },
    ],
  },
  {
    id: 'WT0802PM_DL6', type: 'WT', timeCode: 'PM', timeLabel: '1:00 PM',
    instructor: 'DL', instructorName: 'Dillon Lin', dayName: 'Sunday',
    startDate: new Date(2026, 1, 8), weeks: 6,
    capacity: 8, enrolled: 6, minPax: 4, status: 'confirmed', color: TC_DARK,
    students: [
      { name: 'Kenny Toh',   orders: 4 }, { name: 'Mei Lin',     orders: 9 },
      { name: 'Rachel Goh',  orders: 6 }, { name: 'Ryan Ong',    orders: 1 },
      { name: 'Sam Ng',      orders: 8 }, { name: 'Marcus Wong', orders: 3 },
    ],
  },
  {
    id: 'WT0602NT_JL6', type: 'WT', timeCode: 'NT', timeLabel: '7:00 PM',
    instructor: 'JL', instructorName: 'Joyce Lim', dayName: 'Friday',
    startDate: new Date(2026, 1, 6), weeks: 6,
    capacity: 8, enrolled: 7, minPax: 4, status: 'confirmed', color: '#3A4A5C',
    students: [
      { name: 'Sarah Tan',  orders: 12 }, { name: 'Joey Lim',   orders: 8 },
      { name: 'Stella Koh', orders: 7  }, { name: 'Rachel Goh', orders: 6 },
      { name: 'Jess Yeo',   orders: 2  }, { name: 'Ryan Ong',   orders: 1 },
      { name: 'Chloe Lim',  orders: 4  },
    ],
  },
  {
    id: 'WT1303AM_JL6', type: 'WT', timeCode: 'AM', timeLabel: '9:30 AM',
    instructor: 'JL', instructorName: 'Joyce Lim', dayName: 'Friday',
    startDate: new Date(2026, 2, 13), weeks: 6,
    capacity: 8, enrolled: 2, minPax: 4, status: 'pending', color: '#9E6200',
    students: [
      { name: 'Chloe Lim', orders: 4 }, { name: 'Ben Tan', orders: 10 },
    ],
  },
];

const HB_SERIES = [
  {
    id: 'HBMONNT_LT', dayOfWeek: 1, dayName: 'Monday',    timeLabel: '7:00 PM', shortLabel: 'MON NT', capacity: 10,
    students: [
      { name: 'Rachel Goh',  orders: 6,  pkg: 8, used: 4 },
      { name: 'Kenny Toh',   orders: 4,  pkg: 4, used: 1 },
      { name: 'Mei Lin',     orders: 9,  pkg: 8, used: 7 },
      { name: 'Diana Lim',   orders: 5,  pkg: 8, used: 3 },
      { name: 'Priya Nair',  orders: 3,  pkg: 4, used: 2 },
      { name: 'Alex Chen',   orders: 6,  pkg: 4, used: 4 },
      { name: 'Chloe Lim',   orders: 4,  pkg: 8, used: 1 },
    ],
  },
  {
    id: 'HBWEDNT_LT', dayOfWeek: 3, dayName: 'Wednesday', timeLabel: '7:00 PM', shortLabel: 'WED NT', capacity: 10,
    students: [
      { name: 'Sarah Tan',   orders: 12, pkg: 8, used: 6 },
      { name: 'Marcus Wong', orders: 3,  pkg: 4, used: 2 },
      { name: 'Stella Koh',  orders: 7,  pkg: 8, used: 5 },
      { name: 'Ryan Ong',    orders: 1,  pkg: 4, used: 1 },
      { name: 'Sam Ng',      orders: 8,  pkg: 8, used: 8 },
      { name: 'Jess Yeo',    orders: 2,  pkg: 4, used: 3 },
      { name: 'Ben Tan',     orders: 10, pkg: 8, used: 4 },
      { name: 'Joey Lim',    orders: 8,  pkg: 8, used: 2 },
      { name: 'Kenny Toh',   orders: 4,  pkg: 4, used: 4 },
      { name: 'Rachel Goh',  orders: 6,  pkg: 8, used: 7 },
    ],
  },
  {
    id: 'HBSATEV_LT', dayOfWeek: 6, dayName: 'Saturday',  timeLabel: '4:00 PM', shortLabel: 'SAT EV', capacity: 10,
    students: [
      { name: 'Joey Lim',   orders: 8,  pkg: 4, used: 2 },
      { name: 'Diana Lim',  orders: 5,  pkg: 8, used: 5 },
      { name: 'Ryan Ong',   orders: 1,  pkg: 4, used: 4 },
      { name: 'Ben Tan',    orders: 10, pkg: 8, used: 3 },
      { name: 'Priya Nair', orders: 3,  pkg: 4, used: 1 },
    ],
  },
];

const CAL_MONTHS = [
  { year: 2026, month: 1, label: 'February 2026' },
  { year: 2026, month: 2, label: 'March 2026'    },
  { year: 2026, month: 3, label: 'April 2026'    },
];

const WEEKDAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function addDays(date, days) {
  const d = new Date(date); d.setDate(d.getDate() + days); return d;
}
function fmtDDMM(d) {
  return String(d.getDate()).padStart(2,'0') + String(d.getMonth()+1).padStart(2,'0');
}
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function fmtDate(d) { return `${DN[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()]}`; }

function getCourseDates(course, pw = 0) {
  const start = addDays(course.startDate, pw * 7);
  return Array.from({ length: course.weeks }, (_, i) => ({
    date: addDays(start, i * 7), weekNum: i + 1,
  }));
}
function getCurrentWeek(course, pw = 0) {
  const start = addDays(course.startDate, pw * 7);
  const diff  = Math.floor((TODAY - start) / (7 * 864e5));
  return Math.max(0, Math.min(diff + 1, course.weeks));
}
function buildCalendar(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const pad = (firstDay.getDay() + 6) % 7;
  const days = Array(pad).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}
function getEventsForDay(date, courses, pw) {
  const evs = [];
  courses.forEach(c => {
    const p = c.status === 'pending' ? pw : 0;
    const m = getCourseDates(c, p).find(cd => sameDay(cd.date, date));
    if (m) evs.push({ kind: 'WT', course: c, weekNum: m.weekNum });
  });
  HB_SERIES.forEach(hb => {
    if (hb.dayOfWeek === date.getDay()) evs.push({ kind: 'HB', hb });
  });
  return evs;
}
function skillLevel(orders) {
  if (orders >= 13) return { label: 'Expert',       color: '#1E6B1E' };
  if (orders >= 7)  return { label: 'Intermediate', color: TC_DARK   };
  if (orders >= 3)  return { label: 'Developing',   color: '#9E6200' };
  return                   { label: 'Beginner',     color: MUTED     };
}
function shortName(name, max = 10) {
  if (name.length <= max) return name;
  const parts = name.trim().split(' ');
  if (parts.length < 2) return name;
  return parts[0] + ' ' + parts.slice(1).map(p => p[0] + '.').join(' ');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TestAdminClasses() {
  const isMobile = useIsMobile();
  const [expandedCourse,  setExpandedCourse] = useState(null);
  const [expandedHBCard,  setExpandedHBCard] = useState(null);
  const [selectedDate,    setSelectedDate]   = useState(null);
  const [postponeWeeks,   setPostponeWeeks]  = useState(0);
  const [showCreateModal, setShowCreate]     = useState(false);
  const [showAddClass,    setShowAddClass]   = useState(false);
  const [calPage,         setCalPage]        = useState(0);

  const pendingCourse = WT_COURSES.find(c => c.status === 'pending');
  const pendingStart  = addDays(pendingCourse.startDate, postponeWeeks * 7);
  const pendingId     = `WT${fmtDDMM(pendingStart)}AM_JL6`;
  const dayEvents     = selectedDate ? getEventsForDay(selectedDate, WT_COURSES, postponeWeeks) : [];

  // ── Course pipeline card (single layout, 4-col desktop / 2-col mobile) ──────
  function renderCourseRow(course, i = 0) {
    const pw          = course.status === 'pending' ? postponeWeeks : 0;
    const isPending   = course.status === 'pending';
    const isExpanded  = expandedCourse === course.id;
    const currentWeek = getCurrentWeek(course, pw);
    const classDates  = getCourseDates(course, pw);
    const nextClass   = classDates.find(cd => cd.date > TODAY);
    const displayId   = isPending ? pendingId : course.id;
    const borderColor = isPending ? '#E6A817' : course.color;
    const bgColor     = isPending ? '#FFFCF4' : '#FFFFFF';
    const hoverBg     = isPending ? '#FFF3DC' : TC_LIGHT;
    const cols        = isMobile ? 2 : 4;
    const rightBorder = (i + 1) % cols !== 0 ? `1px solid ${RULE}` : 'none';

    return (
      <div key={course.id} style={{ borderBottom: `1px solid ${RULE}`, borderRight: rightBorder }}>
        {/* Card header — clickable */}
        <div
          onClick={() => setExpandedCourse(isExpanded ? null : course.id)}
          style={{ borderLeft: `3px solid ${borderColor}`, backgroundColor: isExpanded ? hoverBg : bgColor, padding: '12px 12px 12px 11px', cursor: 'pointer', transition: 'background-color 0.1s' }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = hoverBg; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = isExpanded ? hoverBg : bgColor; }}
        >
          {/* Row 1: ID + status */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '4px', marginBottom: '5px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, letterSpacing: '0.03em', lineHeight: 1.3 }}>{displayId}</span>
            {isPending
              ? <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 5px', backgroundColor: '#FFF7E6', color: '#9E6200', flexShrink: 0 }}>Pending</span>
              : <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 5px', backgroundColor: TC_LIGHT, color: TC_DARK, flexShrink: 0 }}>On</span>
            }
          </div>
          {/* Row 2: Day · Time */}
          <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '1px' }}>{course.dayName} · {course.timeLabel}</div>
          {/* Row 3: Instructor */}
          <div style={{ fontSize: '10px', color: MUTED, marginBottom: '10px' }}>{course.instructorName} ({course.instructor})</div>
          {/* Row 4: Capacity */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '4px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>{course.enrolled}</span>
            <span style={{ fontSize: '10px', color: MUTED }}>/ {course.capacity}</span>
            {isPending && <span style={{ fontSize: '9px', color: '#9E6200', fontWeight: 700 }}>min {course.minPax}</span>}
          </div>
          <div style={{ height: '4px', backgroundColor: ALT, position: 'relative', marginBottom: '8px' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(course.enrolled / course.capacity) * 100}%`, backgroundColor: isPending ? (course.enrolled >= course.minPax ? TC : '#E6A817') : course.color }} />
            {isPending && <div style={{ position: 'absolute', left: `${(course.minPax / course.capacity) * 100}%`, top: '-3px', height: '10px', width: '1px', backgroundColor: '#9E6200' }} />}
          </div>
          {/* Row 5: Progress / proposed */}
          {isPending ? (
            <div style={{ fontSize: '10px', color: '#9E6200' }}>Proposed: {fmtDate(pendingStart)}</div>
          ) : (
            <div style={{ fontSize: '10px', color: MUTED }}>
              Wk {currentWeek}/{course.weeks}{nextClass ? ` · Next: ${fmtDate(nextClass.date)}` : ''}
            </div>
          )}
        </div>

        {/* Expanded panel */}
        {isExpanded && (
          <div style={{ padding: '10px 12px 12px', backgroundColor: TC_LIGHT, borderTop: `1px solid rgba(196,98,45,0.15)` }}>
            <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TC_DARK, marginBottom: '8px' }}>
              Enrolled — {course.students.length}/{course.capacity}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', marginBottom: isPending ? '10px' : '0' }}>
              {course.students.map((s, j) => (
                <a key={j} href="/test/admin/students/detail" style={{
                  fontSize: '10px', fontWeight: 600, padding: '5px 8px',
                  backgroundColor: '#FFFFFF', border: `1px solid rgba(196,98,45,0.2)`,
                  color: INK, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3px',
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortName(s.name)}</span>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: TC, flexShrink: 0 }}>{s.orders}</span>
                </a>
              ))}
              {Array.from({ length: course.capacity - course.enrolled }).map((_, j) => (
                <span key={`open-${j}`} style={{ fontSize: '10px', padding: '5px 8px', border: `1px dashed ${RULE}`, color: MUTED }}>open</span>
              ))}
            </div>
            {isPending && (
              <button onClick={e => e.stopPropagation()} style={{ width: '100%', padding: '9px', border: 'none', backgroundColor: TC, color: '#FFF', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Confirm Course
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── HB drop-in card (3-col grid, same style as WT cards) ──────────────────
  function renderHBCard(hb, i) {
    const count      = hb.students.length;
    const atCap      = count >= hb.capacity;
    const nearCap    = count >= hb.capacity - 2 && !atCap;
    const fillColor  = atCap ? '#D93025' : nearCap ? '#E6A817' : '#888';
    const borderColor = atCap ? '#D93025' : '#888';
    const bgColor    = '#FFFFFF';
    const hoverBg    = ALT;
    const isExpanded = expandedHBCard === hb.id;
    const rightBorder = !isMobile && (i + 1) % 3 !== 0 ? `1px solid ${RULE}` : 'none';

    return (
      <div key={hb.id} style={{ borderBottom: `1px solid ${RULE}`, borderRight: rightBorder }}>
        <div
          onClick={() => setExpandedHBCard(isExpanded ? null : hb.id)}
          style={{ borderLeft: `3px solid ${borderColor}`, backgroundColor: isExpanded ? hoverBg : bgColor, padding: '12px 12px 12px 11px', cursor: 'pointer', transition: 'background-color 0.1s' }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = hoverBg; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = isExpanded ? hoverBg : bgColor; }}
        >
          {/* Row 1: ID + ongoing chip */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '4px', marginBottom: '5px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, letterSpacing: '0.03em', lineHeight: 1.3 }}>{hb.id}</span>
            <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 5px', backgroundColor: ALT, color: MUTED, flexShrink: 0 }}>Drop-in</span>
          </div>
          {/* Row 2: Day · Time */}
          <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '1px' }}>{hb.dayName} · {hb.timeLabel}</div>
          {/* Row 3: Instructor */}
          <div style={{ fontSize: '10px', color: MUTED, marginBottom: '10px' }}>Lynette Ting (LT)</div>
          {/* Row 4: Capacity */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '4px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: atCap ? '#D93025' : INK }}>{count}</span>
            <span style={{ fontSize: '10px', color: MUTED }}>/ {hb.capacity}</span>
            {atCap   && <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 5px', backgroundColor: '#FDECEA', color: '#D93025' }}>Full</span>}
            {nearCap && <span style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 5px', backgroundColor: '#FFF7E6', color: '#9E6200' }}>Near cap</span>}
          </div>
          <div style={{ height: '4px', backgroundColor: ALT, position: 'relative', marginBottom: '8px' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(count / hb.capacity) * 100}%`, backgroundColor: fillColor }} />
          </div>
          {/* Row 5: credit-based label */}
          <div style={{ fontSize: '10px', color: MUTED }}>credit-based · ongoing</div>
        </div>

        {/* Expanded panel */}
        {isExpanded && (
          <div style={{ padding: '10px 12px 12px', backgroundColor: ALT, borderTop: `1px solid rgba(0,0,0,0.06)` }}>
            <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '8px' }}>
              Enrolled — {count}/{hb.capacity}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
              {hb.students.map((s, j) => {
                const exhausted = s.used >= s.pkg;
                return (
                  <a key={j} href="/test/admin/students/detail" style={{ fontSize: '10px', fontWeight: 600, padding: '5px 8px', backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, color: INK, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3px' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortName(s.name)}</span>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: exhausted ? '#D93025' : MUTED, flexShrink: 0 }}>{s.used}/{s.pkg}</span>
                  </a>
                );
              })}
              {Array.from({ length: hb.capacity - count }).map((_, j) => (
                <span key={`open-${j}`} style={{ fontSize: '10px', padding: '5px 8px', border: `1px dashed ${RULE}`, color: '#CCC' }}>open</span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Calendar cell (shared, dot vs chip based on isMobile) ──────────────────
  function renderCalCell(day, idx) {
    if (!day) {
      return (
        <div key={`pad-${idx}`} style={{
          minHeight: isMobile ? '50px' : '76px',
          borderRight: idx % 7 < 6 ? `1px solid ${RULE}` : 'none',
          borderBottom: `1px solid ${RULE}`, backgroundColor: '#F9F9F8',
        }} />
      );
    }
    const isToday    = sameDay(day, TODAY);
    const isSelected = selectedDate && sameDay(day, selectedDate);
    const events     = getEventsForDay(day, WT_COURSES, postponeWeeks);
    const hasEvents  = events.length > 0;

    return (
      <div
        key={day.toISOString()}
        onClick={() => setSelectedDate(isSelected ? null : day)}
        style={{
          minHeight: isMobile ? '50px' : '76px',
          borderRight: idx % 7 < 6 ? `1px solid ${RULE}` : 'none',
          borderBottom: `1px solid ${RULE}`,
          padding: isMobile ? '4px 3px' : '5px 4px',
          cursor: hasEvents ? 'pointer' : 'default',
          backgroundColor: isSelected ? TC_LIGHT : isToday ? '#FFFDF4' : '#FFFFFF',
          transition: 'background-color 0.1s',
        }}
        onMouseEnter={e => { if (hasEvents && !isSelected) e.currentTarget.style.backgroundColor = ALT; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = isToday ? '#FFFDF4' : '#FFFFFF'; }}
      >
        <div style={{ marginBottom: '3px' }}>
          {isToday ? (
            <span style={{ width: '18px', height: '18px', backgroundColor: TC, color: '#FFF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700 }}>
              {day.getDate()}
            </span>
          ) : (
            <span style={{ fontSize: '11px', color: hasEvents ? INK : '#CCC', fontWeight: hasEvents ? 600 : 400 }}>
              {day.getDate()}
            </span>
          )}
        </div>

        {isMobile ? (
          // Colored dot squares
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
            {events.map((ev, j) => {
              const col = ev.kind === 'WT'
                ? (ev.course.status === 'pending' ? '#E6A817' : ev.course.color)
                : '#B8B3AB';
              return (
                <span key={j} style={{
                  width: '7px', height: '7px', display: 'inline-block', backgroundColor: col,
                  border: ev.kind === 'WT' && ev.course.status === 'pending' ? '1px dashed #E6A817' : 'none',
                }} />
              );
            })}
          </div>
        ) : (
          // Text chips
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {events.map((ev, j) => {
              if (ev.kind === 'WT') {
                const p = ev.course.status === 'pending';
                return (
                  <div key={j} style={{
                    fontSize: '8px', fontWeight: 700, letterSpacing: '0.02em',
                    padding: '1px 3px', lineHeight: 1.5,
                    backgroundColor: p ? '#FFF7E6' : ev.course.color,
                    color: p ? '#9E6200' : '#FFF',
                    border: p ? '1px dashed #E6A817' : 'none',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {ev.course.instructor}·{ev.course.timeCode} {ev.weekNum}/{ev.course.weeks}
                  </div>
                );
              }
              return (
                <div key={j} style={{ fontSize: '8px', fontWeight: 600, padding: '1px 3px', lineHeight: 1.5, backgroundColor: '#E2DFD9', color: '#555', whiteSpace: 'nowrap' }}>
                  {ev.hb.shortLabel}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Day detail student table ───────────────────────────────────────────────
  function renderStudentTable(course, isPending) {
    return (
      <div style={{ border: `1px solid ${RULE}`, marginTop: '4px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px', backgroundColor: ALT, padding: '6px 12px' }}>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>Student</span>
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, textAlign: 'right' }}>Orders</span>
        </div>
        {course.students.map((s, j) => (
          <a key={j} href="/test/admin/students/detail" style={{
            display: 'grid', gridTemplateColumns: '1fr 52px',
            padding: '9px 12px', textDecoration: 'none', color: INK,
            borderTop: `1px solid ${RULE}`, backgroundColor: '#FFFFFF',
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = TC_LIGHT}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FFFFFF'}
          >
            <span style={{ fontSize: '12px', fontWeight: 600 }}>{s.name}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, textAlign: 'right' }}>{s.orders}</span>
          </a>
        ))}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <AdminNav active="classes" />

      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: isMobile ? '20px 16px 60px' : '32px 24px 60px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>Admin</div>
            <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>Class Schedule</h1>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowAddClass(true)} style={{ padding: isMobile ? '9px 14px' : '10px 18px', backgroundColor: 'transparent', color: TC, border: `1px solid ${TC}`, fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
              + Add Class
            </button>
            <button onClick={() => setShowCreate(true)} style={{ padding: isMobile ? '9px 14px' : '10px 18px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
              + New Course
            </button>
          </div>
        </div>

        {/* ── COURSE PIPELINE ─────────────────────────────────────────── */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>Wheelthrowing</div>
          <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)' }}>
            {WT_COURSES.map((course, i) => renderCourseRow(course, i))}
          </div>

          {/* HB — 3-col grid */}
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, margin: '16px 0 12px' }}>Handbuilding</div>
          <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {HB_SERIES.map((hb, i) => renderHBCard(hb, i))}
          </div>
        </div>

        {/* ── CALENDAR ────────────────────────────────────────────────── */}
        <div style={{ marginBottom: selectedDate ? '20px' : '0' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>
            Calendar — Feb – Apr 2026
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: '8px', color: MUTED }}>
              {isMobile ? 'Tap' : 'Click'} any day to see classes
            </span>
          </div>

          {isMobile ? (
            /* ── Mobile: single month + prev/next ── */
            <div>
              <div style={{ backgroundColor: '#FFFFFF', border: `1px solid ${RULE}` }}>
                {/* Month nav */}
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <button
                    onClick={() => { setCalPage(p => Math.max(0, p-1)); setSelectedDate(null); }}
                    disabled={calPage === 0}
                    style={{ padding: '5px 12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '14px', fontWeight: 700, cursor: calPage === 0 ? 'default' : 'pointer', color: calPage === 0 ? '#CCC' : INK }}
                  >←</button>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>{CAL_MONTHS[calPage].label}</span>
                  <button
                    onClick={() => { setCalPage(p => Math.min(CAL_MONTHS.length-1, p+1)); setSelectedDate(null); }}
                    disabled={calPage === CAL_MONTHS.length - 1}
                    style={{ padding: '5px 12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '14px', fontWeight: 700, cursor: calPage === CAL_MONTHS.length-1 ? 'default' : 'pointer', color: calPage === CAL_MONTHS.length-1 ? '#CCC' : INK }}
                  >→</button>
                </div>
                {/* Weekday headers — single letter on mobile */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${RULE}` }}>
                  {WEEKDAY_LABELS.map(d => (
                    <div key={d} style={{ textAlign: 'center', padding: '5px 0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>
                      {d.charAt(0)}
                    </div>
                  ))}
                </div>
                {/* Days */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {buildCalendar(CAL_MONTHS[calPage].year, CAL_MONTHS[calPage].month).map((day, idx) => renderCalCell(day, idx))}
                </div>
              </div>
              {/* Page dots */}
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '10px' }}>
                {CAL_MONTHS.map((_, i) => (
                  <button key={i} onClick={() => { setCalPage(i); setSelectedDate(null); }} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: calPage === i ? TC : '#CCC', border: 'none', cursor: 'pointer', padding: 0 }} />
                ))}
              </div>
            </div>
          ) : (
            /* ── Desktop: 3-month grid ── */
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              {CAL_MONTHS.map(({ year, month, label }) => {
                const calDays = buildCalendar(year, month);
                return (
                  <div key={month} style={{ backgroundColor: '#FFFFFF', border: `1px solid ${RULE}` }}>
                    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, fontSize: '13px', fontWeight: 700 }}>{label}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${RULE}` }}>
                      {WEEKDAY_LABELS.map(d => (
                        <div key={d} style={{ textAlign: 'center', padding: '5px 0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{d}</div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                      {calDays.map((day, idx) => renderCalCell(day, idx))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '10px', alignItems: 'center' }}>
            {WT_COURSES.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '10px', height: '10px', flexShrink: 0, display: 'inline-block', backgroundColor: c.status === 'pending' ? '#FFF7E6' : c.color, border: c.status === 'pending' ? '1px dashed #E6A817' : 'none' }} />
                <span style={{ fontFamily: 'monospace', fontSize: '10px', color: MUTED }}>{c.status === 'pending' ? pendingId : c.id}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '10px', height: '10px', backgroundColor: '#E2DFD9', display: 'inline-block' }} />
              <span style={{ fontSize: '10px', color: MUTED }}>HB drop-in (LT)</span>
            </div>
          </div>
        </div>

        {/* ── DAY DETAIL ──────────────────────────────────────────────── */}
        {selectedDate && (
          <div style={{ marginTop: '24px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span>{fmtDate(selectedDate)}</span>
              <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: MUTED }}>— {dayEvents.length} class{dayEvents.length !== 1 ? 'es' : ''}</span>
              <button onClick={() => setSelectedDate(null)} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', fontSize: '10px', color: MUTED, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Close ✕</button>
            </div>

            {dayEvents.length === 0 ? (
              <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', padding: '24px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No classes scheduled.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile
                ? `repeat(${Math.min(dayEvents.length, 2)}, 1fr)`
                : `repeat(${dayEvents.length === 4 ? 2 : Math.min(dayEvents.length, 3)}, 1fr)`, gap: '12px' }}>
                {dayEvents.map((ev, i) => {
                  if (ev.kind === 'WT') {
                    const isPending = ev.course.status === 'pending';
                    return (
                      <div key={i} style={{ border: `1px solid ${RULE}`, borderLeft: `3px solid ${isPending ? '#E6A817' : ev.course.color}`, backgroundColor: isPending ? '#FFFCF4' : '#FFFFFF' }}>
                        <div style={{ padding: '14px 14px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, marginBottom: '3px' }}>{isPending ? pendingId : ev.course.id}</div>
                            <div style={{ fontSize: '11px', color: MUTED }}>{ev.course.timeLabel} · {ev.course.instructorName} · Wk {ev.weekNum}/{ev.course.weeks}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '3px' }}>{ev.course.enrolled}/{ev.course.capacity}</div>
                            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 8px', backgroundColor: isPending ? '#FFF7E6' : TC_LIGHT, color: isPending ? '#9E6200' : TC_DARK }}>
                              {isPending ? 'Pending' : 'Confirmed'}
                            </span>
                          </div>
                        </div>
                        {renderStudentTable(ev.course, isPending)}
                      </div>
                    );
                  }
                  return (
                    <div key={i} style={{ border: `1px solid ${RULE}`, borderLeft: '3px solid #888', backgroundColor: '#FFFFFF' }}>
                      <div style={{ padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, marginBottom: '3px' }}>{ev.hb.id}</div>
                          <div style={{ fontSize: '11px', color: MUTED }}>{ev.hb.timeLabel} · Lynette Ting · Drop-in</div>
                        </div>
                        <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 8px', backgroundColor: ALT, color: MUTED }}>HB</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </main>

      {/* ── ADD SINGLE CLASS MODAL ─────────────────────────────────────── */}
      {showAddClass && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#FFFFFF', padding: isMobile ? '24px 20px' : '32px', width: '480px', maxWidth: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>Add Single Class</div>
              <button onClick={() => setShowAddClass(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: MUTED, lineHeight: 1, padding: '0 0 0 16px' }}>✕</button>
            </div>
            <div style={{ fontSize: '12px', color: MUTED, marginBottom: '22px' }}>One-off session — holiday replacement or instructor unavailability</div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Date</label>
                <input type="date" defaultValue="2026-03-14" style={{ width: '100%', padding: '9px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Time Slot</label>
                <select style={{ width: '100%', padding: '9px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box' }}>
                  <option>AM — 9:30am</option>
                  <option>PM — 1:00pm</option>
                  <option selected>NT — 7:00pm</option>
                  <option>EV — 4:00pm</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Class Type</label>
                <select style={{ width: '100%', padding: '9px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box' }}>
                  <option>WT — Wheel Throwing</option>
                  <option>HB — Handbuilding</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Instructor</label>
                <select style={{ width: '100%', padding: '9px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box' }}>
                  <option>JL — Joyce Lim</option>
                  <option>DL — Dillon Lin</option>
                  <option>LT — Lynette Ting</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Link to Course</label>
              <select style={{ width: '100%', padding: '9px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box' }}>
                <option value="">— Standalone (not linked) —</option>
                <option>WT0802AM_DL6 · Sun 9:30am · Dillon Lin</option>
                <option>WT0802PM_DL6 · Sun 1:00pm · Dillon Lin</option>
                <option selected>WT0602NT_JL6 · Fri 7:00pm · Joyce Lim</option>
                <option>WT1303AM_JL6 · Fri 9:30am · Joyce Lim (Pending)</option>
                <option>HBMON_LT · Mon · Lynette Ting</option>
                <option>HBWED_LT · Wed · Lynette Ting</option>
                <option>HBSAT_LT · Sat · Lynette Ting</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>Reason</label>
              <select style={{ width: '100%', padding: '9px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box' }}>
                <option>Holiday replacement</option>
                <option>Instructor unavailable</option>
                <option>Extra / makeup session</option>
                <option>Other</option>
              </select>
            </div>

            <div style={{ padding: '10px 14px', backgroundColor: '#FFF7E6', border: '1px solid #E6A817', marginBottom: '18px', fontSize: '12px', color: '#7A4E00' }}>
              <span style={{ fontWeight: 700 }}>Note:</span> This adds a single class only — students enrolled in the linked course will not be auto-booked. Notify them separately.
            </div>

            <div style={{ display: 'flex', gap: '8px', flexDirection: isMobile ? 'column' : 'row' }}>
              <button onClick={() => setShowAddClass(false)} style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
              <button style={{ flex: 1, padding: '12px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Add Class</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE COURSE MODAL ────────────────────────────────────────── */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#FFFFFF', padding: isMobile ? '24px 20px' : '32px', width: '500px', maxWidth: '100%' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>Create New Course</div>
            <div style={{ fontSize: '12px', color: MUTED, marginBottom: '22px' }}>Min 4 students required to confirm schedule</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
              {[
                { label: 'Course Type',        type: 'sel-type'  },
                { label: 'Instructor',          type: 'sel-instr' },
                { label: 'Proposed Start Date', type: 'date',  val: '2026-03-13' },
                { label: 'Time Slot',           type: 'sel-time'  },
                { label: 'Duration (weeks)',    type: 'number', val: 6 },
                { label: 'Max Capacity',        type: 'number', val: 8 },
              ].map((f, i) => (
                <div key={i}>
                  <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' }}>{f.label}</label>
                  {f.type === 'sel-type'
                    ? <select style={{ width: '100%', padding: '9px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box' }}>
                        <option>WT Beginner / Extension 6wk</option><option>WT Intermediate 7wk</option>
                        <option>WT+HB Combined 10 classes</option><option>HB 4wk</option><option>HB 8wk</option>
                      </select>
                    : f.type === 'sel-instr'
                      ? <select style={{ width: '100%', padding: '9px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box' }}>
                          <option>JL — Joyce Lim (Tue / Thu / Fri)</option>
                          <option>DL — Dillon Lin (Sat / Sun)</option>
                          <option>LT — Lynette Ting (Mon / Wed / Sat HB)</option>
                        </select>
                      : f.type === 'sel-time'
                        ? <select style={{ width: '100%', padding: '9px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box' }}>
                            <option>AM — 9:30am</option><option>PM — 1:00pm</option>
                            <option>NT — 7:00pm</option><option>EV — 4:00pm (HB Sat)</option>
                          </select>
                        : <input type={f.type} defaultValue={f.val} style={{ width: '100%', padding: '9px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'Atak, sans-serif', boxSizing: 'border-box' }} />
                  }
                </div>
              ))}
            </div>
            <div style={{ padding: '10px 14px', backgroundColor: ALT, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>Course ID:</span>
              <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700 }}>WT1303AM_JL6</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexDirection: isMobile ? 'column' : 'row' }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
              <button style={{ flex: 1, padding: '12px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Create Course</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
