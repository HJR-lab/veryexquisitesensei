// ─── Design tokens ───────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

// ─── Month names for CalendarWidget ──────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ─── CalendarWidget ───────────────────────────────────────────────────────────
function CalendarWidget({ month, onMonthChange, selectedDate, onDateSelect, availSet }) {
  const year     = month.getFullYear();
  const mon      = month.getMonth();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const startDow = (new Date(year, mon, 1).getDay() + 6) % 7; // Mon = 0

  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return (
    <div style={{ border: `1px solid ${RULE}`, backgroundColor: ALT, padding: '16px', userSelect: 'none' }}>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <button
          onClick={() => onMonthChange(new Date(year, mon - 1))}
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: MUTED, padding: '4px 8px' }}
        >&lsaquo;</button>
        <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {MONTH_NAMES[mon]} {year}
        </span>
        <button
          onClick={() => onMonthChange(new Date(year, mon + 1))}
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: MUTED, padding: '4px 8px' }}
        >&rsaquo;</button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700, color: MUTED, padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {Array.from({ length: startDow }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day     = i + 1;
          const date    = new Date(year, mon, day);
          const dateStr = fmt(date);
          const hasClass  = availSet ? availSet.has(dateStr) : false;
          const isSelected = selectedDate && fmt(selectedDate) === dateStr;
          return (
            <button
              key={day}
              onClick={() => hasClass && onDateSelect(date)}
              style={{
                height: '36px', width: '100%', border: 'none',
                cursor: hasClass ? 'pointer' : 'default',
                fontSize: '12px', fontWeight: hasClass ? 700 : 400,
                backgroundColor: isSelected ? TC : hasClass ? TC_LIGHT : 'transparent',
                color: isSelected ? '#FFF' : hasClass ? TC_DARK : MUTED,
                position: 'relative',
              }}
            >
              {day}
              {hasClass && !isSelected && (
                <span style={{
                  position: 'absolute', bottom: '4px', left: '50%', transform: 'translateX(-50%)',
                  width: '4px', height: '4px', borderRadius: '50%', backgroundColor: TC,
                }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function StudentRescheduleModal({
  selectedBookingForMakeup,
  isMobile,
  formatDate,
  resetMakeupModalState,
  makeupCurrentMonth,
  setMakeupCurrentMonth,
  makeupSelectedDate,
  setMakeupSelectedDate,
  rescheduleConfirmId,
  setRescheduleConfirmId,
  getAvailSet,
  getMakeupClassesForDate,
  getTypeLabel,
  rescheduling,
  reschedulingClassId,
  handleRescheduleToMakeup,
  handleConvertToCredit,
  deletingBookingId,
  isHBEnrollment,
}) {
  const classes = getMakeupClassesForDate(makeupSelectedDate);

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ backgroundColor: '#FFFFFF', width: '100%', maxWidth: '820px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${RULE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>
              {selectedBookingForMakeup.isPlaceholder ? 'Book Class' : 'Reschedule Class'}
            </div>
            <div style={{ fontSize: '12px', color: MUTED }}>
              {selectedBookingForMakeup.isPlaceholder
                ? 'Using flexible credit'
                : `${selectedBookingForMakeup.class_type} · ${formatDate(selectedBookingForMakeup.class_date)} · ${selectedBookingForMakeup.start_time}`}
            </div>
          </div>
          <button onClick={resetMakeupModalState} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: MUTED, padding: '0 4px', lineHeight: 1 }}>&#10005;</button>
        </div>

        {/* Info banner */}
        <div style={{ margin: '16px 24px 0', padding: '10px 14px', backgroundColor: TC_LIGHT, border: `1px solid ${TC}`, fontSize: '12px', color: TC_DARK }}>
          {selectedBookingForMakeup.isPlaceholder
            ? 'Select an available date below to book a class using a flexible credit.'
            : 'Select an available date below, then choose the class to reschedule to. The current booking will be replaced.'}
        </div>

        {/* Body: 2-col */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '24px', padding: '20px 24px 24px' }}>

          {/* Calendar */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '10px' }}>Select Date</div>
            <CalendarWidget
              month={makeupCurrentMonth}
              onMonthChange={setMakeupCurrentMonth}
              selectedDate={makeupSelectedDate}
              onDateSelect={d => { setMakeupSelectedDate(d); setRescheduleConfirmId(null); }}
              availSet={getAvailSet()}
            />
          </div>

          {/* Class list */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, marginBottom: '10px' }}>
              {makeupSelectedDate
                ? `Available on ${makeupSelectedDate.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })}`
                : 'Available Classes'}
            </div>

            {classes.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No available classes on this date.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {classes.map(c => {
                  const isGlazing = c.classType?.includes('6.6');
                  const spotsLeft = 10 - c.currentEnrollment;
                  const isConfirming = rescheduleConfirmId === c.id;
                  const isReschedulingThis = rescheduling && reschedulingClassId === c.id;
                  return (
                    <div key={c.id} style={{ border: `1px solid ${isGlazing ? '#D4A800' : RULE}`, backgroundColor: isGlazing ? '#FFFBEA' : '#FFF' }}>
                      <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', backgroundColor: ALT, color: INK }}>{getTypeLabel(c.classType)}</span>
                            <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 700, color: TC_DARK }}>{c.classType}</span>
                            {isGlazing && <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '2px 7px', backgroundColor: '#D4A800', color: '#FFF' }}>Glazing</span>}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700 }}>{c.startTime}{c.endTime ? ` – ${c.endTime}` : ''}</span>
                            {c.instructor && <span style={{ fontSize: '11px', color: MUTED }}>· {c.instructor}</span>}
                            <span style={{ fontSize: '11px', color: MUTED }}>· {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</span>
                          </div>
                        </div>
                        <button
                          onClick={() => setRescheduleConfirmId(c.id)}
                          disabled={rescheduling}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: isConfirming ? ALT : isGlazing ? '#D4A800' : TC,
                            color: isConfirming ? MUTED : '#FFF',
                            border: 'none', cursor: rescheduling ? 'not-allowed' : 'pointer',
                            fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                            opacity: rescheduling ? 0.7 : 1,
                          }}
                        >Confirm</button>
                      </div>

                      {/* Inline reschedule confirm */}
                      {isConfirming && (
                        <div style={{ padding: '10px 16px', backgroundColor: TC_LIGHT, borderTop: `1px solid ${TC}` }}>
                          {!selectedBookingForMakeup.isPlaceholder && !isHBEnrollment && (
                            <div style={{ fontSize: '11px', color: TC_DARK, lineHeight: 1.5, marginBottom: '8px' }}>
                              <strong>Please note:</strong> You must reschedule more than 24 hours before class. Missed makeup classes incur a <strong>$20 no-show fee</strong>. Makeup classes outside your cohort schedule incur a <strong>$40 fee</strong> (glazing classes excluded).
                            </div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '12px', color: TC_DARK }}>
                            {selectedBookingForMakeup.isPlaceholder
                              ? 'Book this class using the flexible credit?'
                              : 'This will replace the current booking. Continue?'}
                          </span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => setRescheduleConfirmId(null)}
                              style={{ padding: '5px 12px', border: `1px solid ${RULE}`, background: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: MUTED }}
                            >Cancel</button>
                            <button
                              onClick={() => handleRescheduleToMakeup(c.id)}
                              disabled={isReschedulingThis}
                              style={{ padding: '5px 12px', border: 'none', backgroundColor: TC, cursor: isReschedulingThis ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#FFF', opacity: isReschedulingThis ? 0.7 : 1 }}
                            >{isReschedulingThis ? 'Saving…' : (selectedBookingForMakeup.isPlaceholder ? 'Yes, Book' : 'Yes, Reschedule')}</button>
                          </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${RULE}`, display: 'flex', justifyContent: 'space-between', gap: '8px', flexShrink: 0 }}>
          {!selectedBookingForMakeup.isPlaceholder && (
            <button
              onClick={handleConvertToCredit}
              disabled={deletingBookingId === selectedBookingForMakeup.id}
              style={{ padding: '10px 20px', backgroundColor: '#9E6200', color: '#FFF', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: deletingBookingId === selectedBookingForMakeup.id ? 0.7 : 1 }}
            >
              {deletingBookingId === selectedBookingForMakeup.id ? 'Converting…' : 'Convert to Credit'}
            </button>
          )}
          <button
            onClick={resetMakeupModalState}
            style={{ padding: '10px 20px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', cursor: 'pointer', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED, marginLeft: 'auto' }}
          >Cancel</button>
        </div>
      </div>
    </div>
  );
}
