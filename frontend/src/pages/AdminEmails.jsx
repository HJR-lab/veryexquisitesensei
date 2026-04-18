import { useState, useEffect } from 'react';

import api from '../utils/api';

// ─── Design tokens ────────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';
const GREEN    = '#1E6B1E';

// ─── Shared input style ───────────────────────────────────────────────────────
const inputSt = {
  width: '100%', padding: '9px 12px', border: `1px solid ${RULE}`,
  fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box',
  outline: 'none', color: INK,
};
const labelSt = {
  fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(str) {
  if (!str) return '—';
  return new Date(str).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AdminEmails() {
  // view: 'settings' | 'compose' | 'history'
  const [view,           setView]           = useState('settings');
  const [configs,        setConfigs]        = useState([]);
  const [courses,        setCourses]        = useState([]);
  const [history,        setHistory]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [waitlistData,   setWaitlistData]   = useState([]);
  const [sendingWaitlistId, setSendingWaitlistId] = useState(null);
  const [saveStatus,     setSaveStatus]     = useState(null); // null | 'saving' | 'saved' | 'error'
  const [statusMsg,      setStatusMsg]      = useState(null); // { type: 'success'|'error', text }
  const [expandedEmail,  setExpandedEmail]  = useState(null); // email id for expanded detail

  const showStatus = (type, text) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  // Compose state
  const [composeCourse,  setComposeCourse]  = useState(null); // courseIdentifier string
  const [draft,          setDraft]          = useState(null);
  const [draftLoading,   setDraftLoading]   = useState(false);
  const [sending,        setSending]        = useState(false);


  // ── Load all data on mount ──────────────────────────────────────────────────
  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cfgRes, coursesRes, histRes, wlRes] = await Promise.all([
        api.get('/admin/course-config'),
        api.get('/admin/course-emails'),
        api.get('/admin/course-emails/history'),
        api.get('/admin/waitlist').catch(() => ({ data: { waitlist: [] } })),
      ]);
      setWaitlistData(wlRes.data?.waitlist || []);
      setConfigs(cfgRes.data.configs || cfgRes.data || []);

      // Keep courses until their last class has passed. The backend already
      // applies this filter; this is a lightweight client-side safeguard.
      const now = new Date();
      const sgtNow = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
      const todayStr = sgtNow.toISOString().split('T')[0];
      const allCourses = coursesRes.data.courses || [];
      const filtered = allCourses.filter(c => {
        if (c.lastClassDate && c.lastClassDate < todayStr) return false;
        return true;
      });
      setCourses(filtered);
      setHistory(histRes.data.emails || []);
    } catch (err) {
      console.error('Failed to load emails data:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Config toggle ───────────────────────────────────────────────────────────
  const toggleAutoSend = async (cfg) => {
    const next = !cfg.email_auto_send;
    setSaveStatus('saving');
    try {
      await api.put(`/admin/course-config/${cfg.course_type_key}`, { email_auto_send: next });
      setConfigs(prev => prev.map(c =>
        c.course_type_key === cfg.course_type_key ? { ...c, email_auto_send: next } : c
      ));
      setSaveStatus('saved');
    } catch (err) {
      console.error('Failed to update config:', err);
      setSaveStatus('error');
    } finally {
      setTimeout(() => setSaveStatus(null), 2000);
    }
  };

  const updateDaysBefore = async (cfg, value) => {
    setSaveStatus('saving');
    try {
      await api.put(`/admin/course-config/${cfg.course_type_key}`, { email_send_days_before: parseInt(value) || 0 });
      setConfigs(prev => prev.map(c =>
        c.course_type_key === cfg.course_type_key ? { ...c, email_send_days_before: parseInt(value) || 0 } : c
      ));
      setSaveStatus('saved');
    } catch (err) {
      console.error('Failed to update config:', err);
      setSaveStatus('error');
    } finally {
      setTimeout(() => setSaveStatus(null), 2000);
    }
  };

  // ── Compose ─────────────────────────────────────────────────────────────────
  const openCompose = async (courseIdentifier) => {
    setDraftLoading(true);
    setComposeCourse(courseIdentifier);
    setView('compose');
    try {
      const { data } = await api.get(`/admin/course-emails/${courseIdentifier}/draft`);
      // Default all students selected
      setDraft({
        ...data,
        students: (data.students || []).map(s => ({ ...s, selected: true })),
        holidayExclusions: data.holidayExclusions || '',
        specialNotes: data.specialNotes || '',
        collectionStart: data.collectionStart || '',
        collectionEnd: data.collectionEnd || '',
        disposalDate: data.disposalDate || '',
      });
    } catch (err) {
      showStatus('error', err.response?.data?.error || 'Failed to load draft');
      setView('settings');
      setComposeCourse(null);
    } finally {
      setDraftLoading(false);
    }
  };

  const toggleStudent = (idx) => {
    setDraft(prev => {
      const students = [...prev.students];
      students[idx] = { ...students[idx], selected: !students[idx].selected };
      return { ...prev, students };
    });
  };

  const updateDraftField = (field, value) => {
    setDraft(prev => ({ ...prev, [field]: value }));
  };

  const handleSend = async () => {
    if (!draft) return;
    setSending(true);
    try {
      const recipientEmails = draft.students.filter(s => s.selected).map(s => s.email);
      await api.post(`/admin/course-emails/${composeCourse}/send`, {
        templateType:      draft.templateType,
        dayOfWeek:         draft.dayOfWeek,
        startDate:         draft.startDate,
        endDate:           draft.endDate,
        timeSlot:          draft.timeSlot,
        holidayExclusions: draft.holidayExclusions,
        specialNotes:      draft.specialNotes,
        collectionStart:   draft.collectionStart,
        collectionEnd:     draft.collectionEnd,
        disposalDate:      draft.disposalDate,
        recipientEmails,
      });
      showStatus('success', `Email sent to ${recipientEmails.length} student${recipientEmails.length !== 1 ? 's' : ''}`);
      setDraft(null);
      setComposeCourse(null);
      setView('settings');
      loadAll();
    } catch (err) {
      showStatus('error', err.response?.data?.error || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  // ── Last sent lookup ────────────────────────────────────────────────────────
  function lastSentFor(cfg) {
    const key = cfg.course_type_key || '';
    const match = history.filter(h => {
      if (!h.course_identifier) return false;
      // Direct match (e.g. "wt-6week" === "wt-6week")
      if (h.course_identifier.startsWith(key)) return true;
      // Match by email_type for course details/unconfirmed sent to specific courses
      if (h.email_type === 'course_details' || h.email_type === 'course_unconfirmed') {
        // Match WT courses by week count: wt-6week matches WT*6, wt-7week-inter matches WT*7
        const weekMatch = key.match(/(\d+)/);
        if (weekMatch) {
          const weeks = weekMatch[1];
          const id = h.course_identifier.toUpperCase();
          if (key.includes('hb')) return id.startsWith('HB');
          if (key.includes('wt') && id.startsWith('WT') && id.includes(weeks)) return true;
        }
      }
      return false;
    });
    if (!match.length) return null;
    return match.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))[0].sent_at;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '32px 24px 60px' }}>

        {/* ── Page header ── */}
        <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>Admin</div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>Emails</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {saveStatus && (
              <span style={{ fontSize: '11px', fontWeight: 600, color: saveStatus === 'error' ? '#C0392B' : saveStatus === 'saving' ? MUTED : GREEN }}>
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Error saving'}
              </span>
            )}
            {statusMsg && (
              <span style={{ fontSize: '11px', fontWeight: 600, color: statusMsg.type === 'error' ? '#C0392B' : GREEN }}>
                {statusMsg.text}
              </span>
            )}
            {view === 'settings' && (
              <button
                onClick={() => setView('history')}
                style={{ padding: '8px 14px', border: `1px solid ${RULE}`, backgroundColor: 'transparent', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', color: MUTED }}
              >
                View History
              </button>
            )}
            {(view === 'compose' || view === 'history') && (
              <button
                onClick={() => { setView('settings'); setDraft(null); setComposeCourse(null); }}
                style={{ background: 'none', border: 'none', color: TC, cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
              >
                &larr; Back to Settings
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading…</div>
        ) : (
          <>
            {/* ────────────────────────── SETTINGS VIEW ────────────────────────── */}
            {view === 'settings' && (
              <>
                {/* Email Settings Table */}
                <section style={{ marginBottom: '40px' }}>
                  <h2 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, margin: '0 0 12px' }}>Email Settings</h2>
                  <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFF' }}>
                    {/* Table header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 150px 130px', padding: '8px 16px', borderBottom: `1px solid ${RULE}`, backgroundColor: ALT }}>
                      {['Course', 'Auto-send', 'Days Before', 'Template', 'Last Sent'].map(h => (
                        <span key={h} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{h}</span>
                      ))}
                    </div>
                    {configs.length === 0 ? (
                      <div style={{ padding: '24px 16px', color: MUTED, fontSize: '13px' }}>No course configurations found.</div>
                    ) : (
                      configs.map((cfg, i) => {
                        const isHB = (cfg.category || cfg.course_type_key || '').toLowerCase().includes('hb') ||
                                     (cfg.course_type_key || '').toUpperCase().startsWith('HB');
                        const lastSent = lastSentFor(cfg);
                        return (
                          <div
                            key={cfg.course_type_key || i}
                            style={{
                              display: 'grid', gridTemplateColumns: '1fr 90px 110px 150px 130px',
                              padding: '12px 16px', alignItems: 'center',
                              borderBottom: i < configs.length - 1 ? `1px solid ${RULE}` : 'none',
                            }}
                          >
                            {/* Course */}
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: INK }}>{cfg.display_name || cfg.course_type_key}</div>
                              <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{cfg.course_type_key}</div>
                            </div>

                            {/* Auto-send checkbox */}
                            <div>
                              <input
                                type="checkbox"
                                checked={!!cfg.email_auto_send}
                                onChange={() => toggleAutoSend(cfg)}
                                style={{ accentColor: TC, width: '14px', height: '14px', cursor: 'pointer' }}
                              />
                            </div>

                            {/* Days Before */}
                            <div>
                              {isHB && cfg.email_auto_send ? (
                                <span style={{ fontSize: '12px', color: MUTED, fontStyle: 'italic' }}>on purchase</span>
                              ) : isHB ? (
                                <span style={{ fontSize: '12px', color: MUTED, fontStyle: 'italic' }}>manual</span>
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  defaultValue={cfg.email_send_days_before ?? 5}
                                  onBlur={e => updateDaysBefore(cfg, e.target.value)}
                                  style={{ ...inputSt, width: '64px', padding: '5px 8px', textAlign: 'center' }}
                                />
                              )}
                            </div>

                            {/* Template */}
                            <div>
                              <span style={{ fontSize: '11px', color: MUTED, fontFamily: 'monospace' }}>
                                {cfg.email_template_key || '—'}
                              </span>
                            </div>

                            {/* Last Sent */}
                            <div style={{ fontSize: '11px', color: lastSent ? INK : MUTED }}>
                              {lastSent ? fmtDate(lastSent) : '—'}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>

                {/* Upcoming Courses — Manual Send */}
                <section>
                  <h2 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, margin: '0 0 12px' }}>Upcoming Courses — Manual Send</h2>
                  <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFF' }}>
                    {/* Table header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 120px 100px', padding: '8px 16px', borderBottom: `1px solid ${RULE}`, backgroundColor: ALT }}>
                      {['Course', 'Start Date', 'Students', 'Email Sent', ''].map((h, i) => (
                        <span key={i} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{h}</span>
                      ))}
                    </div>
                    {courses.length === 0 ? (
                      <div style={{ padding: '32px 16px', color: MUTED, fontSize: '13px', textAlign: 'center' }}>No upcoming courses in the next 14 days.</div>
                    ) : (
                      courses.map((course, i) => (
                        <div
                          key={course.courseIdentifier}
                          style={{
                            display: 'grid', gridTemplateColumns: '1fr 120px 80px 120px 100px',
                            padding: '12px 16px', alignItems: 'center',
                            borderBottom: i < courses.length - 1 ? `1px solid ${RULE}` : 'none',
                          }}
                        >
                          {/* Course */}
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: INK }}>{course.courseIdentifier}</div>
                            {course.timeSlot && (
                              <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>{course.timeSlot}</div>
                            )}
                          </div>

                          {/* Start Date */}
                          <div style={{ fontSize: '12px', color: INK }}>{course.startDate || '—'}</div>

                          {/* Students */}
                          <div style={{ fontSize: '12px', color: INK }}>{course.studentCount ?? '—'}</div>

                          {/* Email Sent */}
                          <div>
                            {course.emailSentAt ? (
                              <span style={{ fontSize: '11px', fontWeight: 600, color: GREEN }}>
                                Sent {fmtDate(course.emailSentAt)}
                              </span>
                            ) : (
                              <span style={{ fontSize: '11px', fontWeight: 600, color: TC }}>Pending</span>
                            )}
                          </div>

                          {/* Compose button */}
                          <div style={{ textAlign: 'right' }}>
                            <button
                              onClick={() => openCompose(course.courseIdentifier)}
                              style={{
                                padding: '6px 14px', border: 'none',
                                backgroundColor: TC, color: '#FFF',
                                fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
                                cursor: 'pointer',
                              }}
                            >
                              Compose
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
                {/* Waitlist Emails Section */}
                {waitlistData.length > 0 && (
                  <section style={{ marginBottom: '40px' }}>
                    <h2 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9E6200', margin: '0 0 12px' }}>
                      Waitlist Emails ({waitlistData.length})
                    </h2>
                    <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFF' }}>
                      {/* Header */}
                      <div style={{ display: 'grid', gridTemplateColumns: '140px 100px 120px 1fr 240px', padding: '8px 16px', borderBottom: `1px solid ${RULE}`, backgroundColor: '#FFF7E6' }}>
                        {['Student', 'Class', 'Date', 'Time', 'Send Email'].map(h => (
                          <span key={h} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9E6200' }}>{h}</span>
                        ))}
                      </div>
                      {waitlistData.map((w, i) => {
                        const student = w.customers;
                        const cls = w.class_instances;
                        if (!student || !cls) return null;
                        const dateStr = new Date(cls.class_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                        return (
                          <div key={w.id} style={{ display: 'grid', gridTemplateColumns: '140px 100px 120px 1fr 240px', padding: '10px 16px', borderBottom: i < waitlistData.length - 1 ? `1px solid ${RULE}` : 'none', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600 }}>{student.first_name} {student.last_name}</span>
                            <span style={{ fontSize: '11px', fontFamily: 'monospace', color: TC }}>{cls.class_type}</span>
                            <span style={{ fontSize: '12px' }}>{dateStr}</span>
                            <span style={{ fontSize: '12px', color: MUTED }}>{cls.start_time} – {cls.end_time}</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {[
                                { type: 'waitlisted', label: 'On Waitlist', bg: '#FFF7E6', color: '#9E6200', border: '#E0C97A' },
                                { type: 'class-full', label: 'Class Full', bg: '#FFF0F0', color: '#C03030', border: '#F0C0C0' },
                                { type: 'confirmed', label: 'Confirmed', bg: TC_LIGHT, color: TC, border: TC },
                              ].map(btn => (
                                <button
                                  key={btn.type}
                                  disabled={sendingWaitlistId === `${w.id}-${btn.type}`}
                                  onClick={async () => {
                                    setSendingWaitlistId(`${w.id}-${btn.type}`);
                                    try {
                                      const r = await api.post(`/admin/waitlist/${w.id}/send-email`, { emailType: btn.type });
                                      showStatus('success', `${btn.label} email sent to ${r.data.studentName}`);
                                    } catch (err) {
                                      showStatus('error', err.response?.data?.error || 'Failed to send');
                                    } finally {
                                      setSendingWaitlistId(null);
                                    }
                                  }}
                                  style={{
                                    padding: '3px 8px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.04em',
                                    border: `1px solid ${btn.border}`, backgroundColor: btn.bg, color: btn.color,
                                    cursor: sendingWaitlistId === `${w.id}-${btn.type}` ? 'not-allowed' : 'pointer',
                                    opacity: sendingWaitlistId === `${w.id}-${btn.type}` ? 0.6 : 1,
                                  }}
                                >
                                  {sendingWaitlistId === `${w.id}-${btn.type}` ? '…' : btn.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </>
            )}

            {/* ────────────────────────── COMPOSE VIEW ─────────────────────────── */}
            {view === 'compose' && (
              <div style={{ maxWidth: '720px' }}>
                {draftLoading ? (
                  <div style={{ padding: '48px', textAlign: 'center', color: MUTED }}>Loading draft…</div>
                ) : draft ? (
                  <>
                    {/* Course info bar */}
                    <div style={{ padding: '14px 18px', backgroundColor: TC_LIGHT, border: `1px solid rgba(196,98,45,0.15)`, marginBottom: '24px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: TC, marginBottom: '2px' }}>Course</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: INK }}>{draft.courseIdentifier || composeCourse}</div>
                        </div>
                        {draft.templateType && (
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: TC, marginBottom: '2px' }}>Template</div>
                            <div style={{ fontSize: '12px', color: INK, fontFamily: 'monospace' }}>{draft.templateType}</div>
                          </div>
                        )}
                        {draft.dayOfWeek && (
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: TC, marginBottom: '2px' }}>Day</div>
                            <div style={{ fontSize: '12px', color: INK }}>{draft.dayOfWeek}</div>
                          </div>
                        )}
                        {draft.timeSlot && (
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: TC, marginBottom: '2px' }}>Time</div>
                            <div style={{ fontSize: '12px', color: INK }}>{draft.timeSlot}</div>
                          </div>
                        )}
                        {draft.startDate && (
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: TC, marginBottom: '2px' }}>Starts</div>
                            <div style={{ fontSize: '12px', color: INK }}>{fmtDate(draft.startDate)}</div>
                          </div>
                        )}
                        {draft.endDate && (
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: TC, marginBottom: '2px' }}>Ends</div>
                            <div style={{ fontSize: '12px', color: INK }}>{fmtDate(draft.endDate)}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Editable fields */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                      <div>
                        <label style={labelSt}>Holiday Exclusions</label>
                        <input
                          type="text"
                          value={draft.holidayExclusions}
                          onChange={e => updateDraftField('holidayExclusions', e.target.value)}
                          placeholder="e.g. NO CLASS 18 APR GOOD FRIDAY"
                          style={inputSt}
                        />
                      </div>

                      <div>
                        <label style={labelSt}>Special Notes</label>
                        <textarea
                          value={draft.specialNotes}
                          onChange={e => updateDraftField('specialNotes', e.target.value)}
                          placeholder="Any additional notes for students…"
                          rows={3}
                          style={{ ...inputSt, resize: 'vertical' }}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={labelSt}>Collection From</label>
                          <input
                            type="text"
                            value={draft.collectionStart}
                            onChange={e => updateDraftField('collectionStart', e.target.value)}
                            style={inputSt}
                          />
                        </div>
                        <div>
                          <label style={labelSt}>Disposal After</label>
                          <input
                            type="text"
                            value={draft.disposalDate}
                            onChange={e => updateDraftField('disposalDate', e.target.value)}
                            style={inputSt}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Recipients */}
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <h3 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED, margin: 0 }}>
                          Recipients ({draft.students.filter(s => s.selected).length}/{draft.students.length})
                        </h3>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => setDraft(prev => ({ ...prev, students: prev.students.map(s => ({ ...s, selected: true })) }))}
                            style={{ background: 'none', border: 'none', fontSize: '11px', color: TC, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                          >
                            Select all
                          </button>
                          <button
                            onClick={() => setDraft(prev => ({ ...prev, students: prev.students.map(s => ({ ...s, selected: false })) }))}
                            style={{ background: 'none', border: 'none', fontSize: '11px', color: MUTED, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                          >
                            None
                          </button>
                        </div>
                      </div>
                      <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFF' }}>
                        {draft.students.length === 0 ? (
                          <div style={{ padding: '16px', color: MUTED, fontSize: '13px' }}>No students found for this course.</div>
                        ) : (
                          draft.students.map((s, i) => (
                            <div
                              key={s.email || i}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                padding: '10px 14px',
                                borderBottom: i < draft.students.length - 1 ? `1px solid ${RULE}` : 'none',
                                backgroundColor: s.selected ? '#FFF' : ALT,
                                cursor: 'pointer',
                              }}
                              onClick={() => toggleStudent(i)}
                            >
                              <input
                                type="checkbox"
                                checked={s.selected}
                                onChange={() => toggleStudent(i)}
                                onClick={e => e.stopPropagation()}
                                style={{ accentColor: TC, flexShrink: 0 }}
                              />
                              <span style={{ fontSize: '13px', fontWeight: 600, color: s.selected ? INK : MUTED }}>
                                {s.firstName} {s.lastName}
                              </span>
                              <span style={{ fontSize: '12px', color: MUTED, marginLeft: 'auto' }}>{s.email}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Send button */}
                    {(() => {
                      const selectedCount = draft.students.filter(s => s.selected).length;
                      return (
                        <button
                          onClick={handleSend}
                          disabled={sending || selectedCount === 0}
                          style={{
                            width: '100%', padding: '13px',
                            backgroundColor: selectedCount > 0 ? TC : '#CCC',
                            color: '#FFF', border: 'none',
                            fontSize: '13px', fontWeight: 700, letterSpacing: '0.04em',
                            cursor: selectedCount > 0 && !sending ? 'pointer' : 'default',
                            opacity: sending ? 0.7 : 1,
                          }}
                        >
                          {sending ? 'Sending…' : `Send to ${selectedCount} student${selectedCount !== 1 ? 's' : ''}`}
                        </button>
                      );
                    })()}
                  </>
                ) : (
                  <div style={{ padding: '48px', textAlign: 'center', color: MUTED }}>No draft available.</div>
                )}
              </div>
            )}

            {/* ────────────────────────── HISTORY VIEW ─────────────────────────── */}
            {view === 'history' && (
              <div>
                <h2 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, margin: '0 0 12px' }}>Email History</h2>
                {history.length === 0 ? (
                  <div style={{ padding: '48px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No emails sent yet.</div>
                ) : (
                  <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFF' }}>
                    {/* Table header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 90px 140px 1fr 80px', padding: '8px 16px', borderBottom: `1px solid ${RULE}`, backgroundColor: ALT }}>
                      {['Date', 'Type', 'Course', 'Subject', 'Recipients'].map(h => (
                        <span key={h} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{h}</span>
                      ))}
                    </div>
                    {history.map((email, i) => {
                      const isExpanded = expandedEmail === email.id;
                      const emails = email.recipient_emails || [];
                      return (
                        <div key={email.id || i}>
                          {/* Summary row */}
                          <div
                            onClick={() => setExpandedEmail(isExpanded ? null : email.id)}
                            style={{
                              display: 'grid', gridTemplateColumns: '140px 90px 140px 1fr 80px',
                              padding: '11px 16px', alignItems: 'center',
                              borderBottom: (!isExpanded && i < history.length - 1) ? `1px solid ${RULE}` : 'none',
                              cursor: 'pointer',
                              backgroundColor: isExpanded ? TC_LIGHT : '#FFF',
                              transition: 'background-color 0.15s',
                            }}
                          >
                            <div style={{ fontSize: '12px', color: INK }}>{fmtDateTime(email.sent_at)}</div>
                            <div>
                              <span style={{
                                fontSize: '10px', fontWeight: 700, padding: '2px 7px',
                                backgroundColor: email.sent_by === 'system' ? ALT : TC_LIGHT,
                                color: email.sent_by === 'system' ? MUTED : TC,
                              }}>
                                {email.sent_by === 'system' ? 'Auto' : 'Manual'}
                              </span>
                            </div>
                            <div style={{ fontSize: '12px', color: INK, fontWeight: 600 }}>{email.course_identifier || '—'}</div>
                            <div style={{ fontSize: '12px', color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '8px' }}>{email.subject || '—'}</div>
                            <div style={{ fontSize: '12px', color: MUTED, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {email.recipient_count ?? '—'}
                              <span style={{ fontSize: '10px', color: MUTED, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>&#9660;</span>
                            </div>
                          </div>

                          {/* Expanded detail panel */}
                          {isExpanded && (
                            <div style={{
                              padding: '16px 20px 20px',
                              backgroundColor: '#FDFBF9',
                              borderBottom: i < history.length - 1 ? `1px solid ${RULE}` : 'none',
                              borderTop: `1px solid ${RULE}`,
                            }}>
                              {/* Detail grid */}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                <div>
                                  <div style={labelSt}>Subject</div>
                                  <div style={{ fontSize: '13px', color: INK }}>{email.subject || '—'}</div>
                                </div>
                                <div>
                                  <div style={labelSt}>Sent By</div>
                                  <div style={{ fontSize: '13px', color: INK }}>
                                    {email.sent_by === 'system' ? 'Automatic (on purchase)' : email.sent_by || '—'}
                                  </div>
                                </div>
                                <div>
                                  <div style={labelSt}>Email Type</div>
                                  <div style={{ fontSize: '13px', color: INK }}>{email.email_type || '—'}</div>
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                <div>
                                  <div style={labelSt}>Course</div>
                                  <div style={{ fontSize: '13px', color: INK, fontWeight: 600 }}>{email.course_identifier || '—'}</div>
                                </div>
                                <div>
                                  <div style={labelSt}>Date & Time</div>
                                  <div style={{ fontSize: '13px', color: INK }}>{fmtDateTime(email.sent_at)}</div>
                                </div>
                                <div>
                                  <div style={labelSt}>Resend ID</div>
                                  <div style={{ fontSize: '11px', color: MUTED, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                    {email.resend_message_id || '—'}
                                  </div>
                                </div>
                              </div>

                              {/* Recipient list */}
                              <div>
                                <div style={{ ...labelSt, marginBottom: '8px' }}>
                                  Recipients ({emails.length})
                                </div>
                                <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFF' }}>
                                  {emails.length === 0 ? (
                                    <div style={{ padding: '12px 14px', color: MUTED, fontSize: '12px' }}>No recipient data recorded.</div>
                                  ) : (
                                    emails.map((addr, j) => (
                                      <div
                                        key={j}
                                        style={{
                                          padding: '8px 14px',
                                          fontSize: '13px', color: INK,
                                          borderBottom: j < emails.length - 1 ? `1px solid ${RULE}` : 'none',
                                          display: 'flex', alignItems: 'center', gap: '8px',
                                        }}
                                      >
                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: GREEN, flexShrink: 0 }} />
                                        {addr}
                                      </div>
                                    ))
                                  )}
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
            )}
          </>
        )}
      </main>
    </div>
  );
}
