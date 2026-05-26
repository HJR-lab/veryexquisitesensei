import { useState, useEffect } from 'react';
import api from '../utils/api';
import AdminPage from '../components/AdminPage';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';

export default function AdminCohorts({ embedded = false }) {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const load = () => {
    api.get('/admin/cohort-periods')
      .then(({ data }) => setPeriods(data.periods || []))
      .catch(err => console.error('Failed to load cohort periods:', err))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const startEdit = (p) => {
    setEditId(p.id);
    setEditName(p.name);
    setEditStart(p.start_date);
    setEditEnd(p.end_date);
    setMessage(null);
  };

  const cancelEdit = () => { setEditId(null); };

  const saveEdit = async () => {
    if (!editName || !editStart || !editEnd) return;
    try {
      setSaving(true);
      await api.put(`/admin/cohort-periods/${editId}`, { name: editName, startDate: editStart, endDate: editEnd });
      setMessage({ type: 'ok', text: `${editName} updated` });
      setEditId(null);
      load();
    } catch (err) {
      setMessage({ type: 'err', text: err.response?.data?.error || 'Failed to update' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const addNew = async () => {
    const nextNum = periods.length + 1;
    try {
      setSaving(true);
      const today = new Date().toISOString().split('T')[0];
      await api.post('/admin/cohort-periods', { name: `Cohort ${nextNum}`, startDate: today, endDate: today });
      setMessage({ type: 'ok', text: `Cohort ${nextNum} added — set the dates` });
      load();
    } catch (err) {
      setMessage({ type: 'err', text: err.response?.data?.error || 'Failed to add' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const remove = async (p) => {
    if (!confirm(`Delete ${p.name}? Students in this date range will fall back to their enrollment dates for rescheduling.`)) return;
    try {
      await api.delete(`/admin/cohort-periods/${p.id}`);
      setMessage({ type: 'ok', text: `${p.name} deleted` });
      load();
    } catch (err) {
      setMessage({ type: 'err', text: 'Failed to delete' });
    }
    setTimeout(() => setMessage(null), 4000);
  };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <AdminPage
      embedded={embedded}
      title="Cohort Dates"
      subtitle="WT students can reschedule to any WT class within the same cohort period."
      actions={
        <button onClick={addNew} disabled={saving} style={{
          padding: '6px 14px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em',
          border: 'none', backgroundColor: TC, color: '#FFF', cursor: saving ? 'default' : 'pointer',
        }}>+ Add Cohort</button>
      }
    >

        {message && (
          <div style={{
            padding: '10px 14px', marginBottom: '16px', fontSize: '12px', fontWeight: 600,
            backgroundColor: message.type === 'ok' ? '#DEF7EC' : '#FEE2E2',
            color: message.type === 'ok' ? '#03543F' : '#991B1B',
          }}>{message.text}</div>
        )}

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '13px', color: MUTED }}>Loading...</div>
        ) : periods.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '13px', color: MUTED }}>
            No cohort periods defined. Click "+ Add Cohort" to create one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {periods.map(p => {
              const isEditing = editId === p.id;
              return (
                <div key={p.id} style={{
                  border: `1px solid ${isEditing ? TC : RULE}`, backgroundColor: '#FFF', padding: '16px 20px',
                }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <input value={editName} onChange={e => setEditName(e.target.value)}
                        style={{ fontSize: '16px', fontWeight: 700, border: `1px solid ${RULE}`, padding: '6px 10px', fontFamily: 'inherit' }} />
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Start</label>
                        <input type="date" value={editStart} onChange={e => setEditStart(e.target.value)}
                          style={{ padding: '5px 8px', fontSize: '13px', border: `1px solid ${RULE}`, fontFamily: 'inherit' }} />
                        <label style={{ fontSize: '11px', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>End</label>
                        <input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                          style={{ padding: '5px 8px', fontSize: '13px', border: `1px solid ${RULE}`, fontFamily: 'inherit' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={saveEdit} disabled={saving} style={{
                          padding: '5px 14px', fontSize: '11px', fontWeight: 700, border: 'none',
                          backgroundColor: TC, color: '#FFF', cursor: saving ? 'default' : 'pointer',
                        }}>{saving ? 'Saving…' : 'Save'}</button>
                        <button onClick={cancelEdit} style={{
                          padding: '5px 14px', fontSize: '11px', fontWeight: 700,
                          border: `1px solid ${RULE}`, background: 'none', cursor: 'pointer', color: MUTED,
                        }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 700 }}>{p.name}</div>
                        <div style={{ fontSize: '13px', color: MUTED, marginTop: '4px' }}>
                          {formatDate(p.start_date)} — {formatDate(p.end_date)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => startEdit(p)} style={{
                          padding: '4px 12px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
                          border: `1px solid ${RULE}`, background: 'none', cursor: 'pointer', color: INK,
                        }}>Edit</button>
                        <button onClick={() => remove(p)} style={{
                          padding: '4px 12px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
                          border: '1px solid #F0C0C0', background: 'none', cursor: 'pointer', color: '#C03030',
                        }}>Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </AdminPage>
  );
}
