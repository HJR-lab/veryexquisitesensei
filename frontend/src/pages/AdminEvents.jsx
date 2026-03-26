import { useState, useEffect } from 'react';
import api from '../utils/api';
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';

const labelSt = { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: MUTED, display: 'block', marginBottom: '5px' };
const inputSt = { width: '100%', padding: '9px 12px', border: `1px solid ${RULE}`, fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' };

const EVENT_TYPES = [
  { value: 'yard_sale', label: 'Yard Sale' },
  { value: 'member_sale', label: 'Member Sale' },
  { value: 'collaboration', label: 'Collaboration' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'exhibition', label: 'Exhibition' },
  { value: 'other', label: 'Other' },
];

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const EMPTY_EVENT = {
  title: '', eventType: 'other', status: 'draft',
  date: '', endDate: '', startTime: '', endTime: '',
  location: 'VES Pottery Studio', description: '', link: '', notes: '',
  checklist: [''],
};

export default function AdminEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = list view, object = editing
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/events');
      setEvents(res.data.events || []);
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setEditing({ ...EMPTY_EVENT, checklist: [''] });
  };

  const openEdit = (event) => {
    setEditing({
      ...event,
      date: event.date ? event.date.split('T')[0] : '',
      endDate: event.end_date ? event.end_date.split('T')[0] : '',
      startTime: event.start_time || '',
      endTime: event.end_time || '',
      eventType: event.event_type || 'other',
      link: event.link || '',
      checklist: event.checklist?.length ? event.checklist : [''],
    });
  };

  const handleSave = async () => {
    if (!editing.title.trim()) { alert('Title is required'); return; }
    setSaving(true);
    try {
      const payload = {
        title: editing.title,
        event_type: editing.eventType,
        status: editing.status,
        date: editing.date || null,
        end_date: editing.endDate || null,
        start_time: editing.startTime || null,
        end_time: editing.endTime || null,
        location: editing.location,
        description: editing.description,
        link: editing.link || null,
        notes: editing.notes,
        checklist: editing.checklist.filter(c => c.trim()),
      };
      if (editing.id) {
        await api.put(`/admin/events/${editing.id}`, payload);
      } else {
        await api.post('/admin/events', payload);
      }
      setEditing(null);
      loadEvents();
    } catch (err) {
      console.error('Failed to save event:', err);
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this event?')) return;
    try {
      await api.delete(`/admin/events/${id}`);
      if (editing?.id === id) setEditing(null);
      loadEvents();
    } catch (err) {
      console.error('Failed to delete:', err);
      alert('Failed to delete');
    }
  };

  const updateChecklist = (i, value) => {
    const updated = [...editing.checklist];
    updated[i] = value;
    setEditing({ ...editing, checklist: updated });
  };

  const addChecklistItem = () => {
    setEditing({ ...editing, checklist: [...editing.checklist, ''] });
  };

  const removeChecklistItem = (i) => {
    setEditing({ ...editing, checklist: editing.checklist.filter((_, j) => j !== i) });
  };

  const fmtDate = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  const statusColor = (status) => {
    if (status === 'active') return '#1E6B1E';
    if (status === 'upcoming') return TC_DARK;
    if (status === 'cancelled') return '#C62828';
    if (status === 'completed') return MUTED;
    return '#666';
  };

  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>Admin</div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>Events</h1>
          </div>
          <button onClick={openNew} style={{ padding: '8px 16px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
            + New Event
          </button>
        </div>

        {/* ── Edit / Create form ── */}
        {editing && (
          <div style={{ backgroundColor: '#FFF', border: `1px solid ${RULE}`, padding: '24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{editing.id ? 'Edit Event' : 'New Event'}</div>
              <button onClick={() => setEditing(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: MUTED }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelSt}>Event Title *</label>
                <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} style={inputSt} placeholder="e.g. Spring Yard Sale 2026" />
              </div>
              <div>
                <label style={labelSt}>Event Type</label>
                <select value={editing.eventType} onChange={e => setEditing({ ...editing, eventType: e.target.value })} style={{ ...inputSt, cursor: 'pointer' }}>
                  {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Status</label>
                <select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })} style={{ ...inputSt, cursor: 'pointer' }}>
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Start Date</label>
                <input type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>End Date (if multi-day)</label>
                <input type="date" value={editing.endDate} onChange={e => setEditing({ ...editing, endDate: e.target.value })} style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Start Time</label>
                <input value={editing.startTime} onChange={e => setEditing({ ...editing, startTime: e.target.value })} style={inputSt} placeholder="e.g. 10:00am" />
              </div>
              <div>
                <label style={labelSt}>End Time</label>
                <input value={editing.endTime} onChange={e => setEditing({ ...editing, endTime: e.target.value })} style={inputSt} placeholder="e.g. 5:00pm" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelSt}>Location</label>
                <input value={editing.location} onChange={e => setEditing({ ...editing, location: e.target.value })} style={inputSt} placeholder="VES Pottery Studio" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelSt}>Link (e.g. Instagram URL)</label>
                <input value={editing.link} onChange={e => setEditing({ ...editing, link: e.target.value })} style={inputSt} placeholder="https://instagram.com/p/..." />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelSt}>Description</label>
                <textarea value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} rows={3} style={{ ...inputSt, resize: 'vertical' }} placeholder="What is this event about?" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelSt}>Internal Notes</label>
                <textarea value={editing.notes} onChange={e => setEditing({ ...editing, notes: e.target.value })} rows={2} style={{ ...inputSt, resize: 'vertical' }} placeholder="Private notes (not shown to students)" />
              </div>
            </div>

            {/* Checklist */}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelSt}>Checklist / To-Do</label>
              {editing.checklist.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: MUTED, width: '16px', textAlign: 'right' }}>{i + 1}.</span>
                  <input value={item} onChange={e => updateChecklist(i, e.target.value)} style={{ ...inputSt, flex: 1 }} placeholder="To-do item..." />
                  <button onClick={() => removeChecklistItem(i)} style={{ border: 'none', background: 'none', color: '#C62828', cursor: 'pointer', fontSize: '16px' }}>×</button>
                </div>
              ))}
              <button onClick={addChecklistItem} style={{ fontSize: '11px', color: TC, background: 'none', border: `1px dashed ${RULE}`, padding: '4px 10px', cursor: 'pointer', marginTop: '4px' }}>
                + Add item
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditing(null)} style={{ padding: '10px 16px', border: `1px solid ${RULE}`, background: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '10px 20px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving...' : editing.id ? 'Save Changes' : 'Create Event'}
              </button>
            </div>
          </div>
        )}

        {/* ── Events list ── */}
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: MUTED }}>Loading...</div>
        ) : events.length === 0 && !editing ? (
          <div style={{ padding: '60px', textAlign: 'center', backgroundColor: '#FFF', border: `1px solid ${RULE}` }}>
            <span className="material-symbols-outlined" style={{ fontSize: '40px', color: RULE, display: 'block', marginBottom: '12px' }}>celebration</span>
            <div style={{ fontSize: '14px', color: MUTED, marginBottom: '16px' }}>No events yet</div>
            <button onClick={openNew} style={{ padding: '8px 16px', backgroundColor: TC, color: '#FFF', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
              Create your first event
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {events.map(event => (
              <div key={event.id} style={{ backgroundColor: '#FFF', border: `1px solid ${editing?.id === event.id ? TC : RULE}`, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700 }}>{event.title}</div>
                    <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 6px', color: statusColor(event.status), backgroundColor: event.status === 'active' ? '#E8F5E9' : event.status === 'upcoming' ? TC_LIGHT : '#F5F5F5' }}>
                      {event.status}
                    </span>
                    <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED }}>
                      {EVENT_TYPES.find(t => t.value === event.event_type)?.label || event.event_type}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: MUTED }}>
                    {event.date ? fmtDate(event.date) : 'No date set'}
                    {event.end_date && event.end_date !== event.date ? ` — ${fmtDate(event.end_date)}` : ''}
                    {event.start_time ? ` · ${event.start_time}` : ''}
                    {event.end_time ? `–${event.end_time}` : ''}
                    {event.location ? ` · ${event.location}` : ''}
                  </div>
                  {event.description && (
                    <div style={{ fontSize: '12px', color: INK, marginTop: '4px', lineHeight: 1.4 }}>{event.description}</div>
                  )}
                  {event.checklist?.length > 0 && (
                    <div style={{ fontSize: '11px', color: MUTED, marginTop: '4px' }}>
                      {event.checklist.length} checklist item{event.checklist.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button onClick={() => openEdit(event)} style={{ padding: '6px 12px', border: `1px solid ${RULE}`, background: 'none', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', color: INK }}>Edit</button>
                  <button onClick={() => handleDelete(event.id)} style={{ padding: '6px 12px', border: `1px solid ${RULE}`, background: 'none', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', color: '#C62828' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
