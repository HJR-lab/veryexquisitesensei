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

const STUDENTS = [
  { id: 1,  name: 'Sarah Tan',   email: 'sarah.tan@email.com',   member: '6m',  joined: 'Sep 2025',
    orderNames: ['FRIDAYS • 6 Feb–13 Mar • 7–9:30pm'],
    purchaseCount: 5, courseIds: ['WT0602NT_JL6', 'HBWEDNT_LT'],
    wt: { att: 4, total: 6 }, hb: { att: 1, total: 6 } },
  { id: 2,  name: 'Joey Lim',    email: 'joey.lim@email.com',    member: null,  joined: 'Oct 2025',
    orderNames: ['SUNDAYS • 8 Feb–15 Mar • 9:30am–12pm', 'FRIDAYS • 6 Feb–13 Mar • 7–9:30pm'],
    purchaseCount: 3, courseIds: ['WT0802AM_DL6', 'WT0602NT_JL6'],
    wt: { att: 2, total: 6 }, hb: null },
  { id: 3,  name: 'Diana Lim',   email: 'diana.lim@email.com',   member: '6m',  joined: 'Aug 2025',
    orderNames: ['SUNDAYS • 8 Feb–15 Mar • 1–3:30pm'],
    purchaseCount: 6, courseIds: ['WT0802PM_DL6'],
    wt: { att: 0, total: 6 }, hb: null },
  { id: 4,  name: 'Kenny Toh',   email: 'kenny.toh@email.com',   member: '12m', joined: 'Mar 2025',
    orderNames: ['HB4'],
    purchaseCount: 8, courseIds: ['HBMONNT_LT'],
    wt: null, hb: { att: 3, total: 4 } },
  { id: 5,  name: 'Priya Nair',  email: 'priya.nair@email.com',  member: '1m',  joined: 'Feb 2026',
    orderNames: ['SUNDAYS • 8 Feb–15 Mar • 9:30am–12pm'],
    purchaseCount: 2, courseIds: ['WT0802AM_DL6'],
    wt: { att: 1, total: 6 }, hb: null },
  { id: 6,  name: 'Marcus Wong', email: 'marcus.wong@email.com', member: null,  joined: 'Nov 2025',
    orderNames: ['FRIDAYS • 6 Feb–13 Mar • 7–9:30pm'],
    purchaseCount: 2, courseIds: [],
    wt: { att: 3, total: 6 }, hb: null },
  { id: 7,  name: 'Mei Lin',     email: 'mei.lin@email.com',     member: null,  joined: 'Dec 2025',
    orderNames: ['HB8'],
    purchaseCount: 2, courseIds: ['HBMONNT_LT'],
    wt: null, hb: { att: 5, total: 8 } },
  { id: 8,  name: 'Alex Chen',   email: 'alex.chen@email.com',   member: null,  joined: 'Jun 2025',
    orderNames: ['FRIDAYS • 13 Mar–17 Apr • 9:30am–12pm'],
    purchaseCount: 4, courseIds: ['WT1303AM_JL6'],
    wt: { att: 6, total: 6 }, hb: null },
  { id: 9,  name: 'Stella Koh',  email: 'stella.koh@email.com',  member: null,  joined: 'Jan 2026',
    orderNames: ['FRIDAYS • 6 Feb–13 Mar • 7–9:30pm', 'HB8'],
    purchaseCount: 3, courseIds: ['WT0602NT_JL6', 'HBWEDNT_LT'],
    wt: { att: 3, total: 6 }, hb: { att: 2, total: 8 } },
  { id: 10, name: 'Rachel Goh',  email: 'rachel.goh@email.com',  member: null,  joined: 'Jan 2026',
    orderNames: ['HB8'],
    purchaseCount: 2, courseIds: ['HBMONNT_LT'],
    wt: null, hb: { att: 4, total: 8 } },
  { id: 11, name: 'Sam Ng',      email: 'sam.ng@email.com',      member: null,  joined: 'Oct 2025',
    orderNames: ['HB8'],
    purchaseCount: 2, courseIds: [],
    wt: null, hb: { att: 2, total: 8 } },
  { id: 12, name: 'Jess Yeo',    email: 'jess.yeo@email.com',    member: null,  joined: 'Feb 2026',
    orderNames: ['FRIDAYS • 6 Feb–13 Mar • 7–9:30pm'],
    purchaseCount: 1, courseIds: ['WT0602NT_JL6'],
    wt: { att: 3, total: 6 }, hb: null },
  { id: 13, name: 'Ryan Ong',    email: 'ryan.ong@email.com',    member: null,  joined: 'Feb 2026',
    orderNames: ['HB4'],
    purchaseCount: 1, courseIds: ['HBWEDNT_LT'],
    wt: null, hb: { att: 1, total: 4 } },
  { id: 14, name: 'Chloe Lim',   email: 'chloe.lim@email.com',  member: null,  joined: 'Feb 2026',
    orderNames: ['FRIDAYS • 13 Mar–17 Apr • 9:30am–12pm'],
    purchaseCount: 1, courseIds: ['WT1303AM_JL6'],
    wt: { att: 0, total: 6 }, hb: null },
  { id: 15, name: 'Ben Tan',     email: 'ben.tan@email.com',     member: null,  joined: 'Jul 2025',
    orderNames: ['HB8'],
    purchaseCount: 5, courseIds: ['HBWEDNT_LT'],
    wt: { att: 6, total: 6 }, hb: { att: 4, total: 8 } },
];

const MEMBER_LABEL = { '1m': '1 mo', '6m': '6 mo', '12m': '12 mo' };

const TODAY = new Date(2026, 1, 26);

// Course date lookup — used for filter + sort
const COURSE_INFO = {
  'WT0602NT_JL6': { start: new Date(2026, 1, 6),  weeks: 6, type: 'WT' },
  'WT0802AM_DL6': { start: new Date(2026, 1, 8),  weeks: 6, type: 'WT' },
  'WT0802PM_DL6': { start: new Date(2026, 1, 8),  weeks: 6, type: 'WT' },
  'WT1303AM_JL6': { start: new Date(2026, 2, 13), weeks: 6, type: 'WT' },
  'HBMONNT_LT':   { start: null, type: 'HB' },
  'HBWEDNT_LT':   { start: null, type: 'HB' },
  'HBSATEV_LT':   { start: null, type: 'HB' },
};

function courseEnd(info) {
  if (!info.start) return null;
  const d = new Date(info.start);
  d.setDate(d.getDate() + info.weeks * 7);
  return d;
}

function hasWTCurrent(s) {
  return s.courseIds.some(id => {
    const c = COURSE_INFO[id];
    return c?.type === 'WT' && c.start <= TODAY && courseEnd(c) >= TODAY;
  });
}
function hasWTUpcoming(s) {
  return s.courseIds.some(id => {
    const c = COURSE_INFO[id];
    return c?.type === 'WT' && c.start > TODAY;
  });
}
function hasHB(s) {
  return s.courseIds.some(id => COURSE_INFO[id]?.type === 'HB');
}
function isPaused(s) { return s.courseIds.length === 0; }

// e.g. "WT0802AM_DL6" → "0802·AM"  |  "HBWEDNT_LT" → "WED NT"
function shortCourseId(id) {
  if (id.startsWith('HB')) {
    const day = id.slice(2, 5);  // MON / WED / SAT
    const time = id.slice(5, 7); // NT / EV
    return `${day} ${time}`;
  }
  const date = id.slice(2, 6);   // 0802
  const time = id.slice(6, 8);   // AM / PM / NT
  return `${date}·${time}`;
}

function earliestCourseDate(s) {
  const dates = s.courseIds
    .map(id => COURSE_INFO[id]?.start)
    .filter(Boolean);
  if (dates.length === 0) return new Date(9999, 0); // paused → sort last
  return new Date(Math.min(...dates.map(d => d.getTime())));
}

function useIsMobile(bp = 768) {
  const [m, setM] = useState(typeof window !== 'undefined' ? window.innerWidth < bp : false);
  useEffect(() => {
    const h = () => setM(window.innerWidth < bp);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [bp]);
  return m;
}

export default function TestAdminStudents() {
  const isMobile = useIsMobile();
  const [tab,    setTab]    = useState('all');
  const [sort,   setSort]   = useState('cohort'); // 'cohort' | 'earliest' | 'latest' | 'name'
  const [search, setSearch] = useState('');

  const TAB_FILTER = {
    all:        () => true,
    'wt-now':   hasWTCurrent,
    'wt-next':  hasWTUpcoming,
    hb:         hasHB,
    paused:     isPaused,
  };

  const filtered = STUDENTS
    .filter(TAB_FILTER[tab] || (() => true))
    .filter(s =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sort === 'name')     return a.name.localeCompare(b.name);
      if (sort === 'earliest') return earliestCourseDate(a) - earliestCourseDate(b);
      if (sort === 'latest')   return earliestCourseDate(b) - earliestCourseDate(a);
      if (sort === 'orders')   return b.purchaseCount - a.purchaseCount;
      // cohort: group by first courseId alphabetically, then name within group
      const ca = a.courseIds[0] ?? 'zzz';
      const cb = b.courseIds[0] ?? 'zzz';
      return ca !== cb ? ca.localeCompare(cb) : a.name.localeCompare(b.name);
    });

  const counts = {
    all:       STUDENTS.length,
    'wt-now':  STUDENTS.filter(hasWTCurrent).length,
    'wt-next': STUDENTS.filter(hasWTUpcoming).length,
    hb:        STUDENTS.filter(hasHB).length,
    paused:    STUDENTS.filter(isPaused).length,
  };

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <AdminNav active="students" />

      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '32px 24px 60px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>Admin</div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>Students</h1>
          </div>
          <button style={{ padding: '10px 18px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
            + Add Student
          </button>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1px', backgroundColor: RULE, border: `1px solid ${RULE}`, marginBottom: '24px' }}>
          {[
            { label: 'Total',       value: counts.all },
            { label: 'WT Current',  value: counts['wt-now'] },
            { label: 'WT Upcoming', value: counts['wt-next'] },
            { label: 'HB Ongoing',  value: counts.hb },
            { label: 'Paused',      value: counts.paused },
          ].map((s, i) => (
            <div key={i} style={{ backgroundColor: '#FFFFFF', padding: '16px 20px' }}>
              <div style={{ fontSize: '28px', fontWeight: 700 }}>{s.value}</div>
              <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '3px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search + tabs + sort */}
        <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${RULE}`, gap: 0, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', width: isMobile ? '100%' : '220px', flexShrink: 0, borderRight: `1px solid ${RULE}` }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: MUTED, pointerEvents: 'none' }}>search</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              style={{ width: '100%', height: '100%', padding: '10px 12px 10px 34px', border: 'none', backgroundColor: '#FFFFFF', fontSize: '13px', color: INK, outline: 'none', boxSizing: 'border-box', fontFamily: 'Atak, sans-serif' }}
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
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap',
                color: tab === t.key ? INK : MUTED,
                borderBottom: `2px solid ${tab === t.key ? INK : 'transparent'}`,
                marginBottom: '-1px',
              }}>
                {t.label} <span style={{ color: tab === t.key ? TC : MUTED, marginLeft: '3px' }}>{counts[t.key]}</span>
              </button>
            ))}
          </div>

          {/* Sort */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '0 12px', borderLeft: `1px solid ${RULE}`, flexShrink: 0 }}>
            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginRight: '4px' }}>Sort</span>
            {[{ key: 'cohort', label: 'Cohort' }, { key: 'earliest', label: 'Earliest' }, { key: 'latest', label: 'Latest' }, { key: 'name', label: 'Name' }, { key: 'orders', label: 'Orders' }].map(s => (
              <button key={s.key} onClick={() => setSort(s.key)} style={{
                padding: '5px 10px', border: `1px solid ${sort === s.key ? INK : RULE}`,
                backgroundColor: sort === s.key ? INK : 'transparent',
                color: sort === s.key ? '#FFF' : MUTED,
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer',
              }}>{s.label}</button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ border: `1px solid ${RULE}`, borderTop: 'none', backgroundColor: '#FFFFFF', overflowX: isMobile ? 'auto' : 'visible' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 270px 100px 50px 50px', minWidth: '614px', padding: '10px 16px', backgroundColor: ALT, borderBottom: `1px solid ${RULE}` }}>
            {['Student', 'Order', 'Course', 'Progress', '#'].map((h, i) => (
              <span key={i} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED, textAlign: i === 4 ? 'center' : 'left' }}>{h}</span>
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No students found</div>
          )}

          {filtered.map((s, i) => (
            <a
              key={s.id}
              href="/test/admin/students/detail"
              style={{
                display: 'grid', gridTemplateColumns: '200px 270px 100px 50px 50px', minWidth: '614px',
                padding: '12px 16px', borderBottom: i < filtered.length - 1 ? `1px solid ${RULE}` : 'none',
                backgroundColor: '#FFFFFF', textDecoration: 'none', color: INK, alignItems: 'center',
                transition: 'background-color 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = TC_LIGHT}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FFFFFF'}
            >
              {/* Name + email + member */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>{s.name}</span>
                  {s.member && (
                    <span style={{ fontSize: '10px', fontWeight: 700, minWidth: '20px', textAlign: 'center', padding: '1px 5px', backgroundColor: TC, color: '#FFF' }}>
                      {s.member.replace('m', '')}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: MUTED }}>{s.email}</div>
              </div>

              {/* Order names */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {s.orderNames.map((o, j) => (
                  <span key={j} style={{ fontSize: '10px', color: INK }}>{o}</span>
                ))}
              </div>

              {/* Course IDs — short form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {s.courseIds.length === 0
                  ? <span style={{ fontSize: '10px', color: MUTED }}>—</span>
                  : s.courseIds.map((id, j) => (
                    <span key={j} style={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 700, color: id.startsWith('HB') ? '#555' : TC_DARK, whiteSpace: 'nowrap' }}>{id}</span>
                  ))
                }
              </div>

              {/* Progress */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {s.wt && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ fontSize: '9px', color: MUTED }}>WT</span>
                      <span style={{ fontSize: '9px', color: MUTED }}>{s.wt.att}/{s.wt.total}</span>
                    </div>
                    <div style={{ height: '3px', backgroundColor: ALT, position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(s.wt.att / s.wt.total) * 100}%`, backgroundColor: TC }} />
                    </div>
                  </div>
                )}
                {s.hb && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ fontSize: '9px', color: MUTED }}>HB</span>
                      <span style={{ fontSize: '9px', color: MUTED }}>{s.hb.att}/{s.hb.total}</span>
                    </div>
                    <div style={{ height: '3px', backgroundColor: ALT, position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(s.hb.att / s.hb.total) * 100}%`, backgroundColor: TC }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Purchase count */}
              <span style={{ fontSize: '13px', fontWeight: 700, display: 'block', textAlign: 'center' }}>{s.purchaseCount}</span>

            </a>
          ))}
        </div>

      </main>
    </div>
  );
}
