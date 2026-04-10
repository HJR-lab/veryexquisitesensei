import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { instructorAPI } from '../utils/api';
import ClassCalendarGrid from '../components/ClassCalendarGrid';

const MAKEUP_COLOR = '#5A2D82';
const ABSENT_COLOR = '#9E6200';
import {
  TC, TC_LIGHT, TC_DARK, INK, MUTED, RULE, ALT,
  SectionLabel, Divider, TopBar, BottomTabBar, ScrollBody, PageShell,
  ClassRow, Avatar, formatDateParts, formatTime,
} from '../components/SharedUI';

const INSTRUCTOR_TABS = [
  { id: 'home',      label: 'Home',      icon: 'home',           href: '/'             },
  { id: 'classes',    label: 'Classes',   icon: 'calendar_month', href: '/my-classes'   },
  { id: 'portfolio',  label: 'Portfolio',  icon: 'photo_library',  href: '/my-portfolio' },
  { id: 'account',    label: 'Account',   icon: 'person',         href: '/account'      },
];

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getCalMonths() {
  const today = new Date();
  const months = [];
  for (let i = -1; i <= 3; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth(), label: `${MN[d.getMonth()]} ${d.getFullYear()}` });
  }
  return months;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function InstructorDashboard() {
  const location = useLocation();
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedClass, setExpandedClass] = useState(null);
  const [showRecentClasses, setShowRecentClasses] = useState(false);
  const [markingAttendance, setMarkingAttendance] = useState({});

  // Calendar state
  const [calPage, setCalPage] = useState(1);
  const [selectedDate, setSelectedDate] = useState(null);

  // Day detail — students loaded on demand
  const [dayStudents, setDayStudents] = useState({}); // classId -> students[]
  const [loadingStudents, setLoadingStudents] = useState({});
  const [expandedDayClass, setExpandedDayClass] = useState(null);

  // Notes state
  const [classNotes, setClassNotes] = useState({}); // classId -> notes[]
  const [noteInput, setNoteInput] = useState({}); // classId -> string
  const [studentNoteOpen, setStudentNoteOpen] = useState(null); // bookingId
  const [studentNotes, setStudentNotes] = useState({}); // bookingId -> { id, content }
  const [studentNoteInput, setStudentNoteInput] = useState({}); // bookingId -> string

  // Cancel modal state
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);


  const handleMarkAttendance = useCallback(async (bookingId, attended) => {
    setMarkingAttendance(prev => ({ ...prev, [bookingId]: true }));
    try {
      await instructorAPI.markAttendance(bookingId, attended);
      const result = await instructorAPI.getDashboard();
      setData(result);
      // Refresh students for the class that was updated
      if (expandedDayClass) {
        const res = await instructorAPI.getClassStudents(expandedDayClass);
        setDayStudents(prev => ({ ...prev, [expandedDayClass]: res.students || [] }));
      }
    } catch (error) {
      console.error('Error marking attendance:', error);
    } finally {
      setMarkingAttendance(prev => ({ ...prev, [bookingId]: false }));
    }
  }, [expandedDayClass]);

  useEffect(() => { fetchDashboard(); }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const result = await instructorAPI.getDashboard();
      setData(result);
      // Populate student notes from dashboard data
      const noteMap = {};
      Object.values(result.studentsByClass || {}).forEach(students => {
        students.forEach(s => { if (s.note) noteMap[s.bookingId] = s.note; });
      });
      if (Object.keys(noteMap).length > 0) setStudentNotes(prev => ({ ...prev, ...noteMap }));
    } catch (error) {
      console.error('Error fetching instructor dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getUniqueStudents = () => {
    if (!data?.studentsByClass) return [];
    const seen = new Map();
    Object.values(data.studentsByClass).forEach(students => {
      students.forEach(s => { if (!seen.has(s.id)) seen.set(s.id, s); });
    });
    return Array.from(seen.values());
  };

  // Load students for a class on click
  const toggleDayClass = async (classId) => {
    if (expandedDayClass === classId) {
      setExpandedDayClass(null);
      return;
    }
    setExpandedDayClass(classId);
    if (!dayStudents[classId]) {
      setLoadingStudents(prev => ({ ...prev, [classId]: true }));
      try {
        const res = await instructorAPI.getClassStudents(classId);
        setDayStudents(prev => ({ ...prev, [classId]: res.students || [] }));
        // Load student notes from response
        const noteMap = {};
        (res.students || []).forEach(s => { if (s.note) noteMap[s.bookingId] = s.note; });
        setStudentNotes(prev => ({ ...prev, ...noteMap }));
      } catch (error) {
        console.error('Error loading students:', error);
        setDayStudents(prev => ({ ...prev, [classId]: [] }));
      } finally {
        setLoadingStudents(prev => ({ ...prev, [classId]: false }));
      }
    }
    if (!classNotes[classId]) {
      try {
        const notesRes = await instructorAPI.getClassNotes(classId);
        setClassNotes(prev => ({ ...prev, [classId]: notesRes.notes || [] }));
      } catch (e) { console.error(e); }
    }
  };

  const handleCancelClass = async () => {
    if (!cancelTarget || !cancelReason.trim()) return;
    setCancelling(true);
    try {
      await instructorAPI.cancelClass(cancelTarget.id, cancelReason.trim());
      setCancelTarget(null);
      setCancelReason('');
      const result = await instructorAPI.getDashboard();
      setData(result);
      setDayStudents({});
      setExpandedDayClass(null);
    } catch (error) {
      console.error('Error cancelling class:', error);
      alert(error.response?.data?.error || 'Failed to cancel class');
    } finally {
      setCancelling(false);
    }
  };


  if (loading) {
    return (
      <PageShell>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <span style={{ fontSize: '13px', color: MUTED, letterSpacing: '0.06em' }}>Loading…</span>
        </div>
      </PageShell>
    );
  }

  const instructor = data?.instructor || {};
  const upcomingClasses = data?.upcomingClasses || [];
  const recentClasses = data?.recentClasses || [];
  const allClasses = data?.allClasses || [];
  const studentsByClass = data?.studentsByClass || {};
  const recentStudentsByClass = data?.recentStudentsByClass || {};
  const portfolio = data?.portfolio || [];
  const uniqueStudents = getUniqueStudents();

  const totalUpcoming = upcomingClasses.length;
  const totalStudents = uniqueStudents.length;
  const nextClass = upcomingClasses[0];

  const activeTabId = location.pathname === '/my-portfolio' ? 'portfolio'
    : location.pathname === '/my-classes' ? 'classes'
    : location.pathname === '/account' ? 'account'
    : 'home';

  // ── Calendar helpers ───────────────────────────────────────────────────────
  const CAL_MONTHS = getCalMonths();
  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);

  const getEventsForDay = (date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return allClasses.filter(c => c.class_date?.startsWith(dateStr));
  };

  function renderCalCell(day, idx) {
    if (!day) {
      return <div key={`pad-${idx}`} style={{ minHeight: '50px', borderRight: idx % 7 < 6 ? `1px solid ${RULE}` : 'none', borderBottom: `1px solid ${RULE}`, backgroundColor: '#F9F9F8' }} />;
    }
    const isToday    = sameDay(day, TODAY);
    const isSelected = selectedDate && sameDay(day, selectedDate);
    const events     = getEventsForDay(day);
    const hasEvents  = events.length > 0;
    const dayStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    return (
      <div
        key={day.toISOString()}
        onClick={() => {
          if (hasEvents || isSelected) {
            setSelectedDate(isSelected ? null : day);
            setExpandedDayClass(null);
          }
        }}
        style={{
          minHeight: '50px',
          borderRight: idx % 7 < 6 ? `1px solid ${RULE}` : 'none',
          borderBottom: `1px solid ${RULE}`,
          padding: '4px 3px',
          cursor: hasEvents ? 'pointer' : 'default',
          backgroundColor: isSelected ? TC_LIGHT : isToday ? '#FFFDF4' : '#FFFFFF',
          transition: 'background-color 0.1s',
        }}
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
          {events.map((ev, j) => (
            <span key={j} style={{ width: '7px', height: '7px', display: 'inline-block', backgroundColor: ev.status === 'cancelled' ? '#C03030' : ev.class_type?.startsWith('HB') ? '#B8B3AB' : TC }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Student row renderer (shared between home & classes tabs) ─────────────
  const renderStudentRow = (s, j) => {
    const isMakeup = s.bookingType === 'makeup';
    const isRescheduled = s.bookingStatus === 'rescheduled' || s.bookingStatus === 'absent';
    const isAbsent = s.attended === false && !isRescheduled;
    const isCompleted = s.bookingStatus === 'completed';
    const rowBg = (isAbsent || isRescheduled) ? '#FFFBF0' : isMakeup ? '#FAF8FF' : '#FFFFFF';
    const nameColor = (isAbsent || isRescheduled) ? ABSENT_COLOR : isMakeup ? MAKEUP_COLOR : TC_DARK;
    const noteOpen = studentNoteOpen === s.bookingId;
    const hasNote = !!(studentNotes[s.bookingId]?.content || studentNoteInput[s.bookingId]);

    return (
      <div key={s.bookingId || j}>
        <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 90px 44px 44px 70px', padding: '8px 12px', borderTop: `1px solid ${RULE}`, backgroundColor: rowBg, alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: MUTED, fontWeight: 600 }}>{isRescheduled ? '' : s._n + '.'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: nameColor }}>{s.first_name} {s.last_name}</span>
            {s.isWt3Course && <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', backgroundColor: TC_LIGHT, color: s.wheelPreference ? TC_DARK : MUTED, borderRadius: '3px' }}>{s.wheelPreference ? `W${s.wheelPreference}` : 'W—'}</span>}
          </div>
          <div>
            {isRescheduled ? <span style={{ fontSize: '10px', color: ABSENT_COLOR, fontWeight: 600 }}>Resched.</span> : isAbsent ? <span style={{ fontSize: '10px', color: ABSENT_COLOR, fontWeight: 600 }}>Absent</span> : isMakeup ? <span style={{ fontSize: '10px', color: MAKEUP_COLOR, fontWeight: 600 }}>Makeup</span> : <span style={{ fontSize: '10px', color: MUTED }}>Enrolled</span>}
            {isMakeup && s.courseIdentifier && <div style={{ fontSize: '8px', color: MAKEUP_COLOR, marginTop: '1px' }}>{s.courseIdentifier}</div>}
          </div>
          <div style={{ textAlign: 'center' }}><span style={{ fontSize: '10px', fontWeight: 700, color: '#FFFFFF', backgroundColor: s.orderCount >= 4 ? TC_DARK : s.orderCount >= 2 ? TC : MUTED, padding: '1px 5px' }}>{s.orderCount || 0}</span></div>
          <div style={{ textAlign: 'center' }}><span style={{ fontSize: '11px', fontWeight: 600, color: INK }}>{s.classesAttended || 0}</span><span style={{ fontSize: '10px', color: MUTED }}>/{s.totalClasses || '?'}</span></div>
          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', alignItems: 'center' }}>
            {isRescheduled ? (
              <span style={{ fontSize: '9px', color: MUTED, fontStyle: 'italic' }}>—</span>
            ) : isAbsent ? (
              <button
                onClick={(e) => { e.stopPropagation(); handleMarkAttendance(s.bookingId, true); }}
                disabled={markingAttendance[s.bookingId]}
                style={{ fontSize: '13px', fontWeight: 700, padding: '3px 8px', border: 'none', cursor: 'pointer', backgroundColor: '#FFF3E0', color: '#C03030' }}
                title="Absent — click to mark attended"
              >✕</button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); handleMarkAttendance(s.bookingId, false); }}
                disabled={markingAttendance[s.bookingId]}
                style={{ fontSize: '13px', fontWeight: 700, padding: '3px 8px', border: 'none', cursor: 'pointer', backgroundColor: (isCompleted || s.attended) ? '#E8F5E9' : '#F0F7F0', color: '#2E7D32' }}
                title={isCompleted || s.attended ? 'Attended — click to mark absent' : 'Click to mark absent'}
              >✓</button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setStudentNoteOpen(noteOpen ? null : s.bookingId); }}
              style={{ fontSize: '13px', padding: '2px 4px', border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: hasNote ? TC : '#CCC' }}
              title="Student note"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>{hasNote ? 'edit_note' : 'note_add'}</span>
            </button>
          </div>
        </div>
        {noteOpen && (
          <div style={{ padding: '4px 12px 8px', backgroundColor: rowBg, borderTop: `1px dashed ${RULE}` }}>
            <textarea
              value={studentNoteInput[s.bookingId] ?? (studentNotes[s.bookingId]?.content || '')}
              onChange={e => setStudentNoteInput(prev => ({ ...prev, [s.bookingId]: e.target.value }))}
              onBlur={async () => {
                const val = (studentNoteInput[s.bookingId] ?? '').trim();
                const existing = studentNotes[s.bookingId];
                if (existing && val === existing.content) return;
                if (!val && existing?.id) {
                  await instructorAPI.deleteNote(existing.id);
                  setStudentNotes(prev => ({ ...prev, [s.bookingId]: null }));
                } else if (val && existing?.id) {
                  await instructorAPI.updateNote(existing.id, val);
                  setStudentNotes(prev => ({ ...prev, [s.bookingId]: { ...existing, content: val } }));
                } else if (val) {
                  const res = await instructorAPI.addNote({ studentId: s.id, bookingId: s.bookingId, noteType: 'student', content: val });
                  setStudentNotes(prev => ({ ...prev, [s.bookingId]: res.note }));
                }
              }}
              placeholder={`Note for ${s.first_name}…`}
              rows={1}
              style={{ width: '100%', padding: '5px 8px', border: `1px solid ${RULE}`, fontSize: '11px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', color: INK }}
              autoFocus
            />
          </div>
        )}
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <PageShell>
      <TopBar />

      <ScrollBody>
        {/* ── GREETING ── */}
        <div style={{ padding: '32px 0 24px', borderBottom: `1px solid ${RULE}`, marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
            <Avatar src={instructor.profileImage} name={instructor.firstName} size={48} />
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1.05, margin: 0 }}>
                Hi {instructor.firstName || 'Instructor'}.
              </h1>
              <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TC_DARK, backgroundColor: TC_LIGHT, padding: '2px 6px', display: 'inline-block', marginTop: '4px' }}>
                Instructor
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: MUTED }}>
            {totalUpcoming > 0 && <span><strong style={{ color: INK }}>{totalUpcoming}</strong> upcoming class{totalUpcoming !== 1 ? 'es' : ''}</span>}
            {totalStudents > 0 && <span><strong style={{ color: INK }}>{totalStudents}</strong> student{totalStudents !== 1 ? 's' : ''}</span>}
          </div>
          {nextClass && (
            <div style={{ fontSize: '13px', color: MUTED, marginTop: '6px' }}>
              Next: <strong style={{ color: INK }}>{(() => { const p = formatDateParts(nextClass.class_date); return `${p.dayAbbr} ${p.dayNum} ${p.month}`; })()}</strong>, {formatTime(nextClass.start_time)}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════
            CLASSES TAB — Single-month calendar + day detail with students
           ═══════════════════════════════════════════════════════════════════════ */}
        {activeTabId === 'classes' ? (
          <>
            {/* Always single-month with arrows — force isMobile */}
            <section style={{ marginBottom: '20px' }}>
              <ClassCalendarGrid
                isMobile={true}
                calPage={calPage}
                setCalPage={setCalPage}
                CAL_MONTHS={CAL_MONTHS}
                selectedDate={selectedDate}
                setSelectedDate={(d) => { setSelectedDate(d); setExpandedDayClass(null); }}
                TODAY={TODAY}
                getEventsForDay={getEventsForDay}
                wtCourses={[]}
                hbCourses={allClasses.some(c => c.class_type?.startsWith('HB')) ? [{ shortLabel: 'HB' }] : []}
                renderCalCell={renderCalCell}
              />
            </section>

            {/* Day detail — classes + expandable student lists + cancel */}
            {selectedDate && (() => {
              const dayClasses = getEventsForDay(selectedDate);
              const toLocalStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              const selectedStr = toLocalStr(selectedDate);
              const todayStr = toLocalStr(new Date());
              const { dayAbbr, dayNum, month } = formatDateParts(selectedStr);
              const isFuture = selectedStr >= todayStr;

              return (
                <section style={{ marginBottom: '28px' }}>
                  <SectionLabel>{dayAbbr} {dayNum} {month}</SectionLabel>
                  {dayClasses.length === 0 ? (
                    <p style={{ fontSize: '13px', color: MUTED }}>No classes on this day.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {dayClasses.map(cls => {
                        const isCancelled = cls.status === 'cancelled';
                        const isExpanded = expandedDayClass === cls.id;
                        const students = dayStudents[cls.id] || [];
                        const isLoading = loadingStudents[cls.id];

                        return (
                          <div key={cls.id} style={{ border: `1px solid ${isCancelled ? '#F0C0C0' : RULE}`, backgroundColor: isCancelled ? '#FFF5F5' : '#FFFFFF' }}>
                            {/* Class header — clickable to expand students */}
                            <div
                              onClick={() => !isCancelled && toggleDayClass(cls.id)}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', cursor: isCancelled ? 'default' : 'pointer', opacity: isCancelled ? 0.7 : 1 }}
                            >
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: isCancelled ? '#C03030' : INK, textDecoration: isCancelled ? 'line-through' : 'none' }}>
                                  {cls.class_type}
                                </div>
                                <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>
                                  {formatTime(cls.start_time)} – {formatTime(cls.end_time)}
                                  {!isCancelled && (() => { const all = dayStudents[cls.id]; const cnt = all ? all.filter(s => s.bookingStatus !== 'absent' && s.bookingStatus !== 'rescheduled').length : cls.current_enrollment; return cnt > 0 ? <span> · {cnt} student{cnt !== 1 ? 's' : ''}</span> : null; })()}
                                </div>
                                {isCancelled && cls.cancellation_reason && (
                                  <div style={{ fontSize: '11px', color: '#C03030', marginTop: '4px' }}>Reason: {cls.cancellation_reason}</div>
                                )}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                {isFuture && !isCancelled && cls.class_type?.startsWith('HB') && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setCancelTarget(cls); setCancelReason(''); }}
                                    style={{ padding: '6px 10px', border: '1px solid #F0C0C0', backgroundColor: '#FFF5F5', cursor: 'pointer', fontSize: '9px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#C03030' }}
                                  >
                                    Cancel
                                  </button>
                                )}
                                {isCancelled ? (
                                  isFuture ? (
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (!confirm('Reinstate this class?')) return;
                                        try {
                                          await instructorAPI.reinstateClass(cls.id);
                                          const result = await instructorAPI.getDashboard();
                                          setData(result);
                                          setDayStudents({});
                                          setExpandedDayClass(null);
                                        } catch (err) {
                                          alert(err.response?.data?.error || 'Failed to reinstate');
                                        }
                                      }}
                                      style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '5px 10px', border: `1px solid ${TC}`, backgroundColor: TC_LIGHT, color: TC_DARK, cursor: 'pointer' }}
                                    >Reinstate</button>
                                  ) : (
                                    <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 8px', backgroundColor: '#FDEAEA', color: '#C03030' }}>Cancelled</span>
                                  )
                                ) : (
                                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: MUTED, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>expand_more</span>
                                )}
                              </div>
                            </div>

                            {/* Expanded student list */}
                            {isExpanded && !isCancelled && (
                              <div style={{ borderTop: `1px solid ${RULE}` }}>
                                {isLoading ? (
                                  <div style={{ padding: '12px 16px', fontSize: '12px', color: MUTED }}>Loading students…</div>
                                ) : students.length === 0 ? (
                                  <div style={{ padding: '12px 16px', fontSize: '12px', color: MUTED }}>No students booked.</div>
                                ) : (
                                  <div>
                                    {/* Class Notes — editable textarea */}
                                    <div style={{ padding: '8px 12px', borderBottom: `1px solid ${RULE}` }}>
                                      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '4px' }}>Notes</div>
                                      <textarea
                                        value={noteInput[cls.id] ?? (classNotes[cls.id]?.[0]?.content || '')}
                                        onChange={e => setNoteInput(prev => ({ ...prev, [cls.id]: e.target.value }))}
                                        onBlur={async () => {
                                          const val = (noteInput[cls.id] ?? '').trim();
                                          const existing = classNotes[cls.id]?.[0];
                                          if (existing && val === existing.content) return;
                                          if (!val && existing) {
                                            await instructorAPI.deleteNote(existing.id);
                                            setClassNotes(prev => ({ ...prev, [cls.id]: [] }));
                                          } else if (val && existing) {
                                            await instructorAPI.updateNote(existing.id, val);
                                            setClassNotes(prev => ({ ...prev, [cls.id]: [{ ...existing, content: val }] }));
                                          } else if (val && !existing) {
                                            const res = await instructorAPI.addNote({ classInstanceId: cls.id, noteType: 'class', content: val });
                                            setClassNotes(prev => ({ ...prev, [cls.id]: [res.note] }));
                                          }
                                        }}
                                        placeholder="Add class notes…"
                                        rows={2}
                                        style={{ width: '100%', padding: '6px 8px', border: `1px solid ${RULE}`, fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', color: INK }}
                                      />
                                    </div>
                                    {/* Table header */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 90px 44px 44px 70px', backgroundColor: ALT, padding: '6px 12px' }}>
                                      <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>#</span>
                                      <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>Student</span>
                                      <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>Type</span>
                                      <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, textAlign: 'center' }}>Ord.</span>
                                      <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, textAlign: 'center' }}>Prog.</span>
                                      <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, textAlign: 'right' }}>Attend.</span>
                                    </div>
                                    {[...students].sort((a, b) => {
                                      const absentA = (a.bookingStatus === 'absent' || a.bookingStatus === 'rescheduled' || a.attended === false) ? 1 : 0;
                                      const absentB = (b.bookingStatus === 'absent' || b.bookingStatus === 'rescheduled' || b.attended === false) ? 1 : 0;
                                      if (absentA !== absentB) return absentA - absentB;
                                      const typeA = a.bookingType === 'makeup' ? 1 : 0;
                                      const typeB = b.bookingType === 'makeup' ? 1 : 0;
                                      if (typeA !== typeB) return typeA - typeB;
                                      const ordDiff = (b.orderCount || 0) - (a.orderCount || 0);
                                      if (ordDiff !== 0) return ordDiff;
                                      return (a.first_name + ' ' + a.last_name).localeCompare(b.first_name + ' ' + b.last_name);
                                    }).reduce((acc, s) => { s._n = (s.bookingStatus === 'rescheduled' || s.bookingStatus === 'absent') ? 0 : (acc.n = (acc.n || 0) + 1, acc.n); acc.list.push(s); return acc; }, { list: [] }).list.map(renderStudentRow)}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })()}
          </>
        ) : (
          <>
            {/* ═══════════════════════════════════════════════════════════════════
                HOME TAB — Upcoming classes with inline student roster
               ═══════════════════════════════════════════════════════════════════ */}
            <section style={{ marginBottom: '28px' }}>
              <SectionLabel>
                Upcoming Classes{totalUpcoming > 0 && <span style={{ color: '#CCC', fontWeight: 400, marginLeft: '4px' }}>{totalUpcoming}</span>}
              </SectionLabel>

              {upcomingClasses.length === 0 ? (
                <p style={{ fontSize: '13px', color: MUTED, padding: '16px 0' }}>No upcoming classes scheduled.</p>
              ) : (
                <div>
                  {upcomingClasses.map((cls, i) => {
                    const students = studentsByClass[cls.id] || [];
                    const isExpanded = expandedClass === cls.id;
                    return (
                      <ClassRow
                        key={cls.id}
                        dateStr={cls.class_date}
                        classType={cls.class_type}
                        subtitle={cls.class_type}
                        startTime={cls.start_time}
                        endTime={cls.end_time}
                        isLast={i === upcomingClasses.length - 1 && !isExpanded}
                        onClick={() => setExpandedClass(isExpanded ? null : cls.id)}
                        rightContent={
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            {(() => { const active = students.filter(s => s.bookingStatus !== 'absent' && s.bookingStatus !== 'rescheduled' && s.attended !== false); return (
                            <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 8px', backgroundColor: active.length > 0 ? TC_LIGHT : ALT, color: active.length > 0 ? TC_DARK : MUTED }}>
                              {active.length} student{active.length !== 1 ? 's' : ''}
                            </span>); })()}
                            <span className="material-symbols-outlined" style={{ fontSize: '16px', color: MUTED, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>expand_more</span>
                          </div>
                        }
                      >
                        {isExpanded && (
                          <div style={{ borderBottom: `1px solid ${RULE}`, marginBottom: '4px' }}>
                            {students.length === 0 ? (
                              <div style={{ fontSize: '12px', color: MUTED, padding: '10px 0' }}>No students booked yet.</div>
                            ) : (
                              <div style={{ border: `1px solid ${RULE}`, marginTop: '4px', marginBottom: '8px' }}>
                                {/* Class Notes — editable textarea */}
                                <div style={{ padding: '8px 12px', borderBottom: `1px solid ${RULE}` }}>
                                  <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '4px' }}>Notes</div>
                                  <textarea
                                    value={noteInput[cls.id] ?? (classNotes[cls.id]?.[0]?.content || '')}
                                    onChange={e => setNoteInput(prev => ({ ...prev, [cls.id]: e.target.value }))}
                                    onFocus={() => {
                                      if (!classNotes[cls.id]) {
                                        instructorAPI.getClassNotes(cls.id).then(notesRes => {
                                          setClassNotes(prev => ({ ...prev, [cls.id]: notesRes.notes || [] }));
                                          if (notesRes.notes?.[0] && noteInput[cls.id] === undefined) {
                                            setNoteInput(prev => ({ ...prev, [cls.id]: notesRes.notes[0].content }));
                                          }
                                        }).catch(e => console.error(e));
                                      }
                                    }}
                                    onBlur={async () => {
                                      const val = (noteInput[cls.id] ?? '').trim();
                                      const existing = classNotes[cls.id]?.[0];
                                      if (existing && val === existing.content) return;
                                      if (!val && existing) {
                                        await instructorAPI.deleteNote(existing.id);
                                        setClassNotes(prev => ({ ...prev, [cls.id]: [] }));
                                      } else if (val && existing) {
                                        await instructorAPI.updateNote(existing.id, val);
                                        setClassNotes(prev => ({ ...prev, [cls.id]: [{ ...existing, content: val }] }));
                                      } else if (val && !existing) {
                                        const res = await instructorAPI.addNote({ classInstanceId: cls.id, noteType: 'class', content: val });
                                        setClassNotes(prev => ({ ...prev, [cls.id]: [res.note] }));
                                      }
                                    }}
                                    placeholder="Add class notes…"
                                    rows={2}
                                    style={{ width: '100%', padding: '6px 8px', border: `1px solid ${RULE}`, fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', color: INK }}
                                  />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 44px 44px 70px', backgroundColor: ALT, padding: '6px 12px' }}>
                                  <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>Student</span>
                                  <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED }}>Type</span>
                                  <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, textAlign: 'center' }}>Ord.</span>
                                  <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, textAlign: 'center' }}>Prog.</span>
                                  <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, textAlign: 'right' }}>Attend.</span>
                                </div>
                                {[...students].sort((a, b) => {
                                  const typeA = a.bookingType === 'makeup' ? 1 : 0;
                                  const typeB = b.bookingType === 'makeup' ? 1 : 0;
                                  if (typeA !== typeB) return typeA - typeB;
                                  const ordDiff = (b.orderCount || 0) - (a.orderCount || 0);
                                  if (ordDiff !== 0) return ordDiff;
                                  return (a.first_name + ' ' + a.last_name).localeCompare(b.first_name + ' ' + b.last_name);
                                }).reduce((acc, s) => { s._n = (s.bookingStatus === 'rescheduled' || s.bookingStatus === 'absent') ? 0 : (acc.n = (acc.n || 0) + 1, acc.n); acc.list.push(s); return acc; }, { list: [] }).list.map(renderStudentRow)}
                              </div>
                            )}
                          </div>
                        )}
                      </ClassRow>
                    );
                  })}
                </div>
              )}
            </section>

            <Divider />

            {/* ── RECENT CLASSES ── */}
            {recentClasses.length > 0 && (
              <>
                <section style={{ marginBottom: '28px' }}>
                  <button onClick={() => setShowRecentClasses(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: showRecentClasses ? '14px' : 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{showRecentClasses ? 'expand_less' : 'expand_more'}</span>
                    Recent Classes ({recentClasses.length})
                  </button>
                  {showRecentClasses && (
                    <div>
                      {recentClasses.map((cls, i) => {
                        const students = recentStudentsByClass[cls.id] || [];
                        return <ClassRow key={cls.id} dateStr={cls.class_date} classType={cls.class_type} startTime={cls.start_time} dimmed isLast={i === recentClasses.length - 1} badge={{ label: `${students.length} student${students.length !== 1 ? 's' : ''}`, bg: '#EBEBEB', color: MUTED }} />;
                      })}
                    </div>
                  )}
                </section>
                <Divider />
              </>
            )}

            {/* ── MY STUDENTS ── */}
            <section style={{ marginBottom: '28px' }}>
              <SectionLabel>My Students{uniqueStudents.length > 0 && <span style={{ color: '#CCC', fontWeight: 400, marginLeft: '4px' }}>{uniqueStudents.length}</span>}</SectionLabel>
              {uniqueStudents.length === 0 ? (
                <p style={{ fontSize: '13px', color: MUTED, padding: '16px 0' }}>No students in upcoming classes.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {uniqueStudents.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', backgroundColor: ALT }}>
                      <Avatar src={s.profile_image} name={s.first_name} size={22} />
                      <span style={{ fontSize: '12px', fontWeight: 500 }}>{s.first_name} {s.last_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <Divider />

            {/* ── PORTFOLIO ── */}
            <section style={{ marginBottom: '28px' }}>
              <SectionLabel action actionHref="/my-portfolio" actionLabel="Manage">My Portfolio</SectionLabel>
              {portfolio.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center' }}>
                  <p style={{ fontSize: '13px', color: MUTED, margin: '0 0 4px' }}>No portfolio items yet.</p>
                  <p style={{ fontSize: '12px', color: MUTED, margin: 0 }}>Share your work with the studio community.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                  {portfolio.slice(0, 9).map(item => (
                    <Link key={item.id} to="/my-portfolio" style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', backgroundColor: ALT, display: 'block', textDecoration: 'none' }}>
                      {item.media_url ? <img src={item.media_url} alt={item.title || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: '32px', color: '#CCC' }}>image</span></div>}
                    </Link>
                  ))}
                </div>
              )}
              <div style={{ marginTop: '12px' }}>
                <Link to="/my-portfolio" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '15px', border: 'none', cursor: 'pointer', backgroundColor: TC, color: '#FFFFFF', textDecoration: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', boxSizing: 'border-box' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>add_photo_alternate</span>
                  Add to Portfolio
                </Link>
              </div>
            </section>
            <Divider />
          </>
        )}
      </ScrollBody>

      {/* ── Cancel Class Modal ── */}
      {cancelTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => { if (!cancelling) { setCancelTarget(null); setCancelReason(''); } }}>
          <div style={{ backgroundColor: '#FFFFFF', width: '90%', maxWidth: '420px', padding: '24px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C03030', marginBottom: '16px' }}>Cancel Class</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: INK, marginBottom: '4px' }}>{cancelTarget.class_type}</div>
            <div style={{ fontSize: '12px', color: MUTED, marginBottom: '16px' }}>
              {(() => { const p = formatDateParts(cancelTarget.class_date); return `${p.dayAbbr} ${p.dayNum} ${p.month}`; })()}, {formatTime(cancelTarget.start_time)} – {formatTime(cancelTarget.end_time)}
              {cancelTarget.current_enrollment > 0 && <span style={{ color: '#C03030', fontWeight: 600 }}> · {cancelTarget.current_enrollment} student{cancelTarget.current_enrollment !== 1 ? 's' : ''} will be affected</span>}
            </div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED, marginBottom: '6px' }}>Reason for cancellation</label>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              onTouchEnd={e => { e.stopPropagation(); e.target.focus(); }}
              placeholder="e.g. Vacation, personal emergency, studio maintenance..."
              rows={4}
              style={{ width: '100%', padding: '12px', border: '2px solid #CCC', borderRadius: '6px', fontSize: '16px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setCancelTarget(null); setCancelReason(''); }} disabled={cancelling} style={{ padding: '10px 20px', border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', cursor: 'pointer', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED }}>Back</button>
              <button onClick={handleCancelClass} disabled={cancelling || !cancelReason.trim()} style={{ padding: '10px 20px', border: 'none', backgroundColor: cancelReason.trim() ? '#C03030' : '#DDD', cursor: cancelReason.trim() && !cancelling ? 'pointer' : 'not-allowed', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#FFFFFF', opacity: cancelling ? 0.7 : 1 }}>{cancelling ? 'Cancelling…' : 'Confirm Cancel'}</button>
            </div>
          </div>
        </div>
      )}

      <BottomTabBar tabs={INSTRUCTOR_TABS} activeId={activeTabId} />
    </PageShell>
  );
}
