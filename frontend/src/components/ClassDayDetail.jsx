import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

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
  handleToggleGlazing,
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
            const overCap = booked > cap;
            // A full class still accepts the one student an unused grant names —
            // the server re-checks that it is that student and no one else.
            const hasOpenGrant = (classInstance.capacityOverrides || []).some(o => !o.used);
            const addBlocked = booked >= cap && !hasOpenGrant;

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
                    <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '3px', color: overCap ? '#9E6200' : booked >= cap ? '#D93025' : INK }}>{booked}/{cap}</div>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => { handleOpenAddStudentModal(classInstance.id); }}
                        disabled={addBlocked}
                        style={{ fontSize: '9px', padding: '3px 8px', border: 'none', backgroundColor: addBlocked ? '#EEE' : TC, color: addBlocked ? '#CCC' : '#FFF', cursor: addBlocked ? 'not-allowed' : 'pointer', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                      >
                        + Add
                      </button>
                      <button
                        onClick={() => handleOpenEditClassModal(classInstance)}
                        style={{ fontSize: '9px', padding: '3px 8px', border: `1px solid ${RULE}`, backgroundColor: '#FFF', color: INK, cursor: 'pointer', fontWeight: 700 }}
                      >
                        Edit
                      </button>
                      {/* HB only: marking a handbuilding session as glazing is what
                          lets a 10-class package student book it as their glazing.
                          A WT cohort's final week is already glazing by structure. */}
                      {!isWT && handleToggleGlazing && (
                        <button
                          onClick={() => handleToggleGlazing(classInstance)}
                          title={classInstance.is_glazing
                            ? `Glazing class · up to ${classInstance.glazing_capacity ?? 4} of ${cap} places for glazing students`
                            : 'Mark as a glazing class so 10-class students can book it as their glazing'}
                          style={{ fontSize: '9px', padding: '3px 8px', border: `1px solid ${classInstance.is_glazing ? '#D4A800' : RULE}`, backgroundColor: classInstance.is_glazing ? '#D4A800' : '#FFF', color: classInstance.is_glazing ? '#FFF' : MUTED, cursor: 'pointer', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}
                        >
                          Glazing
                        </button>
                      )}
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

                {/* Capacity overrides — shown once the class is at cap, or whenever
                    a grant exists, so an 11/10 roster is never unexplained. */}
                {!isCancelled && (booked >= cap || (classInstance.capacityOverrides || []).length > 0) && (
                  <CapacityOverridePanel classInstance={classInstance} />
                )}

                {/* Class notes */}
                {classMembers[classInstance.id] && <ClassNotes classId={classInstance.id} />}

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

const AMBER      = '#9E6200';
const AMBER_BG   = '#FFF7E6';
const AMBER_RULE = '#E8C89A';

/**
 * Grant and display capacity overrides for one class instance.
 *
 * A grant is one seat, for one named student, in this class only — never a
 * raised limit. Existing grants are listed with who granted them and why, so a
 * roster reading 11/10 stays explained long after the exception was made.
 */
function CapacityOverridePanel({ classInstance }) {
  const [overrides, setOverrides] = useState(classInstance.capacityOverrides || []);
  const [open, setOpen]           = useState(false);
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState([]);
  const [picked, setPicked]       = useState(null);
  const [reason, setReason]       = useState('');
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState('');

  // Debounced student search — skipped entirely once someone is picked.
  useEffect(() => {
    if (!open || picked || query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/api/admin/students/search?q=${encodeURIComponent(query.trim())}`);
        setResults(res.data.students || []);
      } catch { setResults([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open, picked]);

  const reset = useCallback(() => {
    setOpen(false); setQuery(''); setResults([]); setPicked(null); setReason(''); setError('');
  }, []);

  const grant = useCallback(async () => {
    if (!picked || !reason.trim()) return;
    setBusy(true); setError('');
    try {
      const res = await api.post(`/api/admin/classes/${classInstance.id}/capacity-override`, {
        studentId: picked.id,
        reason: reason.trim(),
      });
      const o = res.data.override;
      setOverrides(prev => [...prev, {
        id: o.id,
        studentId: o.student_id,
        studentName: `${picked.first_name || ''} ${picked.last_name || ''}`.trim(),
        reason: o.reason,
        grantedBy: o.created_by,
        grantedAt: o.created_at,
        used: false,
      }]);
      reset();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to grant override');
    } finally {
      setBusy(false);
    }
  }, [picked, reason, classInstance.id, reset]);

  const withdraw = useCallback(async (id) => {
    setBusy(true); setError('');
    try {
      await api.delete(`/api/admin/capacity-overrides/${id}`);
      setOverrides(prev => prev.filter(o => o.id !== id));
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to withdraw override');
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div style={{ borderTop: `1px solid ${RULE}`, backgroundColor: overrides.length ? AMBER_BG : '#FFF', padding: '10px 14px' }}>
      {overrides.length > 0 && (
        <div style={{ marginBottom: open ? '10px' : '2px' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: AMBER, marginBottom: '6px' }}>
            Over capacity by exception
          </div>
          {overrides.map(o => (
            <div key={o.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '11px', color: INK, marginBottom: '5px' }}>
              <span style={{ flexShrink: 0, fontSize: '9px', fontWeight: 700, padding: '1px 5px', border: `1px solid ${AMBER_RULE}`, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {o.used ? 'Seated' : 'Granted'}
              </span>
              <span style={{ flex: 1, lineHeight: 1.45 }}>
                <strong>{o.studentName || `Student #${o.studentId}`}</strong> — {o.reason}
                <span style={{ color: MUTED }}> · {o.grantedBy}</span>
              </span>
              {!o.used && (
                <button onClick={() => withdraw(o.id)} disabled={busy}
                  style={{ flexShrink: 0, border: 'none', background: 'none', cursor: busy ? 'wait' : 'pointer', fontSize: '9px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Withdraw
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {open ? (
        <div>
          {picked ? (
            <div style={{ fontSize: '11px', marginBottom: '6px' }}>
              <strong>{picked.first_name} {picked.last_name}</strong> <span style={{ color: MUTED }}>{picked.email}</span>
              <button onClick={() => { setPicked(null); setQuery(''); }} style={{ marginLeft: '8px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '9px', color: MUTED, fontWeight: 700 }}>Change</button>
            </div>
          ) : (
            <>
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search student by name or email…"
                style={{ width: '100%', padding: '6px 8px', border: `1px solid ${RULE}`, fontSize: '11px', fontFamily: 'inherit', marginBottom: '6px' }}
              />
              {results.length > 0 && (
                <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFF', maxHeight: '120px', overflowY: 'auto', marginBottom: '6px' }}>
                  {results.map(s => (
                    <button key={s.id} onClick={() => setPicked(s)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', border: 'none', borderBottom: `1px solid ${RULE}`, background: 'none', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }}>
                      {s.first_name} {s.last_name} <span style={{ color: MUTED }}>{s.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Reason — recorded permanently (e.g. approved exception, sharing a wheel)"
            style={{ width: '100%', padding: '6px 8px', border: `1px solid ${RULE}`, fontSize: '11px', fontFamily: 'inherit', marginBottom: '6px' }}
          />

          {error && <div style={{ fontSize: '10px', color: '#D93025', marginBottom: '6px' }}>{error}</div>}

          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={grant} disabled={busy || !picked || !reason.trim()}
              style={{ fontSize: '9px', padding: '4px 10px', border: 'none', backgroundColor: (!picked || !reason.trim()) ? '#EEE' : AMBER, color: (!picked || !reason.trim()) ? '#CCC' : '#FFF', cursor: (busy || !picked || !reason.trim()) ? 'not-allowed' : 'pointer', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {busy ? 'Granting…' : 'Grant seat'}
            </button>
            <button onClick={reset} style={{ fontSize: '9px', padding: '4px 10px', border: `1px solid ${RULE}`, backgroundColor: '#FFF', color: INK, cursor: 'pointer', fontWeight: 700 }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)}
          style={{ fontSize: '9px', padding: '3px 8px', border: `1px solid ${AMBER_RULE}`, backgroundColor: '#FFF', color: AMBER, cursor: 'pointer', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          + Grant seat over cap
        </button>
      )}
    </div>
  );
}

function ClassNotes({ classId }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    api.get(`/admin/classes/${classId}/notes`).then(res => {
      const classNote = (res.data.notes || []).find(n => n.note_type === 'class');
      if (classNote) setNote(classNote.content || '');
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [classId]);

  const saveNote = useCallback(async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await api.post(`/admin/classes/${classId}/notes`, { content: note });
      setSavedAt(new Date());
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }, [classId, note]);

  if (!loaded) return null;

  return (
    <div style={{ padding: '10px 14px', borderTop: `1px solid ${RULE}` }}>
      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        Notes
        {savedAt && <span style={{ color: '#1E6B1E', fontWeight: 600, letterSpacing: 0, textTransform: 'none' }}>Saved</span>}
      </div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        onBlur={saveNote}
        placeholder="Add class notes…"
        style={{ width: '100%', minHeight: '48px', padding: '8px 10px', border: `1px solid ${RULE}`, fontSize: '12px', fontFamily: 'inherit', color: INK, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
      />
    </div>
  );
}
