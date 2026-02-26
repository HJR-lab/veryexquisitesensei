import { useState } from 'react';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

// ─── Mock data ─────────────────────────────────────────────────────────────────
const TODAY = new Date(2026, 1, 26); // Feb 26 2026

function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

const SCHEDULE = {
  '2026-02-25': [
    { id: 1, time: '10:00 AM', end: '12:30 PM', type: 'Wheel Throwing', level: 'Beginners',    instructor: 'Justin',  spots: 2, booked: false },
    { id: 2, time: '7:00 PM',  end: '9:30 PM',  type: 'Wheel Throwing', level: 'All Levels',   instructor: 'Justin',  spots: 0, booked: true  },
  ],
  '2026-02-26': [
    { id: 3, time: '10:00 AM', end: '12:30 PM', type: 'Handbuilding',   level: 'Beginners',    instructor: 'Mei',     spots: 4, booked: false },
    { id: 4, time: '2:00 PM',  end: '4:30 PM',  type: 'Handbuilding',   level: 'All Levels',   instructor: 'Mei',     spots: 1, booked: false },
  ],
  '2026-02-27': [
    { id: 5, time: '7:00 PM',  end: '9:30 PM',  type: 'Wheel Throwing', level: 'Intermediate', instructor: 'Justin',  spots: 3, booked: false },
  ],
  '2026-02-28': [
    { id: 6,  time: '10:00 AM', end: '12:30 PM', type: 'Wheel Throwing', level: 'Beginners',  instructor: 'Justin', spots: 3, booked: false },
    { id: 7,  time: '7:00 PM',  end: '9:30 PM',  type: 'Wheel Throwing', level: 'All Levels', instructor: 'Justin', spots: 1, booked: false },
  ],
  '2026-03-01': [
    { id: 8,  time: '10:00 AM', end: '12:30 PM', type: 'Handbuilding',   level: 'Beginners',  instructor: 'Mei',    spots: 4, booked: false },
  ],
  '2026-03-02': [
    { id: 9,  time: '2:00 PM',  end: '4:30 PM',  type: 'Wheel Throwing', level: 'All Levels', instructor: 'Justin', spots: 2, booked: false },
  ],
  '2026-03-03': [
    { id: 10, time: '10:00 AM', end: '12:30 PM', type: 'Handbuilding',   level: 'Beginners',  instructor: 'Mei',    spots: 3, booked: false },
  ],
  '2026-03-04': [
    { id: 11, time: '10:00 AM', end: '12:30 PM', type: 'Wheel Throwing', level: 'All Levels', instructor: 'Justin', spots: 0, booked: false },
    { id: 12, time: '2:00 PM',  end: '4:30 PM',  type: 'Handbuilding',   level: 'Beginners',  instructor: 'Mei',    spots: 2, booked: false },
    { id: 13, time: '7:00 PM',  end: '9:30 PM',  type: 'Wheel Throwing', level: 'Intermediate', instructor: 'Justin', spots: 1, booked: false },
  ],
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

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

export default function TestClasses() {
  const [activeTab, setActiveTab] = useState('classes');
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [bookedIds, setBookedIds] = useState(new Set([6, 11, 12])); // WT Feb 28 · WT & HB Mar 4
  const [showBookSheet, setShowBookSheet] = useState(null);
  const [showDetailSheet, setShowDetailSheet] = useState(null);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [filterType, setFilterType] = useState('all');       // 'all' | 'Wheel Throwing' | 'Handbuilding'
  const [filterInstructor, setFilterInstructor] = useState('all'); // 'all' | 'Justin' | 'Mei'

  // Build a 14-day strip centred on today
  const strip = Array.from({ length: 14 }, (_, i) => addDays(TODAY, i - 0));

  const key = fmtKey(selectedDate);
  const allClasses = SCHEDULE[key] || [];
  const classes = allClasses.filter(c =>
    (filterType === 'all' || c.type === filterType) &&
    (filterInstructor === 'all' || c.instructor === filterInstructor)
  );
  const filtersActive = filterType !== 'all' || filterInstructor !== 'all';

  function handleBook(cls) {
    setShowBookSheet(cls);
  }

  function confirmBook(cls) {
    setBookedIds(prev => new Set([...prev, cls.id]));
    setShowBookSheet(null);
  }

  const myBooked = Object.values(SCHEDULE).flat().filter(c => bookedIds.has(c.id));

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#FFFFFF', minHeight: '100vh' }}>

      {/* TOP BAR */}
      <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: '#FFFFFF', borderBottom: `1px solid ${RULE}` }}>
        <div style={{ maxWidth: '520px', margin: '0 auto', padding: '0 20px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600" alt="VES" style={{ height: '26px', width: 'auto' }} />
        </div>
      </header>

      <main style={{ maxWidth: '520px', margin: '0 auto', padding: '0 0 88px' }}>

        {/* Page title */}
        <div style={{ padding: '28px 20px 20px', borderBottom: `1px solid ${RULE}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>Classes</h1>
            <div style={{ fontSize: '13px', color: MUTED, marginTop: '4px' }}>
              Book into available sessions
            </div>
          </div>
          <button
            onClick={() => setShowFilterSheet(true)}
            style={{
              display: 'flex', alignItems: 'center',
              padding: '7px', marginTop: '4px',
              border: 'none',
              backgroundColor: 'transparent',
              cursor: 'pointer', position: 'relative',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '22px', color: filtersActive ? TC : MUTED }}>tune</span>
            {filtersActive && (
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: TC, position: 'absolute', top: '-3px', right: '-3px' }} />
            )}
          </button>
        </div>

        {/* DATE STRIP — horizontally scrollable */}
        <div style={{ borderBottom: `1px solid ${RULE}`, paddingBottom: '0' }}>
          {/* Month label */}
          <div style={{ padding: '14px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>
              {MONTH_LABELS[selectedDate.getMonth()]} {selectedDate.getFullYear()}
            </span>
          </div>

          <div style={{ display: 'flex', overflowX: 'auto', padding: '0 20px 14px', gap: '6px', scrollbarWidth: 'none' }}>
            {strip.map((d, i) => {
              const dk = fmtKey(d);
              const isSelected = fmtKey(d) === fmtKey(selectedDate);
              const hasClasses = (SCHEDULE[dk] || []).length > 0;
              const hasBooked = (SCHEDULE[dk] || []).some(c => bookedIds.has(c.id));
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(d)}
                  style={{
                    flexShrink: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: '3px', padding: '8px 6px',
                    minWidth: '40px',
                    border: isSelected ? `1px solid ${TC}` : `1px solid transparent`,
                    backgroundColor: isSelected ? TC_LIGHT : 'transparent',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: isSelected ? TC_DARK : MUTED }}>
                    {DAY_LABELS[d.getDay()]}
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: isSelected ? TC : INK }}>
                    {d.getDate()}
                  </span>
                  {/* Booked dot (terracotta) or available dot (grey) */}
                  <span style={{
                    width: hasBooked ? '6px' : '4px',
                    height: hasBooked ? '6px' : '4px',
                    borderRadius: '50%',
                    backgroundColor: hasBooked
                      ? TC
                      : hasClasses
                        ? 'rgba(40,40,40,0.18)'
                        : 'transparent',
                    boxShadow: hasBooked && !isSelected ? `0 0 0 2px ${TC_LIGHT}` : 'none',
                  }} />
                </button>
              );
            })}
          </div>
        </div>

        {/* CLASSES FOR SELECTED DATE */}
        <div style={{ padding: '24px 20px 8px' }}>
          <SectionLabel>
            {DAY_LABELS[selectedDate.getDay()]}, {selectedDate.getDate()} {MONTH_LABELS[selectedDate.getMonth()]}
            {classes.length > 0 && <span style={{ color: '#CCC', fontWeight: 400, marginLeft: '6px' }}>{classes.length} sessions</span>}
          </SectionLabel>

          {classes.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: MUTED }}>No sessions on this day.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '28px' }}>
              {[...classes].sort((a, b) => {
                const aWT = a.type === 'Wheel Throwing';
                const bWT = b.type === 'Wheel Throwing';
                return aWT === bWT ? 0 : aWT ? -1 : 1;
              }).map(cls => {
                const isBooked = bookedIds.has(cls.id);
                const isFull = cls.spots === 0 && !isBooked;
                return (
                  <div key={cls.id} onClick={() => setShowDetailSheet(cls)} style={{
                    padding: '14px',
                    border: `1px solid ${isBooked ? TC : RULE}`,
                    backgroundColor: isBooked ? TC_LIGHT : ALT,
                    display: 'flex', alignItems: 'center', gap: '14px',
                    cursor: 'pointer',
                  }}>
                    {/* Time block */}
                    <div style={{ flexShrink: 0, width: '64px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{cls.time}</div>
                      <div style={{ fontSize: '10px', color: MUTED }}>–{cls.end}</div>
                    </div>
                    {/* Thin rule */}
                    <div style={{ width: '1px', height: '36px', backgroundColor: RULE, flexShrink: 0 }} />
                    {/* Detail */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px' }}>{cls.type}</div>
                      <div style={{ fontSize: '11px', color: MUTED }}>{cls.level} · {cls.instructor}</div>
                    </div>
                    {/* Action */}
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      {isBooked ? (
                        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 10px', backgroundColor: TC, color: '#FFF' }}>
                          Booked
                        </span>
                      ) : isFull ? (
                        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 10px', backgroundColor: '#EBEBEB', color: MUTED }}>
                          Full
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={e => { e.stopPropagation(); handleBook(cls); }}
                            style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 12px', border: `1px solid ${TC}`, backgroundColor: 'transparent', color: TC, cursor: 'pointer', display: 'block', marginBottom: '3px' }}
                          >
                            Book
                          </button>
                          <div style={{ fontSize: '10px', color: MUTED }}>{cls.spots} left</div>
                        </>
                      )}
                    </div>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'rgba(40,40,40,0.2)', flexShrink: 0 }}>chevron_right</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* MY BOOKINGS */}
          <div style={{ borderTop: `1px solid ${RULE}`, paddingTop: '24px' }}>
            <SectionLabel action actionLabel="See all">My Upcoming</SectionLabel>
            {myBooked.length === 0 ? (
              <div style={{ fontSize: '13px', color: MUTED, padding: '16px 0' }}>No upcoming bookings.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {myBooked.map((cls, i) => {
                  // find which date
                  const dateKey = Object.keys(SCHEDULE).find(k => SCHEDULE[k].some(c => c.id === cls.id));
                  const d = dateKey ? new Date(dateKey + 'T12:00:00') : null;
                  return (
                    <div key={cls.id} style={{
                      display: 'flex', alignItems: 'center', gap: '14px',
                      padding: '12px 12px 12px 0',
                      borderBottom: i < myBooked.length - 1 ? `1px solid ${RULE}` : 'none',
                      borderLeft: `3px solid ${TC}`,
                      paddingLeft: '12px',
                      backgroundColor: TC_LIGHT,
                      marginLeft: '-1px',
                    }}>
                      {d && (
                        <div style={{ width: '36px', flexShrink: 0, textAlign: 'center' }}>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: TC_DARK, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>{DAY_LABELS[d.getDay()]}</div>
                          <div style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.1 }}>{d.getDate()}</div>
                          <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>{MONTH_LABELS[d.getMonth()]}</div>
                        </div>
                      )}
                      <div style={{ width: '1px', height: '42px', backgroundColor: 'rgba(196,98,45,0.2)', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700 }}>{cls.type}</div>
                        <div style={{ fontSize: '11px', color: MUTED }}>{cls.time} – {cls.end} · {cls.instructor}</div>
                      </div>
                      <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 8px', backgroundColor: TC, color: '#FFF', flexShrink: 0 }}>
                        Booked
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* CLASS DETAIL SHEET */}
      {showDetailSheet && (
        <>
          <div onClick={() => setShowDetailSheet(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 60 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 61, backgroundColor: '#FFFFFF', borderTop: `2px solid ${INK}`, maxWidth: '520px', margin: '0 auto', padding: '24px 20px 48px' }}>

            {/* Handle + close */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '6px' }}>Class Details</div>
                <div style={{ fontSize: '22px', fontWeight: 700 }}>{showDetailSheet.type}</div>
              </div>
              <button onClick={() => setShowDetailSheet(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: MUTED }}>close</span>
              </button>
            </div>

            {/* Current details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0', border: `1px solid ${RULE}`, marginBottom: '20px' }}>
              {[
                { label: 'Date',       value: `${DAY_LABELS[selectedDate.getDay()]}, ${selectedDate.getDate()} ${MONTH_LABELS[selectedDate.getMonth()]}` },
                { label: 'Time',       value: `${showDetailSheet.time} – ${showDetailSheet.end}` },
                { label: 'Level',      value: showDetailSheet.level },
                { label: 'Instructor', value: showDetailSheet.instructor },
                { label: 'Spots left', value: showDetailSheet.spots > 0 ? `${showDetailSheet.spots}` : 'Full' },
              ].map((row, i, arr) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 14px', borderBottom: i < arr.length - 1 ? `1px solid ${RULE}` : 'none', backgroundColor: i % 2 === 0 ? '#FFF' : ALT }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED }}>{row.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: INK }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Stage 2 placeholder */}
            <div style={{ padding: '14px', backgroundColor: ALT, border: `1px dashed rgba(40,40,40,0.15)`, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: MUTED }}>construction</span>
              <span style={{ fontSize: '12px', color: MUTED, lineHeight: 1.5 }}>Additional class details — description, what to bring, capacity — coming in Stage 2.</span>
            </div>

            {/* Book CTA */}
            {!bookedIds.has(showDetailSheet.id) && showDetailSheet.spots > 0 && (
              <button
                onClick={() => { setShowDetailSheet(null); setShowBookSheet(showDetailSheet); }}
                style={{ width: '100%', padding: '13px', border: 'none', backgroundColor: TC, color: '#FFF', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                Book This Class
              </button>
            )}
          </div>
        </>
      )}

      {/* FILTER BOTTOM SHEET */}
      {showFilterSheet && (
        <>
          <div onClick={() => setShowFilterSheet(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 60 }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 61, backgroundColor: '#FFFFFF', borderTop: `2px solid ${INK}`, maxWidth: '520px', margin: '0 auto', padding: '24px 20px 48px' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>Filter &amp; Sort</span>
              {filtersActive && (
                <button onClick={() => { setFilterType('all'); setFilterInstructor('all'); }} style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: TC, background: 'none', border: 'none', cursor: 'pointer' }}>
                  Clear all
                </button>
              )}
            </div>

            {/* Class type */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '10px' }}>Class Type</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['all', 'Wheel Throwing', 'Handbuilding'].map(opt => (
                  <button
                    key={opt}
                    onClick={() => setFilterType(opt)}
                    style={{
                      padding: '8px 14px', cursor: 'pointer',
                      border: `1px solid ${filterType === opt ? TC : RULE}`,
                      backgroundColor: filterType === opt ? TC_LIGHT : 'transparent',
                      fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
                      color: filterType === opt ? TC_DARK : MUTED,
                    }}
                  >
                    {opt === 'all' ? 'All' : opt === 'Wheel Throwing' ? 'Wheel' : 'Handbuild'}
                  </button>
                ))}
              </div>
            </div>

            {/* Instructor */}
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '10px' }}>Instructor</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['all', 'Justin', 'Mei'].map(opt => (
                  <button
                    key={opt}
                    onClick={() => setFilterInstructor(opt)}
                    style={{
                      padding: '8px 14px', cursor: 'pointer',
                      border: `1px solid ${filterInstructor === opt ? TC : RULE}`,
                      backgroundColor: filterInstructor === opt ? TC_LIGHT : 'transparent',
                      fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
                      color: filterInstructor === opt ? TC_DARK : MUTED,
                    }}
                  >
                    {opt === 'all' ? 'All' : opt}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShowFilterSheet(false)}
              style={{ width: '100%', padding: '13px', border: 'none', backgroundColor: INK, color: '#FFF', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              Show Results
            </button>
          </div>
        </>
      )}

      {/* BOOKING BOTTOM SHEET */}
      {showBookSheet && (
        <>
          <div
            onClick={() => setShowBookSheet(null)}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 60 }}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 61,
            backgroundColor: '#FFFFFF',
            borderTop: `2px solid ${TC}`,
            maxWidth: '520px', margin: '0 auto',
            padding: '24px 20px 40px',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>
              Confirm Booking
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>{showBookSheet.type}</div>
            <div style={{ fontSize: '14px', color: MUTED, marginBottom: '20px' }}>
              {DAY_LABELS[selectedDate.getDay()]}, {selectedDate.getDate()} {MONTH_LABELS[selectedDate.getMonth()]} · {showBookSheet.time} – {showBookSheet.end}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', backgroundColor: ALT, marginBottom: '20px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: MUTED }}>info</span>
              <span style={{ fontSize: '12px', color: MUTED }}>This will use 1 class from your Wheel Throwing allocation.</span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowBookSheet(null)}
                style={{ flex: 1, padding: '13px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', color: MUTED }}
              >
                Cancel
              </button>
              <button
                onClick={() => confirmBook(showBookSheet)}
                style={{ flex: 2, padding: '13px', border: 'none', backgroundColor: TC, color: '#FFF', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                Confirm Booking
              </button>
            </div>
          </div>
        </>
      )}

      {/* BOTTOM TAB BAR */}
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
