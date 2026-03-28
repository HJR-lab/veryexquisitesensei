import { useState, useEffect } from 'react';
import api from '../utils/api';

const TC = '#C4622D';
const INK = '#282828';
const MUTED = '#888888';
const RULE = 'rgba(40,40,40,0.09)';

export default function AdminCourseEmails() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [draft, setDraft] = useState(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => { fetchCourses(); }, []);

  const fetchCourses = async () => {
    try {
      const { data } = await api.get('/admin/course-emails');
      // Frontend filter: exclude courses that have already started
      // Parse course identifier (e.g. WT2802AM_DL6 = DDMM is positions 2-5 = Feb 28)
      const now = new Date();
      const sgtNow = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
      const todayStr = sgtNow.toISOString().split('T')[0];
      const currentYear = sgtNow.getFullYear();

      const filtered = (data.courses || []).filter(c => {
        // Use firstClassDate from backend if available
        if (c.firstClassDate && c.firstClassDate <= todayStr) return false;
        // Fallback: parse DDMM from course identifier (e.g. WT2802AM → day=28, month=02)
        const id = c.courseIdentifier || '';
        const match = id.match(/^(?:WT|HB)(\d{2})(\d{2})/);
        if (match) {
          const day = match[1], month = match[2];
          const courseStart = `${currentYear}-${month}-${day}`;
          if (courseStart <= todayStr) return false;
        }
        return true;
      });
      setCourses(filtered);
    } catch (err) {
      console.error('Failed to fetch courses:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDraft = async (courseId) => {
    setDraftLoading(true);
    setSelectedCourse(courseId);
    try {
      const { data } = await api.get(`/admin/course-emails/${courseId}/draft`);
      setDraft(data);
    } catch (err) {
      console.error('Failed to load draft:', err);
      alert('Failed to load draft: ' + (err.response?.data?.error || err.message));
      setSelectedCourse(null);
    } finally {
      setDraftLoading(false);
    }
  };

  const handleSend = async () => {
    if (!draft) return;
    setSending(true);
    try {
      const recipientEmails = draft.students.filter(s => s.selected).map(s => s.email);
      await api.post(`/admin/course-emails/${selectedCourse}/send`, {
        templateType: draft.templateType,
        dayOfWeek: draft.dayOfWeek,
        startDate: draft.startDate,
        endDate: draft.endDate,
        timeSlot: draft.timeSlot,
        holidayExclusions: draft.holidayExclusions,
        specialNotes: draft.specialNotes,
        collectionStart: draft.collectionStart,
        collectionEnd: draft.collectionEnd,
        disposalDate: draft.disposalDate,
        recipientEmails,
      });
      alert(`Email sent to ${recipientEmails.length} students!`);
      setDraft(null);
      setSelectedCourse(null);
      fetchCourses();
    } catch (err) {
      alert('Failed to send email: ' + (err.response?.data?.error || err.message));
    } finally {
      setSending(false);
    }
  };

  const loadHistory = async () => {
    try {
      const { data } = await api.get('/admin/course-emails/history');
      setHistory(data.emails || []);
      setShowHistory(true);
    } catch (err) {
      console.error('Failed to load history:', err);
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

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: MUTED }}>Loading...</div>;

  // Draft editor view
  if (draft && selectedCourse) {
    const selectedCount = draft.students.filter(s => s.selected).length;

    return (
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px' }}>
        <button onClick={() => { setDraft(null); setSelectedCourse(null); }} style={{ background: 'none', border: 'none', color: TC, cursor: 'pointer', fontSize: '13px', marginBottom: '16px' }}>
          &larr; Back to courses
        </button>

        <h2 style={{ fontSize: '18px', fontWeight: 600, color: INK, margin: '0 0 4px' }}>
          Course Email: {selectedCourse}
        </h2>
        <p style={{ fontSize: '13px', color: MUTED, margin: '0 0 20px' }}>Template: {draft.templateType}</p>

        {/* Editable Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Holiday Exclusions
            <input
              type="text"
              value={draft.holidayExclusions}
              onChange={e => updateDraftField('holidayExclusions', e.target.value)}
              placeholder="e.g. NO CLASS 18 APR GOOD FRIDAY"
              style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${RULE}`, fontSize: '14px', marginTop: '4px', color: INK, boxSizing: 'border-box' }}
            />
          </label>

          <label style={{ fontSize: '12px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Special Notes
            <textarea
              value={draft.specialNotes}
              onChange={e => updateDraftField('specialNotes', e.target.value)}
              placeholder="Any additional notes for students..."
              rows={3}
              style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${RULE}`, fontSize: '14px', marginTop: '4px', color: INK, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Collection Start
              <input type="text" value={draft.collectionStart} onChange={e => updateDraftField('collectionStart', e.target.value)}
                style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${RULE}`, fontSize: '14px', marginTop: '4px', color: INK, boxSizing: 'border-box' }} />
            </label>
            <label style={{ fontSize: '12px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Collection End
              <input type="text" value={draft.collectionEnd} onChange={e => updateDraftField('collectionEnd', e.target.value)}
                style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${RULE}`, fontSize: '14px', marginTop: '4px', color: INK, boxSizing: 'border-box' }} />
            </label>
            <label style={{ fontSize: '12px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Disposal After
              <input type="text" value={draft.disposalDate} onChange={e => updateDraftField('disposalDate', e.target.value)}
                style={{ display: 'block', width: '100%', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${RULE}`, fontSize: '14px', marginTop: '4px', color: INK, boxSizing: 'border-box' }} />
            </label>
          </div>
        </div>

        {/* Student List */}
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: INK, margin: '0 0 8px' }}>
          Recipients ({selectedCount}/{draft.students.length})
        </h3>
        <div style={{ border: `1px solid ${RULE}`, borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
          {draft.students.map((s, i) => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
              borderBottom: i < draft.students.length - 1 ? `1px solid ${RULE}` : 'none',
              backgroundColor: s.selected ? '#fff' : '#f9f9f9',
            }}>
              <input type="checkbox" checked={s.selected} onChange={() => toggleStudent(i)} style={{ accentColor: TC }} />
              <span style={{ fontSize: '14px', color: s.selected ? INK : MUTED }}>
                {s.firstName} {s.lastName}
              </span>
              <span style={{ fontSize: '12px', color: MUTED, marginLeft: 'auto' }}>{s.email}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleSend}
            disabled={sending || selectedCount === 0}
            style={{
              flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
              backgroundColor: selectedCount > 0 ? TC : '#ccc', color: '#fff',
              fontSize: '14px', fontWeight: 600, cursor: selectedCount > 0 ? 'pointer' : 'default',
              opacity: sending ? 0.7 : 1,
            }}
          >
            {sending ? 'Sending...' : `Send to ${selectedCount} student${selectedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    );
  }

  // History view
  if (showHistory) {
    return (
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px' }}>
        <button onClick={() => setShowHistory(false)} style={{ background: 'none', border: 'none', color: TC, cursor: 'pointer', fontSize: '13px', marginBottom: '16px' }}>
          &larr; Back to courses
        </button>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: INK, margin: '0 0 16px' }}>Email History</h2>
        {history.length === 0 ? (
          <p style={{ color: MUTED }}>No emails sent yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {history.map(email => (
              <div key={email.id} style={{ padding: '12px 16px', border: `1px solid ${RULE}`, borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: INK }}>{email.subject}</span>
                  <span style={{ fontSize: '12px', color: MUTED }}>{new Date(email.sent_at).toLocaleDateString()}</span>
                </div>
                <div style={{ fontSize: '12px', color: MUTED }}>
                  {email.email_type} &middot; {email.recipient_count} recipients &middot; Sent by {email.sent_by}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Course list view
  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: INK, margin: 0 }}>Course Emails</h2>
        <button onClick={loadHistory} style={{ background: 'none', border: `1px solid ${RULE}`, borderRadius: '6px', padding: '6px 12px', fontSize: '12px', color: MUTED, cursor: 'pointer' }}>
          History
        </button>
      </div>

      {courses.length === 0 ? (
        <p style={{ color: MUTED, textAlign: 'center', padding: '40px 0' }}>No upcoming courses in the next 14 days.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {courses.map(course => (
            <div key={course.courseIdentifier} style={{
              display: 'flex', alignItems: 'center', padding: '12px 16px',
              border: `1px solid ${RULE}`, borderRadius: '8px',
              backgroundColor: course.emailSentAt ? '#f0fdf0' : '#fff',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: INK }}>{course.courseIdentifier}</div>
                <div style={{ fontSize: '12px', color: MUTED }}>
                  {course.courseType} &middot; {course.startDate} &middot; {course.timeSlot} &middot; {course.studentCount} students
                </div>
              </div>
              {course.emailSentAt ? (
                <span style={{ fontSize: '11px', color: '#1E6B1E', fontWeight: 600 }}>
                  Sent {new Date(course.emailSentAt).toLocaleDateString()}
                </span>
              ) : (
                <button
                  onClick={() => loadDraft(course.courseIdentifier)}
                  disabled={draftLoading}
                  style={{
                    padding: '6px 16px', borderRadius: '6px', border: 'none',
                    backgroundColor: TC, color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Compose
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
