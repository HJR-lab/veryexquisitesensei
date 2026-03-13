// ─── Design tokens ───────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function buildCalendar(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const pad = (firstDay.getDay() + 6) % 7; // Mon=0
  const days = Array(pad).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function ClassCalendarGrid({
  isMobile,
  calPage,
  setCalPage,
  CAL_MONTHS,
  selectedDate,
  setSelectedDate,
  TODAY,
  getEventsForDay,
  wtCourses,
  hbCourses,
  renderCalCell,
}) {
  return (
    <div style={{ marginBottom: selectedDate ? '20px' : '0' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>Calendar</span>
        <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: MUTED }}>
          — {isMobile ? 'Tap' : 'Click'} any day to see classes
        </span>
      </div>

      {isMobile ? (
        /* Mobile: single month + prev/next */
        <div>
          <div style={{ backgroundColor: '#FFFFFF', border: `1px solid ${RULE}` }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                onClick={() => { setCalPage(p => Math.max(0, p - 1)); setSelectedDate(null); }}
                disabled={calPage === 0}
                style={{ padding: '5px 12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '14px', fontWeight: 700, cursor: calPage === 0 ? 'default' : 'pointer', color: calPage === 0 ? '#CCC' : INK }}
              >&larr;</button>
              <span style={{ fontSize: '13px', fontWeight: 700 }}>{CAL_MONTHS[calPage]?.label}</span>
              <button
                onClick={() => { setCalPage(p => Math.min(CAL_MONTHS.length - 1, p + 1)); setSelectedDate(null); }}
                disabled={calPage === CAL_MONTHS.length - 1}
                style={{ padding: '5px 12px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '14px', fontWeight: 700, cursor: calPage === CAL_MONTHS.length - 1 ? 'default' : 'pointer', color: calPage === CAL_MONTHS.length - 1 ? '#CCC' : INK }}
              >&rarr;</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${RULE}` }}>
              {WEEKDAY_LABELS.map(d => (
                <div key={d} style={{ textAlign: 'center', padding: '5px 0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{d.charAt(0)}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {CAL_MONTHS[calPage] && buildCalendar(CAL_MONTHS[calPage].year, CAL_MONTHS[calPage].month).map((day, idx) => renderCalCell(day, idx))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '10px' }}>
            {CAL_MONTHS.map((_, i) => (
              <button key={i} onClick={() => { setCalPage(i); setSelectedDate(null); }} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: calPage === i ? TC : '#CCC', border: 'none', cursor: 'pointer', padding: 0 }} />
            ))}
          </div>
        </div>
      ) : (
        /* Desktop: 3-month grid */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          {CAL_MONTHS.slice(1, 4).map(({ year, month, label }) => {
            const calDays = buildCalendar(year, month);
            return (
              <div key={`${year}-${month}`} style={{ backgroundColor: '#FFFFFF', border: `1px solid ${RULE}` }}>
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
        {wtCourses.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '10px', height: '10px', flexShrink: 0, display: 'inline-block', backgroundColor: c.color }} />
            <span style={{ fontFamily: 'monospace', fontSize: '10px', color: MUTED }}>{c.id}</span>
          </div>
        ))}
        {hbCourses.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '10px', height: '10px', backgroundColor: '#E2DFD9', display: 'inline-block' }} />
            <span style={{ fontSize: '10px', color: MUTED }}>HB drop-in</span>
          </div>
        )}
      </div>
    </div>
  );
}
