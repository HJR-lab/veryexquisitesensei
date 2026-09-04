import { useState, useEffect } from 'react';

import AdminPage from '../components/AdminPage';
import api from '../utils/api';

// ─── Design tokens ────────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

// Package badges shown next to recipients whose own enrollment gets a
// package-specific course email (server segments the send by these).
const TEMPLATE_BADGES = {
  'wt-10class':  { label: '10-CLASS', bg: TC_LIGHT, fg: '#9E4A1E' },
  'wt-3x6week':  { label: '3×WT6',    bg: '#EEF1F4', fg: '#4A5A6A' },
};
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
  const [tab,            setTab]            = useState('courses'); // 'courses' | 'waitlist'
  const [view,           setView]           = useState('settings');
  const [configs,        setConfigs]        = useState([]);
  const [courses,        setCourses]        = useState([]);
  const [history,        setHistory]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [waitlistData,   setWaitlistData]   = useState([]);
  const [sendingWaitlistId, setSendingWaitlistId] = useState(null);
  const [collectionData, setCollectionData] = useState([]);
  const [sendingCollectionId, setSendingCollectionId] = useState(null);
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
  const [preview,        setPreview]        = useState(null);  // { groups: [{templateType, recipientCount, subject, html}], active }
  const [previewLoading, setPreviewLoading] = useState(false);

  // Voucher tab — admin-composed gift voucher email (handbuilding / wheelthrowing / membership)
  const [voucher, setVoucher] = useState({
    subject: 'handbuilding', months: 12,
    to: '', cc: '', recipientName: '', giverName: '',
    giftLabel: '', giverMessage: '',
  });
  const [voucherSending, setVoucherSending] = useState(false);
  const updateVoucher = (field, val) => setVoucher(prev => ({ ...prev, [field]: val }));

  const handleVoucherPreview = async () => {
    try {
      const { data } = await api.post('/admin/emails/gift-voucher/preview', voucher);
      const url = URL.createObjectURL(new Blob([data.html], { type: 'text/html' }));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      showStatus('error', err.response?.data?.error || 'Failed to build preview');
    }
  };

  const handleVoucherSend = async () => {
    if (!voucher.to.trim())          { showStatus('error', 'Add at least one "To" address'); return; }
    if (!voucher.giverMessage.trim()) { showStatus('error', "Add the giver's message"); return; }
    setVoucherSending(true);
    try {
      const { data } = await api.post('/admin/emails/gift-voucher/send', voucher);
      const ccNote = data.cc?.length ? `, cc ${data.cc.length}` : '';
      showStatus('success', `Gift voucher sent to ${data.to.join(', ')}${ccNote}`);
    } catch (err) {
      showStatus('error', err.response?.data?.error || 'Failed to send');
    } finally {
      setVoucherSending(false);
    }
  };


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
      api.get('/admin/pieces/pipeline').then(r => {
        const batches = r.data?.batches || [];
        setCollectionData(batches.filter(b => ['ready', 'collecting', 'in_cabinet'].includes(b.status)));
      }).catch(() => {});
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

  // Field payload shared by preview and send, so the preview is built from
  // exactly what a send would post.
  const draftPayload = (recipientEmails) => ({
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

  const handlePreview = async () => {
    if (!draft) return;
    setPreviewLoading(true);
    try {
      const recipientEmails = draft.students.filter(s => s.selected).map(s => s.email);
      const { data } = await api.post(`/admin/course-emails/${composeCourse}/preview`, draftPayload(recipientEmails));
      setPreview({ groups: data.groups || [], active: 0 });
    } catch (err) {
      showStatus('error', err.response?.data?.error || 'Failed to build preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSend = async () => {
    if (!draft) return;
    setSending(true);
    try {
      const recipientEmails = draft.students.filter(s => s.selected).map(s => s.email);
      const { data: sendResult } = await api.post(`/admin/course-emails/${composeCourse}/send`, draftPayload(recipientEmails));
      const breakdown = (sendResult?.sends || [])
        .map(s => `${s.count}× ${TEMPLATE_BADGES[s.templateType]?.label || s.templateType}`)
        .join(', ');
      const failNote = (sendResult?.failures || []).length
        ? ` — ${sendResult.failures.map(f => `${f.count}× ${f.templateType} FAILED`).join(', ')}`
        : '';
      // Each student now gets their own message, so a send can partly fail.
      // Count who was actually written to, not who was selected.
      const sentCount = (sendResult?.sends || []).reduce((n, s) => n + (s.count || 0), 0) || recipientEmails.length;
      showStatus(failNote ? 'error' : 'success', `Email sent to ${sentCount} student${sentCount !== 1 ? 's' : ''}${breakdown ? ` (${breakdown})` : ''}${failNote}`);
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
  const headerActions = (
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
      {view === 'settings' && tab === 'courses' && (
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
  );

  return (
    <AdminPage title="Emails" actions={headerActions}>
      {/* ── Tab bar ── */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '24px', borderBottom: `2px solid ${RULE}` }}>
          {[
            { key: 'courses', label: 'Courses' },
            { key: 'waitlist', label: `Waitlist${waitlistData.length > 0 ? ` (${waitlistData.length})` : ''}` },
            { key: 'collection', label: `Collection${collectionData.length > 0 ? ` (${collectionData.length})` : ''}` },
            { key: 'voucher', label: 'Voucher' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setView('settings'); setDraft(null); setComposeCourse(null); }}
              style={{
                padding: '10px 20px', border: 'none', borderBottom: tab === t.key ? `2px solid ${INK}` : '2px solid transparent',
                marginBottom: '-2px', backgroundColor: 'transparent',
                fontSize: '13px', fontWeight: tab === t.key ? 700 : 400, color: tab === t.key ? INK : MUTED,
                cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>Loading…</div>
        ) : (
          <>
            {/* ────────────────────────── SETTINGS VIEW ────────────────────────── */}
            {view === 'settings' && tab === 'courses' && (
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
              </>
            )}

            {/* ────────────────────────── WAITLIST TAB ─────────────────────────── */}
            {tab === 'waitlist' && (
              <div>
                {waitlistData.length === 0 ? (
                  <div style={{ padding: '48px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No students on waitlist.</div>
                ) : (
                  <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFF' }}>
                    {/* Header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 130px 120px 1fr 240px', padding: '8px 16px', borderBottom: `1px solid ${RULE}`, backgroundColor: '#FFF7E6' }}>
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
                        <div key={w.id} style={{ display: 'grid', gridTemplateColumns: '140px 130px 120px 1fr 240px', padding: '10px 16px', borderBottom: i < waitlistData.length - 1 ? `1px solid ${RULE}` : 'none', alignItems: 'center' }}>
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
                )}
              </div>
            )}

            {/* ────────────────────────── COLLECTION TAB ─────────────────────── */}
            {tab === 'collection' && (
              <div>
                {collectionData.length === 0 ? (
                  <div style={{ padding: '48px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No pieces pending collection.</div>
                ) : (
                  <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFF' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 60px 70px 90px 1fr 200px', padding: '8px 16px', borderBottom: `1px solid ${RULE}`, backgroundColor: '#E8F5E9' }}>
                      {['Student', 'Pieces', 'Initials', 'Status', 'Notes', 'Send Email'].map(h => (
                        <span key={h} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#2E7D32' }}>{h}</span>
                      ))}
                    </div>
                    {collectionData.map((b, i) => (
                      <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '140px 60px 70px 90px 1fr 200px', padding: '10px 16px', borderBottom: i < collectionData.length - 1 ? `1px solid ${RULE}` : 'none', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>{b.customer?.first_name || b.first_name} {b.customer?.last_name || b.last_name}</span>
                        <span style={{ fontSize: '13px', fontWeight: 700 }}>{b.piece_count}</span>
                        <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 700 }}>{b.initials || '—'}</span>
                        <span style={{
                          fontSize: '9px', fontWeight: 700, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-block',
                          backgroundColor: b.status === 'ready' ? '#E8F5E9' : b.status === 'in_cabinet' ? '#E3F2FD' : '#FFF7E6',
                          color: b.status === 'ready' ? '#2E7D32' : b.status === 'in_cabinet' ? '#1565C0' : '#9E6200',
                        }}>{b.status === 'in_cabinet' ? 'In Cabinet' : b.status}</span>
                        <span style={{ fontSize: '11px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.notes || '—'}</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            disabled={sendingCollectionId === `${b.id}-ready`}
                            onClick={async () => {
                              setSendingCollectionId(`${b.id}-ready`);
                              try {
                                await api.post(`/admin/pieces/batches/${b.id}/send-collection-email`, { emailType: 'ready' });
                                showStatus('success', `Collection email sent to ${b.customer?.first_name || b.first_name}`);
                              } catch (err) { showStatus('error', err.response?.data?.error || 'Failed'); }
                              finally { setSendingCollectionId(null); }
                            }}
                            style={{ padding: '3px 8px', fontSize: '9px', fontWeight: 700, border: '1px solid #A5D6A7', backgroundColor: '#E8F5E9', color: '#2E7D32', cursor: 'pointer' }}
                          >
                            {sendingCollectionId === `${b.id}-ready` ? '…' : 'Ready'}
                          </button>
                          <button
                            disabled={sendingCollectionId === `${b.id}-cabinet`}
                            onClick={async () => {
                              setSendingCollectionId(`${b.id}-cabinet`);
                              try {
                                await api.post(`/admin/pieces/batches/${b.id}/send-collection-email`, { emailType: 'cabinet' });
                                showStatus('success', `Cabinet email sent to ${b.customer?.first_name || b.first_name}`);
                              } catch (err) { showStatus('error', err.response?.data?.error || 'Failed'); }
                              finally { setSendingCollectionId(null); }
                            }}
                            style={{ padding: '3px 8px', fontSize: '9px', fontWeight: 700, border: '1px solid #90CAF9', backgroundColor: '#E3F2FD', color: '#1565C0', cursor: 'pointer' }}
                          >
                            {sendingCollectionId === `${b.id}-cabinet` ? '…' : 'In Cabinet'}
                          </button>
                          <button
                            disabled={sendingCollectionId === `${b.id}-reminder`}
                            onClick={async () => {
                              setSendingCollectionId(`${b.id}-reminder`);
                              try {
                                await api.post(`/admin/pieces/batches/${b.id}/send-collection-email`, { emailType: 'reminder' });
                                showStatus('success', `Reminder sent to ${b.customer?.first_name || b.first_name}`);
                              } catch (err) { showStatus('error', err.response?.data?.error || 'Failed'); }
                              finally { setSendingCollectionId(null); }
                            }}
                            style={{ padding: '3px 8px', fontSize: '9px', fontWeight: 700, border: '1px solid #FFCC80', backgroundColor: '#FFF3E0', color: '#E65100', cursor: 'pointer' }}
                          >
                            {sendingCollectionId === `${b.id}-reminder` ? '…' : 'Remind'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ────────────────────────── VOUCHER TAB ─────────────────────────── */}
            {tab === 'voucher' && (
              <div style={{ maxWidth: '640px' }}>
                <h2 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, margin: '0 0 6px' }}>
                  Gift Voucher
                </h2>
                <p style={{ fontSize: '13px', lineHeight: 1.6, color: MUTED, margin: '0 0 20px' }}>
                  Compose a gift email — the recipient sees the gift benefits and the giver's
                  personal message. Pick the gift subject, add the recipient under <strong>To</strong>,
                  and optionally cc the giver or yourself.
                  {voucher.subject === 'membership' && (
                    <span style={{ display: 'block', marginTop: '6px', color: TC }}>
                      For memberships, to also transfer an existing membership to the recipient, use
                      the <strong>Gift</strong> button on the Memberships page.
                    </span>
                  )}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: voucher.subject === 'membership' ? '1fr 1fr' : '1fr', gap: '12px' }}>
                    <div>
                      <label style={labelSt}>Gift Subject</label>
                      <select
                        value={voucher.subject}
                        onChange={e => updateVoucher('subject', e.target.value)}
                        style={{ ...inputSt, cursor: 'pointer' }}
                      >
                        <option value="handbuilding">Handbuilding</option>
                        <option value="wheelthrowing">Wheelthrowing</option>
                        <option value="membership">Clay Club Membership</option>
                      </select>
                    </div>
                    {voucher.subject === 'membership' && (
                      <div>
                        <label style={labelSt}>Membership Term</label>
                        <select
                          value={voucher.months}
                          onChange={e => updateVoucher('months', parseInt(e.target.value))}
                          style={{ ...inputSt, cursor: 'pointer' }}
                        >
                          <option value={1}>1 Month · Bronze</option>
                          <option value={6}>6 Months · Silver</option>
                          <option value={12}>12 Months · Gold</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelSt}>To <span style={{ color: TC }}>*</span></label>
                      <input
                        type="text"
                        value={voucher.to}
                        onChange={e => updateVoucher('to', e.target.value)}
                        placeholder="recipient@email.com (comma-separate for multiple)"
                        style={inputSt}
                      />
                    </div>
                    <div>
                      <label style={labelSt}>CC</label>
                      <input
                        type="text"
                        value={voucher.cc}
                        onChange={e => updateVoucher('cc', e.target.value)}
                        placeholder="giver@email.com (optional, comma-separate)"
                        style={inputSt}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelSt}>Recipient Name</label>
                      <input
                        type="text"
                        value={voucher.recipientName}
                        onChange={e => updateVoucher('recipientName', e.target.value)}
                        placeholder="e.g. Vera"
                        style={inputSt}
                      />
                    </div>
                    <div>
                      <label style={labelSt}>From (Giver)</label>
                      <input
                        type="text"
                        value={voucher.giverName}
                        onChange={e => updateVoucher('giverName', e.target.value)}
                        placeholder="e.g. 姑姑, Claris & Cayla"
                        style={inputSt}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={labelSt}>Gift Label <span style={{ color: MUTED, fontWeight: 400 }}>(optional — overrides default)</span></label>
                    <input
                      type="text"
                      value={voucher.giftLabel}
                      onChange={e => updateVoucher('giftLabel', e.target.value)}
                      placeholder={
                        voucher.subject === 'wheelthrowing' ? 'Wheelthrowing Course'
                        : voucher.subject === 'membership' ? `Clay Club ${voucher.months} Month${voucher.months !== 1 ? 's' : ''} Membership`
                        : 'Family Handbuilding Experience'
                      }
                      style={inputSt}
                    />
                  </div>

                  <div>
                    <label style={labelSt}>Message from the Giver <span style={{ color: TC }}>*</span></label>
                    <textarea
                      value={voucher.giverMessage}
                      onChange={e => updateVoucher('giverMessage', e.target.value)}
                      placeholder={"Dear Vera, Happy 5th birthday!\nMay you keep growing wiser every day…"}
                      rows={9}
                      style={{ ...inputSt, resize: 'vertical', lineHeight: 1.6 }}
                    />
                    <p style={{ fontSize: '11px', color: MUTED, margin: '5px 0 0' }}>
                      Line breaks are preserved. This renders as a personal card in the email.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleVoucherPreview}
                    style={{
                      padding: '12px 20px', backgroundColor: '#FFF', color: INK,
                      border: `1px solid ${RULE}`, fontSize: '13px', fontWeight: 700,
                      letterSpacing: '0.04em', cursor: 'pointer',
                    }}
                  >
                    Preview
                  </button>
                  <button
                    onClick={handleVoucherSend}
                    disabled={voucherSending}
                    style={{
                      flex: 1, padding: '12px', backgroundColor: voucherSending ? '#CCC' : TC,
                      color: '#FFF', border: 'none', fontSize: '13px', fontWeight: 700,
                      letterSpacing: '0.04em', cursor: voucherSending ? 'default' : 'pointer',
                      opacity: voucherSending ? 0.7 : 1,
                    }}
                  >
                    {voucherSending ? 'Sending…' : 'Send Gift Voucher'}
                  </button>
                </div>
              </div>
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
                              {TEMPLATE_BADGES[s.templateType] && (
                                <span style={{
                                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
                                  padding: '2px 7px', borderRadius: '3px', flexShrink: 0,
                                  backgroundColor: TEMPLATE_BADGES[s.templateType].bg,
                                  color: TEMPLATE_BADGES[s.templateType].fg,
                                }}>
                                  {TEMPLATE_BADGES[s.templateType].label}
                                </span>
                              )}
                              <span style={{ fontSize: '12px', color: MUTED, marginLeft: 'auto' }}>{s.email}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Preview + Send */}
                    {(() => {
                      const selectedCount = draft.students.filter(s => s.selected).length;
                      return (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={handlePreview}
                            disabled={previewLoading}
                            style={{
                              flex: '0 0 34%', padding: '13px',
                              backgroundColor: '#FFF', color: TC,
                              border: `1px solid ${TC}`,
                              fontSize: '13px', fontWeight: 700, letterSpacing: '0.04em',
                              cursor: previewLoading ? 'default' : 'pointer',
                              opacity: previewLoading ? 0.7 : 1,
                            }}
                          >
                            {previewLoading ? 'Building…' : 'Preview'}
                          </button>
                          <button
                            onClick={handleSend}
                            disabled={sending || selectedCount === 0}
                            style={{
                              flex: 1, padding: '13px',
                              backgroundColor: selectedCount > 0 ? TC : '#CCC',
                              color: '#FFF', border: 'none',
                              fontSize: '13px', fontWeight: 700, letterSpacing: '0.04em',
                              cursor: selectedCount > 0 && !sending ? 'pointer' : 'default',
                              opacity: sending ? 0.7 : 1,
                            }}
                          >
                            {sending ? 'Sending…' : `Send to ${selectedCount} student${selectedCount !== 1 ? 's' : ''}`}
                          </button>
                        </div>
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

      {/* ───────────────────── COURSE EMAIL PREVIEW ──────────────────────── */}
      {preview?.groups?.length > 0 && (() => {
        const group = preview.groups[preview.active] || preview.groups[0];
        return (
          <div
            onClick={() => setPreview(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              backgroundColor: 'rgba(40,40,40,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                backgroundColor: '#FFF', width: '100%', maxWidth: '720px',
                maxHeight: '100%', display: 'flex', flexDirection: 'column',
              }}
            >
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${RULE}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: INK }}>
                  Preview
                </span>
                <span style={{ fontSize: '11px', color: MUTED }}>
                  Rendered from the template file — this is what sends.
                </span>
                <button
                  onClick={() => setPreview(null)}
                  style={{ marginLeft: 'auto', border: 'none', background: 'none', fontSize: '18px', lineHeight: 1, color: MUTED, cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>

              {/* One tab per template variant the cohort splits into */}
              {preview.groups.length > 1 && (
                <div style={{ display: 'flex', gap: '6px', padding: '10px 18px 0' }}>
                  {preview.groups.map((g, i) => (
                    <button
                      key={g.templateType}
                      onClick={() => setPreview(p => ({ ...p, active: i }))}
                      style={{
                        padding: '6px 12px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
                        border: `1px solid ${i === preview.active ? TC : RULE}`,
                        backgroundColor: i === preview.active ? TC : '#FFF',
                        color: i === preview.active ? '#FFF' : MUTED,
                        cursor: 'pointer',
                      }}
                    >
                      {TEMPLATE_BADGES[g.templateType]?.label || g.templateType} · {g.recipientCount}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ padding: '12px 18px', borderBottom: `1px solid ${RULE}` }}>
                <div style={{ fontSize: '11px', color: MUTED, marginBottom: '3px' }}>Subject</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: INK }}>{group.subject}</div>
                {group.recipientCount > 0 && (
                  <div style={{ fontSize: '11px', color: MUTED, marginTop: '6px' }}>
                    Goes to {group.recipientCount} selected student{group.recipientCount !== 1 ? 's' : ''}: {group.recipientEmails.join(', ')}
                  </div>
                )}
              </div>

              {/* sandbox="" is load-bearing, not decoration. srcDoc renders in THIS
                  origin, and the HTML contains customer-supplied fields (a name a
                  student sets in Shopify) that reach us through sync. Without the
                  attribute, a scripted name stored in sent_emails executes here with
                  the admin's session. Emails are static markup, so an empty sandbox
                  costs nothing — images still load, scripts and forms do not run. */}
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={group.html}
                style={{ flex: 1, minHeight: '420px', width: '100%', border: 'none', backgroundColor: '#FFF' }}
              />
            </div>
          </div>
        );
      })()}
    </AdminPage>
  );
}
