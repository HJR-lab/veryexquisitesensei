import { useState, useEffect } from 'react';
import api from '../utils/api';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function courseTypeShort(t) {
  if (!t) return '';
  const s = t.toLowerCase();
  if (s.includes('wheel')) return 'WT';
  if (s.includes('hand')) return 'HB';
  return t.slice(0, 2).toUpperCase();
}

export default function AdminCohorts() {
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const load = () => {
    api.get('/admin/cohort-dates')
      .then(({ data }) => setCohorts(data.cohorts || []))
      .catch(err => console.error('Failed to load cohorts:', err))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const startEdit = (c) => {
    setEditId(c.courseIdentifier);
    setEditStart(c.startDate || '');
    setEditEnd(c.endDate || '');
    setMessage(null);
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditStart('');
    setEditEnd('');
  };

  const save = async () => {
    if (!editStart || !editEnd) return;
    try {
      setSaving(true);
      const { data } = await api.put(`/admin/cohort-dates/${encodeURIComponent(editId)}`, {
        startDate: editStart,
        endDate: editEnd,
      });
      setMessage({ type: 'ok', text: data.message });
      setEditId(null);
      load();
    } catch (err) {
      setMessage({ type: 'err', text: err.response?.data?.error || 'Failed to update' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '32px 24px 60px' }}>

        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>
            VES Pottery Studio
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>
            Cohort Dates
          </h1>
          <p style={{ fontSize: '12px', color: MUTED, marginTop: '6px' }}>
            Set the reschedule window for each cohort. Students can only reschedule within their cohort's date range.
          </p>
        </div>

        {message && (
          <div style={{
            padding: '10px 14px', marginBottom: '16px', fontSize: '12px', fontWeight: 600,
            backgroundColor: message.type === 'ok' ? '#DEF7EC' : '#FEE2E2',
            color: message.type === 'ok' ? '#03543F' : '#991B1B',
          }}>
            {message.text}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '13px', color: MUTED }}>Loading cohorts...</div>
        ) : cohorts.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '13px', color: MUTED }}>No active cohorts found.</div>
        ) : (
          <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFF', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Cohort', 'Type', 'Instructor', 'Students', 'Start Date', 'End Date', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: 'left', fontSize: '9px', fontWeight: 700,
                      letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED,
                      borderBottom: `1px solid ${RULE}`, whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map(c => {
                  const isEditing = editId === c.courseIdentifier;
                  return (
                    <tr key={c.courseIdentifier} style={{ backgroundColor: isEditing ? TC_LIGHT : 'transparent' }}>
                      <td style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, fontFamily: 'monospace', fontWeight: 700, color: TC_DARK, whiteSpace: 'nowrap' }}>
                        {c.courseIdentifier}
                      </td>
                      <td style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, whiteSpace: 'nowrap' }}>
                        <span style={{
                          fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                          padding: '2px 5px', borderRadius: '2px',
                          backgroundColor: courseTypeShort(c.courseType) === 'WT' ? '#DBEAFE' : '#FDE68A',
                          color: courseTypeShort(c.courseType) === 'WT' ? '#1E40AF' : '#92400E',
                        }}>{courseTypeShort(c.courseType)}</span>
                      </td>
                      <td style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, whiteSpace: 'nowrap' }}>
                        {c.instructor || <span style={{ color: MUTED }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, textAlign: 'center' }}>
                        {c.studentCount}
                      </td>
                      <td style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <input type="date" value={editStart} onChange={e => setEditStart(e.target.value)}
                            style={{ padding: '4px 6px', fontSize: '12px', border: `1px solid ${RULE}`, fontFamily: 'inherit' }} />
                        ) : (
                          formatDate(c.startDate)
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                            style={{ padding: '4px 6px', fontSize: '12px', border: `1px solid ${RULE}`, fontFamily: 'inherit' }} />
                        ) : (
                          formatDate(c.endDate)
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', borderBottom: `1px solid ${RULE}`, whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={save} disabled={saving} style={{
                              padding: '4px 10px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
                              border: 'none', backgroundColor: TC, color: '#FFF', cursor: saving ? 'default' : 'pointer',
                            }}>{saving ? 'Saving…' : 'Save'}</button>
                            <button onClick={cancelEdit} style={{
                              padding: '4px 10px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
                              border: `1px solid ${RULE}`, background: 'none', cursor: 'pointer', color: MUTED,
                            }}>Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(c)} style={{
                            padding: '4px 10px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
                            border: `1px solid ${RULE}`, background: 'none', cursor: 'pointer', color: INK,
                          }}>Edit</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
