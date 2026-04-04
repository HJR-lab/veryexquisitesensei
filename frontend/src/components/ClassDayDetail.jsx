import { useNavigate } from 'react-router-dom';

// ─── Design tokens ───────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

const DN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDateShort(d) {
  return `${DN[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()]}`;
}

export default function ClassDayDetail({
  selectedDate,
  setSelectedDate,
  dayClasses,
  isMobile,
  getClassCategory,
  wtCourses,
  loadingMembers,
  classMembers,
  handleOpenAddStudentModal,
  handleOpenEditClassModal,
  handleDeleteClass,
  handleOpenPostponeModal,
  renderDayDetailMemberTable,
}) {
  return (
    <div style={{ marginTop: '24px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span>{fmtDateShort(selectedDate)}</span>
        <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: MUTED }}>— {dayClasses.length} class{dayClasses.length !== 1 ? 'es' : ''}</span>
        <button onClick={() => setSelectedDate(null)} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', fontSize: '10px', color: MUTED, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Close &#10005;</button>
      </div>

      {dayClasses.length === 0 ? (
        <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', padding: '24px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No classes scheduled.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(dayClasses.length, 2)}, 1fr)`, gap: '12px' }}>
          {dayClasses.map((classInstance, i) => {
            const isWT = getClassCategory(classInstance.class_type) !== 'handbuilding';
            const courseIdx = wtCourses.findIndex(c => c.id === classInstance.baseCourseIdentifier);
            const color = isWT && courseIdx >= 0 ? wtCourses[courseIdx].color : '#888';
            const booked = classInstance.bookingCount || 0;
            const cap    = classInstance.max_capacity || 10;
            const isCancelled = classInstance.status === 'cancelled' || classInstance.instructorUnavailable;

            return (
              <div key={classInstance.id} style={{ border: `1px solid ${isCancelled ? '#E8A0A0' : RULE}`, borderLeft: `3px solid ${isCancelled ? '#D93025' : color}`, backgroundColor: isCancelled ? '#FDF2F2' : '#FFFFFF', opacity: isCancelled ? 0.85 : 1 }}>
                {/* Cancelled banner */}
                {isCancelled && (
                  <div style={{ padding: '6px 14px', backgroundColor: '#FDECEA', borderBottom: `1px solid #E8A0A0`, fontSize: '11px', fontWeight: 700, color: '#D93025', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    ✕ Cancelled{classInstance.cancellation_reason ? ` — ${classInstance.cancellation_reason}` : ''}
                  </div>
                )}
                {/* Class header */}
                <div style={{ padding: '14px 14px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, marginBottom: '3px', textDecoration: isCancelled ? 'line-through' : 'none', color: isCancelled ? MUTED : undefined }}>{classInstance.fullCourseIdentifier || classInstance.baseCourseIdentifier}</div>
                    <div style={{ fontSize: '11px', color: MUTED }}>
                      {classInstance.start_time} – {classInstance.end_time} · {classInstance.instructor}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '3px', color: booked >= cap ? '#D93025' : INK }}>{booked}/{cap}</div>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => { handleOpenAddStudentModal(classInstance.id); }}
                        style={{ fontSize: '9px', padding: '3px 8px', border: 'none', backgroundColor: TC, color: '#FFF', cursor: 'pointer', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                      >
                        + Add
                      </button>
                      <button
                        onClick={() => handleOpenEditClassModal(classInstance)}
                        style={{ fontSize: '9px', padding: '3px 8px', border: `1px solid ${RULE}`, backgroundColor: '#FFF', color: INK, cursor: 'pointer', fontWeight: 700 }}
                      >
                        Edit
                      </button>
                      {isWT && handleOpenPostponeModal && (
                        <button
                          onClick={() => handleOpenPostponeModal(classInstance)}
                          style={{ fontSize: '9px', padding: '3px 8px', border: 'none', backgroundColor: '#FFF7E6', color: '#9E6200', cursor: 'pointer', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}
                        >
                          Postpone
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteClass(classInstance.id, classInstance.class_type)}
                        disabled={booked > 0}
                        style={{ fontSize: '9px', padding: '3px 8px', border: 'none', backgroundColor: booked > 0 ? '#EEE' : '#FDECEA', color: booked > 0 ? '#CCC' : '#D93025', cursor: booked > 0 ? 'not-allowed' : 'pointer', fontWeight: 700 }}
                      >
                        Del
                      </button>
                    </div>
                  </div>
                </div>

                {/* Member table */}
                {loadingMembers[classInstance.id] ? (
                  <div style={{ padding: '12px 14px', fontSize: '11px', color: MUTED }}>Loading students…</div>
                ) : classMembers[classInstance.id] ? (
                  renderDayDetailMemberTable(classInstance)
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
