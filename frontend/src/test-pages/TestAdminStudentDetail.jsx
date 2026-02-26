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

// Mock: Sarah Tan
const STUDENT = {
  name: 'Sarah Tan', email: 'sarah.tan@email.com', phone: '+65 9123 4567',
  joined: 'Sep 2025', dob: '12 Apr 1995',
  courses: [
    { id: 'WT0602NT_JL6', type: 'WT', label: 'SATURDAYS • 31 Jan–7 Mar • 2:00pm–4:00pm',   att: 4, total: 6 },
    { id: 'HBWEDNT_LT',   type: 'HB', label: 'WEDNESDAYS • 4 Feb–11 Mar • 7:00pm–9:30pm', att: 1, total: 6 },
  ],
  membership: { type: '6 Month', start: 'Nov 2025', end: 'May 2026', status: 'active' },
  purchaseCount: 3,
};

const BOOKINGS = [
  { id: 1,  courseId: 'WT0602NT_JL6', date: 'Sat, Feb 28', time: '2:00–4:00 PM',       type: 'WT', status: 'booked',    makeup: false },
  { id: 2,  courseId: 'WT0602NT_JL6', date: 'Wed, Mar 4',  time: '10:00 AM–12:00 PM',  type: 'WT', status: 'booked',   makeup: false },
  { id: 3,  courseId: 'HBWEDNT_LT',   date: 'Wed, Mar 4',  time: '2:00–4:00 PM',       type: 'HB', status: 'booked',    makeup: false },
  { id: 4,  courseId: 'WT0602NT_JL6', date: 'Wed, Feb 19', time: '2:00–4:00 PM',       type: 'WT', status: 'attended',  makeup: false },
  { id: 5,  courseId: 'WT0602NT_JL6', date: 'Sat, Feb 14', time: '2:00–4:00 PM',       type: 'WT', status: 'attended',  makeup: false },
  { id: 6,  courseId: 'WT0602NT_JL6', date: 'Wed, Feb 5',  time: '2:00–4:00 PM',       type: 'WT', status: 'attended',  makeup: false },
  { id: 7,  courseId: 'WT0602NT_JL6', date: 'Sat, Jan 31', time: '2:00–4:00 PM',       type: 'WT', status: 'attended',  makeup: false },
  { id: 8,  courseId: 'HBWEDNT_LT',   date: 'Tue, Feb 18', time: '2:00–4:00 PM',       type: 'HB', status: 'attended',  makeup: false },
  { id: 9,  courseId: 'WT0602NT_JL6', date: 'Wed, Jan 22', time: '10:00 AM–12:00 PM',  type: 'WT', status: 'missed',    makeup: false },
  { id: 10, courseId: 'HBWEDNT_LT',   date: 'Tue, Jan 14', time: '2:00–4:00 PM',       type: 'HB', status: 'cancelled', makeup: true  },
];

const AVAIL = [
  { id: 'a1', date: '2026-03-07', label: 'Sat, 7 Mar',  time: '2:00–4:00 PM',      type: 'WT', courseId: 'WT0702AF_JL6', instructor: 'Justin', spots: 3, glazing: false },
  { id: 'a2', date: '2026-03-11', label: 'Wed, 11 Mar', time: '10:00 AM–12:00 PM', type: 'WT', courseId: 'WT1103AM_LT6', instructor: 'Lena',   spots: 1, glazing: false },
  { id: 'a3', date: '2026-03-14', label: 'Sat, 14 Mar', time: '2:00–4:00 PM',      type: 'WT', courseId: 'WT1403AF_JL6', instructor: 'Justin', spots: 5, glazing: false },
  { id: 'a4', date: '2026-03-18', label: 'Wed, 18 Mar', time: '2:00–4:00 PM',      type: 'WT', courseId: 'WT1803NT_LT6', instructor: 'Lena',   spots: 2, glazing: false },
  { id: 'a5', date: '2026-03-21', label: 'Sat, 21 Mar', time: '10:00 AM–12:00 PM', type: 'HB', courseId: 'HBSAT21AM_MT', instructor: 'Mei',    spots: 4, glazing: false },
  { id: 'a6', date: '2026-03-25', label: 'Wed, 25 Mar', time: '2:00–4:00 PM',      type: 'WT', courseId: 'WT2503NT_JL6', instructor: 'Justin', spots: 1, glazing: true  },
  { id: 'a7', date: '2026-04-01', label: 'Wed, 1 Apr',  time: '2:00–4:00 PM',      type: 'WT', courseId: 'WT0104NT_LT6', instructor: 'Lena',   spots: 6, glazing: false },
  { id: 'a8', date: '2026-04-04', label: 'Sat, 4 Apr',  time: '2:00–4:00 PM',      type: 'WT', courseId: 'WT0404AF_JL6', instructor: 'Justin', spots: 2, glazing: true  },
];

const AVAIL_SET = new Set(AVAIL.map(c => c.date));

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function CalendarWidget({ month, onMonthChange, selectedDate, onDateSelect }) {
  const year = month.getFullYear();
  const mon  = month.getMonth();
  const firstDay = new Date(year, mon, 1);
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0

  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  return (
    <div style={{ border: `1px solid ${RULE}`, backgroundColor: ALT, padding: '16px', userSelect: 'none' }}>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <button onClick={() => onMonthChange(new Date(year, mon - 1))} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: MUTED, padding: '4px 8px' }}>‹</button>
        <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{MONTH_NAMES[mon]} {year}</span>
        <button onClick={() => onMonthChange(new Date(year, mon + 1))} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: MUTED, padding: '4px 8px' }}>›</button>
      </div>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700, color: MUTED, padding: '4px 0' }}>{d}</div>
        ))}
      </div>
      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {Array.from({ length: startDow }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const date = new Date(year, mon, day);
          const dateStr = fmt(date);
          const hasClass = AVAIL_SET.has(dateStr);
          const isSelected = selectedDate && fmt(selectedDate) === dateStr;
          return (
            <button key={day} onClick={() => hasClass && onDateSelect(date)} style={{
              height: '36px', width: '100%', border: 'none', cursor: hasClass ? 'pointer' : 'default',
              fontSize: '12px', fontWeight: hasClass ? 700 : 400,
              backgroundColor: isSelected ? TC : hasClass ? TC_LIGHT : 'transparent',
              color: isSelected ? '#FFF' : hasClass ? TC_DARK : MUTED,
              position: 'relative',
            }}>
              {day}
              {hasClass && !isSelected && (
                <span style={{ position: 'absolute', bottom: '4px', left: '50%', transform: 'translateX(-50%)', width: '4px', height: '4px', borderRadius: '50%', backgroundColor: TC }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const FEES = [
  { id: 1, desc: 'WT Course — Beginners (3rd purchase)', amount: '$360', date: 'Jan 2026', status: 'paid'    },
  { id: 2, desc: 'HB Course — Basics',                   amount: '$360', date: 'Feb 2026', status: 'paid'    },
  { id: 3, desc: 'Firing — Feb 2026 batch',              amount: '$45',  date: 'Feb 2026', status: 'pending' },
];

const BOOKING_STYLE = {
  booked:    { bg: TC_LIGHT,  text: TC_DARK },
  attended:  { bg: ALT,       text: MUTED   },
  missed:    { bg: '#FFF0F0', text: '#C03030' },
  cancelled: { bg: ALT,       text: MUTED   },
};

const FEE_STYLE = {
  paid:    { bg: TC_LIGHT,  text: TC_DARK },
  pending: { bg: '#FFF7E6', text: '#9E6200' },
};

const INPUT_STYLE = {
  width: '100%', padding: '5px 8px', border: `1px solid ${TC}`,
  borderRadius: 0, fontSize: '13px', fontFamily: 'Atak, sans-serif',
  backgroundColor: TC_LIGHT, color: INK, boxSizing: 'border-box', outline: 'none',
};

export default function TestAdminStudentDetail() {
  const isMobile = useIsMobile();
  const [student, setStudent] = useState(STUDENT);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState({});
  const [bookings, setBookings] = useState(BOOKINGS);
  const [openMenu, setOpenMenu] = useState(null); // booking id
  const [section, setSection] = useState('enrollment');
  const [bookingFilter, setBookingFilter] = useState('all');
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showEditModal, setShowEditModal]   = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [fees, setFees] = useState(FEES);
  const [feeDeleteConfirmId, setFeeDeleteConfirmId] = useState(null);
  const [rescheduleBooking, setRescheduleBooking]       = useState(null);
  const [rescheduleMonth,   setRescheduleMonth]         = useState(new Date(2026, 2)); // March 2026
  const [rescheduleDate,    setRescheduleDate]           = useState(null);
  const [rescheduleConfirm, setRescheduleConfirm]       = useState(null); // class to confirm

  function startEdit() {
    setDraft({ name: student.name, email: student.email, phone: student.phone, dob: student.dob, purchaseCount: student.purchaseCount });
    setEditing(true);
  }
  function saveEdit() {
    setStudent(s => ({ ...s, ...draft }));
    setEditing(false);
  }
  function cancelEdit() { setEditing(false); }

  function setBookingStatus(id, status) {
    setBookings(bs => bs.map(b => b.id === id ? { ...b, status } : b));
    setOpenMenu(null);
  }
  function toggleMakeup(id) {
    setBookings(bs => bs.map(b => b.id === id ? { ...b, makeup: !b.makeup } : b));
    setOpenMenu(null);
  }

  // Close menu on outside click
  useEffect(() => {
    if (!openMenu) return;
    const fn = () => setOpenMenu(null);
    document.addEventListener('click', fn);
    return () => document.removeEventListener('click', fn);
  }, [openMenu]);

  const filteredBookings = bookings.filter(b =>
    bookingFilter === 'all' || b.status === bookingFilter
  );

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <AdminNav active="students" />

      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '24px 24px 60px' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <a href="/test/admin/students" style={{ fontSize: '12px', color: TC, textDecoration: 'none', fontWeight: 700 }}>← Students</a>
          <span style={{ fontSize: '12px', color: MUTED }}>/</span>
          <span style={{ fontSize: '12px', color: MUTED }}>{student.name}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '300px 1fr', gap: '24px', alignItems: 'start' }}>

          {/* Left: Student card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Profile + Membership */}
            <div style={{ backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, padding: '24px' }}>

              {/* Top row: avatar/name left, membership right */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <div style={{ width: '52px', height: '52px', backgroundColor: TC_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 700, color: TC_DARK }}>{student.name[0]}</span>
                  </div>
                  {editing ? (
                    <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                      style={{ ...INPUT_STYLE, fontSize: '16px', fontWeight: 700, marginBottom: '3px' }} />
                  ) : (
                    <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '3px' }}>{student.name}</div>
                  )}
                  <div style={{ fontSize: '12px', color: MUTED }}>Member since {student.joined}</div>
                </div>

                {/* Membership — top right */}
                {student.membership && (
                  <div style={{ backgroundColor: TC_LIGHT, border: `1px solid ${TC}`, padding: '10px 12px', flexShrink: 0, maxWidth: '160px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>★ Membership</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px' }}>{student.membership.type}</div>
                    <div style={{ fontSize: '10px', color: MUTED, marginBottom: '8px' }}>{student.membership.start} — {student.membership.end}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '2px 7px', backgroundColor: TC, color: '#FFF' }}>active</span>
                      <span style={{ fontSize: '10px', color: TC_DARK }}>~90 days</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Fields */}
              <div style={{ paddingTop: '14px', borderTop: `1px solid ${RULE}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: MUTED }}>Details</span>
                  {editing ? (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={cancelEdit} style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Cancel</button>
                      <button onClick={saveEdit} style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: TC, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Save</button>
                    </div>
                  ) : (
                    <button onClick={startEdit} style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: TC, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Edit</button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    { label: 'Email',             key: 'email',         type: 'email'  },
                    { label: 'Phone',             key: 'phone',         type: 'tel'    },
                    { label: 'Date of Birth',     key: 'dob',           type: 'text'   },
                    { label: 'Courses Purchased', key: 'purchaseCount', type: 'number' },
                  ].map(f => (
                    <div key={f.key}>
                      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '3px' }}>{f.label}</div>
                      {editing ? (
                        <input type={f.type} value={draft[f.key]} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                          style={INPUT_STYLE} />
                      ) : (
                        <div style={{ fontSize: '13px' }}>{student[f.key]}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: '8px' }}>
              <button
                onClick={() => setShowEditModal(true)}
                style={{ flex: 1, padding: '11px', backgroundColor: INK, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Edit Allocations
              </button>
              <button
                onClick={() => setShowPauseModal(true)}
                style={{ flex: 1, padding: '11px', backgroundColor: 'transparent', color: INK, border: `1px solid ${RULE}`, fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Pause Course
              </button>
            </div>

          </div>

          {/* Right: tabbed detail */}
          <div>

            {/* Section tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${RULE}`, marginBottom: '0', backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, borderBottom: 'none' }}>
              {[
                { id: 'enrollment', label: 'Enrollment' },
                { id: 'bookings',   label: 'Bookings'   },
                { id: 'fees',       label: 'Fees'       },
              ].map(t => (
                <button key={t.id} onClick={() => setSection(t.id)} style={{
                  padding: '13px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: section === t.id ? INK : MUTED,
                  borderBottom: `2px solid ${section === t.id ? TC : 'transparent'}`,
                  transition: 'all 0.1s',
                }}>{t.label}</button>
              ))}
            </div>

            {/* ENROLLMENT */}
            {section === 'enrollment' && (
              <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', padding: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {STUDENT.courses.map((c, i) => (
                    <div key={i} style={{ paddingBottom: i < STUDENT.courses.length - 1 ? '20px' : 0, borderBottom: i < STUDENT.courses.length - 1 ? `1px solid ${RULE}` : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', backgroundColor: ALT, color: INK }}>{c.type}</span>
                            <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.01em' }}>{c.label}</span>
                          </div>
                          <div style={{ fontSize: '10px', fontFamily: 'monospace', color: c.type === 'WT' ? TC_DARK : MUTED }}>{c.id}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '22px', fontWeight: 700 }}>{c.att}<span style={{ fontSize: '14px', color: MUTED, fontWeight: 400 }}>/{c.total}</span></div>
                          <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Attended</div>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div style={{ height: '6px', backgroundColor: ALT, position: 'relative', marginBottom: '8px' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(c.att / c.total) * 100}%`, backgroundColor: TC }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', color: MUTED }}>{c.att} attended</span>
                        <span style={{ fontSize: '11px', color: TC_DARK, fontWeight: 700 }}>{c.total - c.att} remaining</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* BOOKINGS */}
            {section === 'bookings' && (
              <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF' }}>
                {/* Filter row */}
                <div style={{ display: 'flex', flexWrap: 'wrap', padding: '12px 16px', borderBottom: `1px solid ${RULE}`, gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '4px' }}>Filter:</span>
                  {['all', 'booked', 'attended', 'missed', 'cancelled'].map(f => (
                    <button key={f} onClick={() => setBookingFilter(f)} style={{
                      padding: '4px 10px', border: `1px solid ${bookingFilter === f ? TC : RULE}`,
                      backgroundColor: bookingFilter === f ? TC_LIGHT : 'transparent',
                      fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'capitalize',
                      color: bookingFilter === f ? TC_DARK : MUTED, cursor: 'pointer',
                    }}>{f}</button>
                  ))}
                </div>

                {/* Scrollable table */}
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: '480px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 110px 130px 90px 1fr', padding: '9px 16px', backgroundColor: ALT, borderBottom: `1px solid ${RULE}` }}>
                      {['Course', 'Date', 'Time', 'Status', ''].map((h, i) => (
                        <span key={i} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{h}</span>
                      ))}
                    </div>

                    {filteredBookings.map((b, i) => (
                      <div key={b.id} style={{ borderBottom: i < filteredBookings.length - 1 ? `1px solid ${RULE}` : 'none' }}>
                        <div style={{
                          display: 'grid', gridTemplateColumns: '120px 110px 130px 90px 1fr',
                          padding: '11px 16px',
                          alignItems: 'center',
                          backgroundColor: b.status === 'booked' ? TC_LIGHT : '#FFFFFF',
                        }}>
                          <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 700, color: b.type === 'WT' ? TC_DARK : MUTED }}>{b.courseId}</span>
                          <div style={{ fontSize: '13px', fontWeight: b.status === 'booked' ? 700 : 400 }}>{b.date}</div>
                          <span style={{ fontSize: '12px', color: MUTED }}>{b.time}</span>
                          <span style={{
                            fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                            padding: '3px 8px', display: 'inline-block',
                            backgroundColor: BOOKING_STYLE[b.status]?.bg || ALT,
                            color: BOOKING_STYLE[b.status]?.text || MUTED,
                          }}>{b.status}</span>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button onClick={() => { setRescheduleBooking(b); setRescheduleDate(null); }} style={{
                              padding: '4px 10px', border: `1px solid ${RULE}`, background: 'none', cursor: 'pointer',
                              fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: INK,
                            }}>Reschedule</button>
                            <button onClick={() => setDeleteConfirmId(b.id)} style={{
                              padding: '4px 10px', border: '1px solid #F0C0C0', background: 'none', cursor: 'pointer',
                              fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#C03030',
                            }}>Delete</button>
                          </div>
                        </div>
                        {deleteConfirmId === b.id && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', backgroundColor: '#FFF5F5', borderTop: '1px solid #F0C0C0' }}>
                            <span style={{ fontSize: '12px', color: '#C03030' }}>⚠ Delete this booking? This cannot be undone.</span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button onClick={() => setDeleteConfirmId(null)} style={{
                                padding: '5px 12px', border: `1px solid ${RULE}`, background: 'none', cursor: 'pointer',
                                fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: MUTED,
                              }}>Cancel</button>
                              <button onClick={() => { setBookings(bs => bs.filter(x => x.id !== b.id)); setDeleteConfirmId(null); }} style={{
                                padding: '5px 12px', border: 'none', backgroundColor: '#C03030', cursor: 'pointer',
                                fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#FFF',
                              }}>Confirm Delete</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* FEES */}
            {section === 'fees' && (
              <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF' }}>
                {/* Summary */}
                <div style={{ display: 'flex', gap: '1px', backgroundColor: RULE, borderBottom: `1px solid ${RULE}` }}>
                  {[
                    { label: 'Total Paid',    value: '$720' },
                    { label: 'Outstanding',   value: '$45'  },
                  ].map((s, i) => (
                    <div key={i} style={{ flex: 1, padding: '16px 20px', backgroundColor: '#FFFFFF' }}>
                      <div style={{ fontSize: '22px', fontWeight: 700 }}>{s.value}</div>
                      <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '3px' }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Scrollable table */}
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: '520px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px 180px', padding: '9px 16px', backgroundColor: ALT, borderBottom: `1px solid ${RULE}` }}>
                      {['Description', 'Amount', 'Date', 'Status', ''].map((h, i) => (
                        <span key={i} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{h}</span>
                      ))}
                    </div>

                    {fees.map((f, i) => (
                      <div key={f.id} style={{ borderBottom: i < fees.length - 1 ? `1px solid ${RULE}` : 'none' }}>
                        <div style={{
                          display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px 180px',
                          padding: '12px 16px', alignItems: 'center',
                        }}>
                          <span style={{ fontSize: '13px' }}>{f.desc}</span>
                          <span style={{ fontSize: '13px', fontWeight: 700 }}>{f.amount}</span>
                          <span style={{ fontSize: '12px', color: MUTED }}>{f.date}</span>
                          <span style={{
                            fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                            padding: '3px 8px', display: 'inline-block',
                            backgroundColor: FEE_STYLE[f.status]?.bg || ALT,
                            color: FEE_STYLE[f.status]?.text || MUTED,
                          }}>{f.status}</span>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            {f.status === 'pending' && (
                              <button onClick={() => setFees(fs => fs.map(x => x.id === f.id ? { ...x, status: 'paid' } : x))} style={{
                                padding: '4px 10px', border: `1px solid ${TC}`, background: 'none', cursor: 'pointer',
                                fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: TC,
                              }}>Mark Paid</button>
                            )}
                            <button onClick={() => setFeeDeleteConfirmId(f.id)} style={{
                              padding: '4px 10px', border: '1px solid #F0C0C0', background: 'none', cursor: 'pointer',
                              fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#C03030',
                            }}>Delete</button>
                          </div>
                        </div>
                        {feeDeleteConfirmId === f.id && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', backgroundColor: '#FFF5F5', borderTop: '1px solid #F0C0C0' }}>
                            <span style={{ fontSize: '12px', color: '#C03030' }}>⚠ Delete this fee record? This cannot be undone.</span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button onClick={() => setFeeDeleteConfirmId(null)} style={{
                                padding: '5px 12px', border: `1px solid ${RULE}`, background: 'none', cursor: 'pointer',
                                fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: MUTED,
                              }}>Cancel</button>
                              <button onClick={() => { setFees(fs => fs.filter(x => x.id !== f.id)); setFeeDeleteConfirmId(null); }} style={{
                                padding: '5px 12px', border: 'none', backgroundColor: '#C03030', cursor: 'pointer',
                                fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#FFF',
                              }}>Confirm Delete</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

      </main>

      {/* Pause Modal */}
      {showPauseModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#FFFFFF', padding: '32px', width: '440px', maxWidth: '90vw' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px' }}>Pause Course</div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '6px' }}>Classes Completed</label>
              <input type="number" defaultValue={4} style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '14px', boxSizing: 'border-box', fontFamily: 'Atak, sans-serif' }} />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '6px' }}>Reason</label>
              <textarea rows={3} placeholder="Reason for pause…" style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '14px', boxSizing: 'border-box', fontFamily: 'Atak, sans-serif', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowPauseModal(false)} style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
              <button style={{ flex: 1, padding: '12px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Confirm Pause</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Allocations Modal */}
      {showEditModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#FFFFFF', padding: '32px', width: '440px', maxWidth: '90vw' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px' }}>Edit Allocations</div>
            {[
              { label: 'WT Classes Allocated', value: 6 },
              { label: 'HB Classes Allocated', value: 6 },
              { label: 'Course Purchase Count', value: 3 },
            ].map((f, i) => (
              <div key={i} style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '6px' }}>{f.label}</label>
                <input type="number" defaultValue={f.value} style={{ width: '100%', padding: '10px 12px', border: `1px solid ${RULE}`, fontSize: '14px', boxSizing: 'border-box', fontFamily: 'Atak, sans-serif' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button onClick={() => setShowEditModal(false)} style={{ flex: 1, padding: '12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
              <button style={{ flex: 1, padding: '12px', backgroundColor: INK, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleBooking && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ backgroundColor: '#FFFFFF', width: '100%', maxWidth: '820px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${RULE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>Reschedule Class</div>
                <div style={{ fontSize: '12px', color: MUTED }}>{rescheduleBooking.courseId} · {rescheduleBooking.date} · {rescheduleBooking.time}</div>
              </div>
              <button onClick={() => { setRescheduleBooking(null); setRescheduleConfirm(null); }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: MUTED, padding: '0 4px', lineHeight: 1 }}>✕</button>
            </div>
            {/* Info banner */}
            <div style={{ margin: '16px 24px 0', padding: '10px 14px', backgroundColor: TC_LIGHT, border: `1px solid ${TC}`, fontSize: '12px', color: TC_DARK }}>
              Select an available date below, then choose the class to reschedule to. The current booking will be replaced.
            </div>
            {/* Body: 2-col */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '24px', padding: '20px 24px 24px' }}>
              {/* Calendar */}
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '10px' }}>Select Date</div>
                <CalendarWidget
                  month={rescheduleMonth}
                  onMonthChange={setRescheduleMonth}
                  selectedDate={rescheduleDate}
                  onDateSelect={d => { setRescheduleDate(d); setRescheduleConfirm(null); }}
                />
              </div>
              {/* Class list */}
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '10px' }}>
                  {rescheduleDate
                    ? `Available on ${rescheduleDate.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })}`
                    : 'Available Classes'}
                </div>
                {!rescheduleDate ? (
                  <div style={{ padding: '40px 0', textAlign: 'center', color: MUTED, fontSize: '13px' }}>← Select a highlighted date</div>
                ) : (() => {
                  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                  const classes = AVAIL.filter(c => c.date === fmt(rescheduleDate));
                  return classes.length === 0
                    ? <div style={{ padding: '40px 0', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No classes on this date</div>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {classes.map(c => (
                          <div key={c.id} style={{ border: `1px solid ${c.glazing ? '#D4A800' : RULE}`, backgroundColor: c.glazing ? '#FFFBEA' : '#FFF' }}>
                            <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', backgroundColor: ALT, color: INK }}>{c.type}</span>
                                  <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 700, color: c.type === 'WT' ? TC_DARK : MUTED }}>{c.courseId}</span>
                                  {c.glazing && <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '2px 7px', backgroundColor: '#D4A800', color: '#FFF' }}>Glazing 6.6</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '13px', fontWeight: 700 }}>{c.time}</span>
                                  <span style={{ fontSize: '11px', color: MUTED }}>· {c.instructor}</span>
                                  <span style={{ fontSize: '11px', color: MUTED }}>· {c.spots} spot{c.spots !== 1 ? 's' : ''} left</span>
                                </div>
                              </div>
                              <button onClick={() => setRescheduleConfirm(c.id)} style={{
                                padding: '8px 16px', backgroundColor: rescheduleConfirm === c.id ? ALT : TC, color: rescheduleConfirm === c.id ? MUTED : '#FFF', border: 'none', cursor: 'pointer',
                                fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                              }}>Confirm</button>
                            </div>
                            {rescheduleConfirm === c.id && (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', backgroundColor: TC_LIGHT, borderTop: `1px solid ${TC}` }}>
                                <span style={{ fontSize: '12px', color: TC_DARK }}>⚠ This will replace the current booking. Continue?</span>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button onClick={() => setRescheduleConfirm(null)} style={{
                                    padding: '5px 12px', border: `1px solid ${RULE}`, background: 'none', cursor: 'pointer',
                                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: MUTED,
                                  }}>Cancel</button>
                                  <button onClick={() => {
                                    setBookings(bs => bs.map(b => b.id === rescheduleBooking.id ? { ...b, date: c.label, time: c.time, type: c.type } : b));
                                    setRescheduleBooking(null);
                                    setRescheduleConfirm(null);
                                  }} style={{
                                    padding: '5px 12px', border: 'none', backgroundColor: TC, cursor: 'pointer',
                                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#FFF',
                                  }}>Yes, Reschedule</button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>;
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
