import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import AdminPage from '../components/AdminPage';

const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';

const DAY_LABELS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function fmtKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function StatusPill({ status }) {
  const config = {
    booked:    { bg: '#E8F5E9', color: '#2E7D32', label: 'Confirmed' },
    pending:   { bg: '#FFF8E1', color: '#F57F17', label: 'Pending' },
    attended:  { bg: '#E3F2FD', color: '#1565C0', label: 'Attended' },
    cancelled: { bg: '#FAFAFA', color: '#999',    label: 'Cancelled' },
  };
  const c = config[status] || config.booked;
  return (
    <span style={{
      display: 'inline-block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase', padding: '2px 8px', backgroundColor: c.bg, color: c.color,
    }}>
      {c.label}
    </span>
  );
}

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];   // week reads Mon-first
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Mirrors resolveHoursForDate() in server/utils/studioAccessHours.js —
// a date override always beats the weekly baseline.
function resolveHours(settings, dateStr) {
  if (!settings) return null;
  const win = Object.prototype.hasOwnProperty.call(settings.overrides || {}, dateStr)
    ? settings.overrides[dateStr]
    : settings.weekly?.[String(new Date(dateStr + 'T12:00:00').getDay())] ?? null;
  return win && !win.closed ? win : null;   // a closed window carries only a note
}

function fmt24to12(t) {
  if (!t) return '—';
  const h = parseInt(t.split(':')[0], 10);
  const suffix = h >= 12 ? 'pm' : 'am';
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}${suffix}`;
}

export default function AdminStudioAccess() {
  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);
  const todayStr = fmtKey(TODAY);
  const strip = [...Array.from({ length: 7 }, (_, i) => addDays(TODAY, -(7 - i))), ...Array.from({ length: 60 }, (_, i) => addDays(TODAY, i))];

  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const stripRef = useRef(null);

  // Create form state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [newDate, setNewDate] = useState(todayStr);
  const [newStartTime, setNewStartTime] = useState('11:00');
  const [newNotes, setNewNotes] = useState('');
  const [newAdminNotes, setNewAdminNotes] = useState('');
  const [creating, setCreating] = useState(false);

  // Attended modal state
  const [attendedModal, setAttendedModal] = useState(null); // { id, hours }
  const [sortBy, setSortBy] = useState('date'); // 'date' | 'name' | 'name_desc'
  const [showCancelled, setShowCancelled] = useState(false);

  // Hours editor
  const [hoursSettings, setHoursSettings] = useState(null);
  const [bookingTimes, setBookingTimes] = useState({});
  const [showHours, setShowHours] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [hoursError, setHoursError] = useState('');
  const [ovDate, setOvDate] = useState(todayStr);
  const [ovClosed, setOvClosed] = useState(false);
  const [ovOpen, setOvOpen] = useState('11:00');
  const [ovClose, setOvClose] = useState('18:00');
  const [ovNote, setOvNote] = useState('');

  useEffect(() => {
    fetchBookings();
    fetchHours();
    // Auto-refresh every 30 seconds to pick up student changes
    const interval = setInterval(fetchBookings, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/studio-access/bookings');
      const all = data.bookings || [];
      setBookings(all);
    } catch (err) {
      console.error('Failed to fetch bookings:', err);
    } finally {
      setLoading(false);
    }
  };

  // Keep the create-form start time inside whatever window that date actually has.
  useEffect(() => {
    const win = resolveHours(hoursSettings, newDate);
    if (!win) { setNewStartTime(''); return; }
    if (newStartTime < win.open || newStartTime >= win.close) setNewStartTime(win.open);
  }, [newDate, hoursSettings]);

  const fetchHours = async () => {
    try {
      const { data } = await api.get('/admin/studio-access/hours');
      setHoursSettings(data.settings);
      setBookingTimes(data.bookingTimes || {});
    } catch (err) {
      console.error('Failed to fetch hours:', err);
    }
  };

  // Bookings that would fall outside a proposed window, so the admin finds out
  // before saving rather than from a confused student turning up to a shut door.
  const bookingsAtRisk = (dateStr, win) => {
    const times = bookingTimes[dateStr] || [];
    if (times.length === 0) return 0;
    if (!win || win.closed) return times.length;   // closing the date entirely
    return times.filter(t => t < win.open || t >= win.close).length;
  };

  const saveHours = async (next) => {
    try {
      setSavingHours(true);
      setHoursError('');
      const { data } = await api.put('/admin/studio-access/hours', {
        weekly: next.weekly,
        overrides: next.overrides,
      });
      setHoursSettings(data.settings);
    } catch (err) {
      setHoursError(err.response?.data?.error || 'Failed to save hours');
    } finally {
      setSavingHours(false);
    }
  };

  // A weekly change reaches every matching date, so check them all before saving.
  const saveWeekly = () => {
    const stranded = Object.keys(bookingTimes)
      .filter(date => date >= todayStr)
      .map(date => ({ date, n: bookingsAtRisk(date, resolveHours(hoursSettings, date)) }))
      .filter(x => x.n > 0);

    if (stranded.length > 0) {
      const total = stranded.reduce((sum, x) => sum + x.n, 0);
      const msg = `${total} existing booking${total === 1 ? '' : 's'} across ${stranded.length} date${stranded.length === 1 ? '' : 's'} (${stranded.map(x => x.date).join(', ')}) would fall outside the new hours. They will not be cancelled automatically. Save anyway?`;
      if (!window.confirm(msg)) return;
    }
    saveHours(hoursSettings);
  };

  const setWeekday = (dow, window) => {
    const next = {
      ...hoursSettings,
      weekly: { ...hoursSettings.weekly, [String(dow)]: window },
    };
    setHoursSettings(next);
  };

  const addOverride = () => {
    const note = ovNote.trim() ? { note: ovNote.trim() } : {};
    const win = ovClosed
      ? (ovNote.trim() ? { closed: true, ...note } : null)
      : { open: ovOpen, close: ovClose, ...note };
    if (win && !win.closed && win.close <= win.open) {
      setHoursError('Close time must be after open time');
      return;
    }
    const atRisk = bookingsAtRisk(ovDate, win);
    if (atRisk > 0) {
      const action = win && !win.closed ? 'Narrow' : 'Close';
      const msg = `${ovDate} already has ${atRisk} booking${atRisk === 1 ? '' : 's'}. They will not be cancelled automatically. ${action} this date anyway?`;
      if (!window.confirm(msg)) return;
    }
    const next = {
      ...hoursSettings,
      overrides: { ...hoursSettings.overrides, [ovDate]: win },
    };
    setHoursSettings(next);
    saveHours(next);
    setOvNote('');
  };

  const removeOverride = (date) => {
    const overrides = { ...hoursSettings.overrides };
    delete overrides[date];
    const next = { ...hoursSettings, overrides };
    setHoursSettings(next);
    saveHours(next);
  };

  const handleConfirm = async (id) => {
    try {
      await api.put(`/admin/studio-access/bookings/${id}/confirm`);
      fetchBookings();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to confirm');
    }
  };

  const handleAttended = async () => {
    if (!attendedModal) return;
    try {
      await api.put(`/admin/studio-access/bookings/${attendedModal.id}/attended`, { hours: attendedModal.hours });
      setAttendedModal(null);
      fetchBookings();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to mark attended');
    }
  };

  const handleMarkPaid = async (feeId) => {
    try {
      await api.patch(`/admin/fees/${feeId}/payment`, { paymentStatus: 'paid' });
      fetchBookings();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to mark as paid');
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this booking?')) return;
    try {
      await api.put(`/admin/studio-access/bookings/${id}/cancel`);
      fetchBookings();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to cancel');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Permanently delete this booking?')) return;
    try {
      await api.delete(`/admin/studio-access/bookings/${id}`);
      fetchBookings();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
  };

  const searchStudents = async (q) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const { data } = await api.get(`/admin/students/search?q=${encodeURIComponent(q)}`);
      setSearchResults((data.students || []).slice(0, 8));
    } catch { setSearchResults([]); }
  };

  const handleCreate = async () => {
    if (!selectedStudent) return;
    try {
      setCreating(true);
      await api.post('/admin/studio-access/bookings', {
        customerId: selectedStudent.id,
        date: newDate,
        startTime: newStartTime,
        notes: newNotes || undefined,
        adminNotes: newAdminNotes || undefined,
      });
      setShowCreateForm(false);
      setSelectedStudent(null);
      setSearchQuery('');
      setNewNotes('');
      setNewAdminNotes('');
      if (newDate === selectedDateStr) fetchBookings();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create booking');
    } finally {
      setCreating(false);
    }
  };

  const selectedDateStr = fmtKey(selectedDate);
  const bookingDates = {};
  bookings.forEach(b => {
    if (b.status !== 'cancelled') bookingDates[b.booking_date] = (bookingDates[b.booking_date] || 0) + 1;
  });
  const visibleBookings = showCancelled ? bookings : bookings.filter(b => b.status !== 'cancelled');
  const cancelledCount = bookings.filter(b => b.status === 'cancelled').length;
  const filteredBookings = [...visibleBookings].sort((a, b) => {
    if (sortBy === 'name') {
      const nameA = (a.customer?.first_name || '').toLowerCase();
      const nameB = (b.customer?.first_name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    }
    if (sortBy === 'name_desc') {
      const nameA = (a.customer?.first_name || '').toLowerCase();
      const nameB = (b.customer?.first_name || '').toLowerCase();
      return nameB.localeCompare(nameA);
    }
    return new Date(b.created_at) - new Date(a.created_at); // newest first
  });
  const pendingBookings = bookings.filter(b => b.status === 'pending');

  const labelStyle = { fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, display: 'block', marginBottom: '4px' };
  const inputStyle = { width: '100%', padding: '8px 10px', fontSize: '13px', border: `1px solid ${RULE}`, fontFamily: 'inherit', boxSizing: 'border-box' };
  const btnStyle = (bg, color) => ({
    padding: '4px 10px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase', border: 'none', cursor: 'pointer', backgroundColor: bg, color,
  });

  return (
    <>
      <AdminPage
        title="Studio Access"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowHours(!showHours)} style={btnStyle('#EEE', INK)}>
              {showHours ? 'Close Hours' : 'Hours'}
            </button>
            <button onClick={() => setShowCreateForm(!showCreateForm)} style={btnStyle(TC, '#FFF')}>
              + Create Booking
            </button>
          </div>
        }
      >

        {/* Calendar strip */}
        <div ref={stripRef} style={{ display: 'flex', gap: '4px', overflowX: 'auto', marginBottom: '24px', paddingBottom: '4px' }}>
          {strip.map(d => {
            const key = fmtKey(d);
            const isSelected = key === selectedDateStr;
            const isClosed = hoursSettings ? !resolveHours(hoursSettings, key) : false;
            const count = bookingDates[key] || 0;
            return (
              <div key={key} onClick={() => !isClosed && setSelectedDate(d)} style={{
                minWidth: '48px', padding: '8px 4px', textAlign: 'center', cursor: isClosed ? 'default' : 'pointer',
                backgroundColor: isSelected ? TC : count > 0 ? TC_LIGHT : '#FFF',
                border: `1px solid ${isSelected ? TC : count > 0 ? TC : RULE}`,
                opacity: isClosed ? 0.3 : 1, flexShrink: 0,
              }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: isSelected ? '#FFF' : MUTED, textTransform: 'uppercase' }}>
                  {DAY_LABELS[d.getDay()]}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: isSelected ? '#FFF' : INK }}>
                  {d.getDate()}
                </div>
                <div style={{ fontSize: '8px', color: isSelected ? 'rgba(255,255,255,0.7)' : MUTED, textTransform: 'uppercase' }}>
                  {MONTH_LABELS[d.getMonth()]}
                </div>
                {count > 0 && (
                  <div style={{ fontSize: '8px', fontWeight: 700, color: isSelected ? '#FFF' : TC, marginTop: '2px' }}>
                    {count}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Hours editor */}
        {showHours && hoursSettings && (
          <div style={{ backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, padding: '20px', marginBottom: '24px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TC, marginBottom: '4px' }}>
              Bookable Hours
            </div>
            <div style={{ fontSize: '11px', color: MUTED, marginBottom: '16px', lineHeight: 1.5 }}>
              When enrolled students can book paid studio access. Separate from the studio's operating
              hours for members, which are set under Memberships.
            </div>

            {hoursError && (
              <div style={{ padding: '8px 10px', backgroundColor: '#FFEBEE', color: '#C62828', fontSize: '11px', marginBottom: '12px' }}>
                {hoursError}
              </div>
            )}

            {/* Weekly baseline */}
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '8px' }}>
              Every week
            </div>
            <div style={{ border: `1px solid ${RULE}`, marginBottom: '20px' }}>
              {WEEKDAY_ORDER.map((dow, i) => {
                const raw = hoursSettings.weekly[String(dow)];
                const win = raw && !raw.closed ? raw : null;
                return (
                  <div key={dow} style={{
                    display: 'grid', gridTemplateColumns: '100px 1fr 1fr 90px', gap: '8px', alignItems: 'center',
                    padding: '8px 10px', borderBottom: i < 6 ? `1px solid ${RULE}` : 'none',
                    backgroundColor: win ? '#FFF' : '#FAFAFA',
                  }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: win ? INK : MUTED }}>{WEEKDAY_NAMES[dow]}</span>
                    <input
                      type="time" step="1800" disabled={!win}
                      value={win ? win.open : ''}
                      onChange={(e) => setWeekday(dow, { ...win, open: e.target.value })}
                      style={{ ...inputStyle, opacity: win ? 1 : 0.4 }}
                    />
                    <input
                      type="time" step="1800" disabled={!win}
                      value={win ? win.close : ''}
                      onChange={(e) => setWeekday(dow, { ...win, close: e.target.value })}
                      style={{ ...inputStyle, opacity: win ? 1 : 0.4 }}
                    />
                    <label style={{ fontSize: '11px', color: MUTED, display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!win}
                        onChange={(e) => setWeekday(dow, e.target.checked ? null : { open: '11:00', close: '18:00' })}
                      />
                      Closed
                    </label>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '24px' }}>
              <button onClick={fetchHours} disabled={savingHours} style={btnStyle('#EEE', INK)}>Revert</button>
              <button onClick={saveWeekly} disabled={savingHours} style={{ ...btnStyle(TC, '#FFF'), opacity: savingHours ? 0.5 : 1 }}>
                {savingHours ? 'Saving...' : 'Save Weekly Hours'}
              </button>
            </div>

            {/* Date overrides */}
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '8px' }}>
              One-off dates
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.4fr 80px 90px', gap: '8px', alignItems: 'end', marginBottom: '12px' }}>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={ovDate} min={todayStr} onChange={(e) => setOvDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Open</label>
                <input type="time" step="1800" disabled={ovClosed} value={ovOpen} onChange={(e) => setOvOpen(e.target.value)} style={{ ...inputStyle, opacity: ovClosed ? 0.4 : 1 }} />
              </div>
              <div>
                <label style={labelStyle}>Close</label>
                <input type="time" step="1800" disabled={ovClosed} value={ovClose} onChange={(e) => setOvClose(e.target.value)} style={{ ...inputStyle, opacity: ovClosed ? 0.4 : 1 }} />
              </div>
              <div>
                <label style={labelStyle}>Note (shown to students)</label>
                <input type="text" value={ovNote} onChange={(e) => setOvNote(e.target.value)} placeholder="e.g. Public holiday" style={inputStyle} />
              </div>
              <label style={{ fontSize: '11px', color: MUTED, display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', paddingBottom: '9px' }}>
                <input type="checkbox" checked={ovClosed} onChange={(e) => setOvClosed(e.target.checked)} />
                Closed
              </label>
              <button onClick={addOverride} disabled={savingHours} style={{ ...btnStyle(TC, '#FFF'), padding: '8px 10px', opacity: savingHours ? 0.5 : 1 }}>
                Add
              </button>
            </div>

            {(() => {
              const dates = Object.keys(hoursSettings.overrides || {}).filter(d => d >= todayStr).sort();
              if (dates.length === 0) {
                return <div style={{ fontSize: '11px', color: MUTED, fontStyle: 'italic' }}>No upcoming one-off changes.</div>;
              }
              return (
                <div style={{ border: `1px solid ${RULE}` }}>
                  {dates.map((date, i) => {
                    const raw = hoursSettings.overrides[date];
                    const win = raw && !raw.closed ? raw : null;
                    const count = (bookingTimes[date] || []).length;
                    return (
                      <div key={date} style={{
                        display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 10px',
                        borderBottom: i < dates.length - 1 ? `1px solid ${RULE}` : 'none',
                      }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, minWidth: '92px' }}>{date}</span>
                        <span style={{ fontSize: '12px', color: win ? INK : '#C62828', minWidth: '120px' }}>
                          {win ? `${fmt24to12(win.open)} – ${fmt24to12(win.close)}` : 'Closed'}
                        </span>
                        <span style={{ fontSize: '11px', color: MUTED, flex: 1 }}>{raw?.note || ''}</span>
                        {count > 0 && (
                          <span style={{ fontSize: '10px', fontWeight: 700, color: TC }}>
                            {count} booking{count === 1 ? '' : 's'}
                          </span>
                        )}
                        <button onClick={() => removeOverride(date)} disabled={savingHours} style={btnStyle('#EEE', INK)}>Remove</button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* Create form */}
        {showCreateForm && (
          <div style={{ backgroundColor: '#FFFFFF', border: `1px solid ${RULE}`, padding: '20px', marginBottom: '24px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TC, marginBottom: '16px' }}>
              New Booking
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Student</label>
                {selectedStudent ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{selectedStudent.first_name} {selectedStudent.last_name}</span>
                    <button onClick={() => { setSelectedStudent(null); setSearchQuery(''); }} style={{ ...btnStyle('#EEE', INK), fontSize: '9px' }}>Change</button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => searchStudents(e.target.value)}
                      placeholder="Search by name or email..."
                      style={inputStyle}
                    />
                    {searchResults.length > 0 && (
                      <div style={{ border: `1px solid ${RULE}`, borderTop: 'none', maxHeight: '160px', overflowY: 'auto' }}>
                        {searchResults.map(s => (
                          <div
                            key={s.id}
                            onClick={() => { setSelectedStudent(s); setSearchResults([]); }}
                            style={{ padding: '8px 10px', fontSize: '12px', cursor: 'pointer', borderBottom: `1px solid ${RULE}` }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F5F3F0'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            {s.first_name} {s.last_name} <span style={{ color: MUTED }}>· {s.email}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Start Time</label>
                <select value={newStartTime} onChange={(e) => setNewStartTime(e.target.value)} style={inputStyle}>
                  {(() => {
                    const win = resolveHours(hoursSettings, newDate);
                    if (!win) return <option value="">Closed this date</option>;
                    const from = parseInt(win.open.split(':')[0], 10);
                    const to = parseInt(win.close.split(':')[0], 10);
                    return Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i).map(h => (
                      <option key={h} value={`${String(h).padStart(2, '0')}:00`}>{fmt24to12(`${h}:00`)}</option>
                    ));
                  })()}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <input type="text" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Student notes" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Admin Notes</label>
                <input type="text" value={newAdminNotes} onChange={(e) => setNewAdminNotes(e.target.value)} placeholder="Internal notes" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreateForm(false)} style={btnStyle('#EEE', INK)}>Cancel</button>
              <button onClick={handleCreate} disabled={!selectedStudent || !newStartTime || creating} style={{ ...btnStyle(TC, '#FFF'), opacity: !selectedStudent || !newStartTime || creating ? 0.5 : 1 }}>
                {creating ? 'Creating...' : 'Create Booking'}
              </button>
            </div>
          </div>
        )}

        {/* Pending bookings */}
        {pendingBookings.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#F57F17', marginBottom: '12px' }}>
              Pending Confirmation ({pendingBookings.length})
            </div>
            <div style={{ backgroundColor: '#FFFFFF', border: `2px solid #FFF8E1` }}>
              {pendingBookings.map((b, i) => (
                <div key={b.id} style={{ padding: '14px 16px', borderBottom: i < pendingBookings.length - 1 ? `1px solid ${RULE}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>
                      {b.customer ? `${b.customer.first_name} ${b.customer.last_name}` : 'Unknown'}
                    </div>
                    <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>
                      {(() => { const bd = new Date(b.booking_date + 'T12:00:00'); return `${DAY_LABELS[bd.getDay()]} ${bd.getDate()} ${MONTH_LABELS[bd.getMonth()]}`; })()} · From {fmt24to12(b.start_time)} · Min {b.hours}h · From ${b.amount_sgd}
                    </div>
                    {b.notes && <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px', fontStyle: 'italic' }}>"{b.notes}"</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => handleConfirm(b.id)} style={btnStyle('#2E7D32', '#FFF')}>Confirm</button>
                    <button onClick={() => handleCancel(b.id)} style={btnStyle('#C62828', '#FFF')}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All bookings */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED }}>
              {loading ? 'Loading bookings...' : `Bookings — ${filteredBookings.length} total`}
            </div>
            {cancelledCount > 0 && (
              <button
                onClick={() => setShowCancelled(!showCancelled)}
                style={{ fontSize: '10px', fontWeight: 600, color: MUTED, background: 'none', border: `1px solid ${RULE}`, padding: '3px 10px', cursor: 'pointer' }}
              >
                {showCancelled ? 'Hide' : 'Show'} cancelled ({cancelledCount})
              </button>
            )}
          </div>

          <div style={{ backgroundColor: '#FFFFFF', border: `1px solid ${RULE}` }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 0.6fr 0.5fr 0.5fr 0.7fr 1.5fr', gap: '8px', padding: '10px 16px', borderBottom: `1px solid ${RULE}`, backgroundColor: '#FAFAFA' }}>
              <span
                onClick={() => setSortBy(sortBy === 'name' ? 'name_desc' : sortBy === 'name_desc' ? 'date' : 'name')}
                style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: sortBy.startsWith('name') ? TC : MUTED, cursor: 'pointer' }}
              >
                Student {sortBy === 'name' ? '↑' : sortBy === 'name_desc' ? '↓' : ''}
              </span>
              {['Date', 'Start', 'Hours', 'Amount', 'Status', 'Actions'].map(h => (
                <span key={h} style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>{h}</span>
              ))}
            </div>
            {loading ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
                Loading bookings...
              </div>
            ) : filteredBookings.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: MUTED, fontSize: '13px' }}>
                No bookings for this date
              </div>
            ) : filteredBookings.length > 0 && pendingBookings.length === filteredBookings.length ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', color: MUTED, fontSize: '12px' }}>
                All bookings are pending — see above
              </div>
            ) : (
              filteredBookings.map((b, i) => {
                  const bd = new Date(b.booking_date + 'T12:00:00');
                  return (
                  <div key={b.id} style={{
                    display: 'grid', gridTemplateColumns: '1.8fr 1fr 0.6fr 0.5fr 0.5fr 0.7fr 1.5fr', gap: '8px',
                    padding: '12px 16px', borderBottom: i < filteredBookings.length - 1 ? `1px solid ${RULE}` : 'none',
                    alignItems: 'center', opacity: b.status === 'cancelled' ? 0.5 : 1,
                  }}>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>
                        {b.customer ? (
                          <Link to={`/admin/students/${encodeURIComponent(b.customer.email)}`} style={{ color: INK, textDecoration: 'none' }}>
                            {b.customer.first_name} {b.customer.last_name}
                          </Link>
                        ) : 'Unknown'}
                      </span>
                      {b.created_at && (
                        <div style={{ fontSize: '9px', color: MUTED, marginTop: '2px' }}>
                          Booked {new Date(b.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} {new Date(b.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                      {b.amount_sgd === 0 && b.passes?.total > 0 && (
                        <div style={{ fontSize: '9px', fontWeight: 700, color: TC, marginTop: '2px' }}>
                          Pass · {b.passes.remaining}/{b.passes.total} left
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '12px' }}>{DAY_LABELS[bd.getDay()]} {bd.getDate()} {MONTH_LABELS[bd.getMonth()]}</span>
                    <span style={{ fontSize: '12px' }}>{fmt24to12(b.start_time)}</span>
                    <span style={{ fontSize: '12px' }}>{b.hours}h</span>
                    <div>
                      <span style={{ fontSize: '12px' }}>${b.amount_sgd}</span>
                      {b.fee && b.fee.payment_status === 'pending' && (
                        <button
                          onClick={() => handleMarkPaid(b.fee.id)}
                          style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#C62828', background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginTop: '2px' }}
                        >${b.fee.amount} owed</button>
                      )}
                    </div>
                    <StatusPill status={b.status} />
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {b.status === 'pending' && <button onClick={() => handleConfirm(b.id)} style={btnStyle('#2E7D32', '#FFF')}>Confirm</button>}
                      {b.status === 'booked' && (
                        <button onClick={() => setAttendedModal({ id: b.id, hours: b.hours || 2, hasPass: b.amount_sgd === 0 && b.passes?.total > 0 })} style={btnStyle('#1565C0', '#FFF')}>Attended</button>
                      )}
                      {b.status !== 'cancelled' && b.status !== 'attended' && (
                        <button onClick={() => handleCancel(b.id)} style={btnStyle('#EEE', '#C62828')}>Cancel</button>
                      )}
                      <button onClick={() => handleDelete(b.id)} style={btnStyle('#EEE', '#999')}>Delete</button>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
        </div>

      </AdminPage>

      {/* Attended modal — settle actual hours */}
      {attendedModal && (
        <>
          <div onClick={() => setAttendedModal(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 100 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 101,
            backgroundColor: '#FFFFFF', padding: '24px', width: '320px', border: `2px solid ${TC}`,
          }}>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: TC, marginBottom: '16px' }}>
              Mark as Attended
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Actual Hours</label>
              <select
                value={attendedModal.hours}
                onChange={(e) => setAttendedModal({ ...attendedModal, hours: parseInt(e.target.value, 10) })}
                style={inputStyle}
              >
                {[2, 3, 4, 5, 6, 7, 8].map(h => (
                  <option key={h} value={h}>{h} hours — ${h * 20}</option>
                ))}
              </select>
            </div>
            <div style={{ fontSize: '12px', color: MUTED, marginBottom: '16px' }}>
              Amount: <strong style={{ color: TC }}>{attendedModal.hasPass ? '$0 (Studio Pass)' : `$${attendedModal.hours * 20}`}</strong>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setAttendedModal(null)} style={btnStyle('#EEE', INK)}>Cancel</button>
              <button onClick={handleAttended} style={btnStyle('#1565C0', '#FFF')}>Confirm Attended</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
