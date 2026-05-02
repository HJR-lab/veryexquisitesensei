import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
function useIsMobile(bp = 768) {
  const [m, setM] = useState(typeof window !== 'undefined' ? window.innerWidth < bp : false);
  useEffect(() => {
    const h = () => setM(window.innerWidth < bp);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [bp]);
  return m;
}

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

function fmt24to12(t) {
  if (!t) return '—';
  const h = parseInt(t.split(':')[0], 10);
  const suffix = h >= 12 ? 'pm' : 'am';
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}${suffix}`;
}

export default function AdminStudioAccess() {
  const isMobile = useIsMobile();
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

  useEffect(() => {
    fetchBookings();
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
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: isMobile ? '20px 16px 60px' : '32px 24px 60px' }}>

        {/* Page header */}
        <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TC, marginBottom: '6px' }}>
              Admin
            </div>
            <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 700, letterSpacing: '-0.3px', margin: 0 }}>
              Studio Access
            </h1>
          </div>
          <button onClick={() => setShowCreateForm(!showCreateForm)} style={btnStyle(TC, '#FFF')}>
            + Create Booking
          </button>
        </div>

        {/* Calendar strip */}
        <div ref={stripRef} style={{ display: 'flex', gap: '4px', overflowX: 'auto', marginBottom: '24px', paddingBottom: '4px' }}>
          {strip.map(d => {
            const key = fmtKey(d);
            const isSelected = key === selectedDateStr;
            const isSat = d.getDay() === 6;
            const count = bookingDates[key] || 0;
            return (
              <div key={key} onClick={() => !isSat && setSelectedDate(d)} style={{
                minWidth: '48px', padding: '8px 4px', textAlign: 'center', cursor: isSat ? 'default' : 'pointer',
                backgroundColor: isSelected ? TC : count > 0 ? TC_LIGHT : '#FFF',
                border: `1px solid ${isSelected ? TC : count > 0 ? TC : RULE}`,
                opacity: isSat ? 0.3 : 1, flexShrink: 0,
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
                  {Array.from({ length: 10 }, (_, i) => i + 10).map(h => (
                    <option key={h} value={`${String(h).padStart(2, '0')}:00`}>{fmt24to12(`${h}:00`)}</option>
                  ))}
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
              <button onClick={handleCreate} disabled={!selectedStudent || creating} style={{ ...btnStyle(TC, '#FFF'), opacity: !selectedStudent || creating ? 0.5 : 1 }}>
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
                        <div style={{ fontSize: '9px', marginTop: '2px' }}>
                          <div style={{ color: MUTED }}>${b.credit_applied} credit</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
                            <span style={{ color: '#C62828', fontWeight: 700 }}>${b.fee.amount} owed</span>
                            <button
                              onClick={() => handleMarkPaid(b.fee.id)}
                              style={{ fontSize: '8px', fontWeight: 700, color: '#2E7D32', background: '#E8F5E9', border: 'none', padding: '1px 6px', cursor: 'pointer', letterSpacing: '0.04em' }}
                            >PAID</button>
                          </div>
                        </div>
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
      </main>
    </div>
  );
}
