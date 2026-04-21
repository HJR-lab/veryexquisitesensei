import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import ImpersonationBanner from '../components/ImpersonationBanner';

// ─── Design tokens ────────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

// ─── Date helpers ─────────────────────────────────────────────────────────────
const DAY_LABELS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function fmtKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmt24to12(t) {
  const h = parseInt(t.split(':')[0], 10);
  const suffix = h >= 12 ? 'pm' : 'am';
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}${suffix}`;
}

// ─── Status pill ──────────────────────────────────────────────────────────────
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
      display: 'inline-block', fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase', padding: '2px 8px', backgroundColor: c.bg, color: c.color,
    }}>
      {c.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function StudioAccess() {
  const { user } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [availability, setAvailability] = useState(null);
  const [myBookings, setMyBookings] = useState({ upcoming: [], past: [] });
  const [startTime, setStartTime] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [showConfirmSheet, setShowConfirmSheet] = useState(false);
  const [usePass, setUsePass] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const stripRef = useRef(null);

  // Check if user has active membership
  const hasActiveMembership = user?.membershipStatus === 'active' || user?.role === 'member';

  // 60-day strip
  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);
  const strip = Array.from({ length: 60 }, (_, i) => addDays(TODAY, i));

  // Dates with existing bookings (for dot indicator)
  const bookingDates = new Set((myBookings.upcoming || []).map(b => b.booking_date));

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchMyBookings();
  }, []);

  useEffect(() => {
    fetchAvailability(fmtKey(selectedDate));
  }, [selectedDate]);

  // ── Fetch helpers ──────────────────────────────────────────────────────────
  const fetchMyBookings = async () => {
    try {
      const { data } = await api.get('/studio-access/my-bookings');
      setMyBookings(data);
    } catch (err) {
      console.error('Failed to fetch bookings:', err);
    }
  };

  const fetchAvailability = async (dateStr) => {
    try {
      setLoading(true);
      const { data } = await api.get(`/studio-access/availability?date=${dateStr}`);
      setAvailability(data);

      // Auto-set default start time
      if (data && !data.closed && data.openTime) {
        setStartTime(data.openTime);
      }
    } catch (err) {
      console.error('Failed to fetch availability:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Time slot options ──────────────────────────────────────────────────────
  const getTimeOptions = () => {
    if (!availability || availability.closed) return [];
    const openH = parseInt(availability.openTime.split(':')[0], 10);
    const closeH = parseInt(availability.closeTime.split(':')[0], 10);
    const slots = [];
    for (let h = openH; h < closeH; h++) {
      slots.push(String(h).padStart(2, '0') + ':00');
    }
    return slots;
  };

  // ── Computed ───────────────────────────────────────────────────────────────
  const canBook = availability && !availability.closed && availability.spotsLeft > 0 && startTime;

  // ── Book handler ───────────────────────────────────────────────────────────
  const handleBook = async () => {
    try {
      setBookingLoading(true);
      setError('');
      const dateStr = fmtKey(selectedDate);

      const { data } = await api.post('/studio-access/book', {
        date: dateStr,
        startTime,
        notes: notes || undefined,
        usePass: usePass || undefined,
      });

      setSuccess(data.message);
      setShowConfirmSheet(false);
      setNotes('');
      fetchMyBookings();
      fetchAvailability(dateStr);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to book');
    } finally {
      setBookingLoading(false);
    }
  };

  // ── Cancel handler ─────────────────────────────────────────────────────────
  const handleCancel = async (bookingId) => {
    try {
      await api.put(`/studio-access/bookings/${bookingId}/cancel`);
      fetchMyBookings();
      fetchAvailability(fmtKey(selectedDate));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel');
    }
  };

  // Can cancel? (2hrs before start)
  const canCancelBooking = (booking) => {
    if (booking.status === 'cancelled' || booking.status === 'attended') return false;
    const start = new Date(`${booking.booking_date}T${booking.start_time}:00`);
    const now = new Date();
    return (start - now) / (1000 * 60 * 60) >= 2;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'Atak, sans-serif', color: INK, backgroundColor: '#FFFFFF', minHeight: '100vh' }}>
      <ImpersonationBanner />

      {/* TopBar */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        backgroundColor: '#FFFFFF', borderBottom: `1px solid ${RULE}`,
      }}>
        <div style={{ maxWidth: '520px', margin: '0 auto', padding: '0 20px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src="https://ves.sg/cdn/shop/files/logo_04a04687-57f4-4141-b0bc-ec30b527fd73.png?v=1686045719&width=600"
            alt="VES"
            style={{ height: '26px', width: 'auto' }}
          />
        </div>
      </header>

      {/* Scrollable body */}
      <div style={{ maxWidth: '520px', margin: '0 auto', padding: '20px 20px 100px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>Studio Access</h1>
          <p style={{ fontSize: '12px', color: MUTED, margin: '4px 0 0' }}>Book independent wheel time · $20/hr · Min 2hrs</p>
        </div>

        {/* Studio Access Passes */}
        {myBookings.passes?.total > 0 && (
          <div style={{
            padding: '16px', backgroundColor: myBookings.passes.remaining > 0 ? TC_LIGHT : '#F5F5F5',
            border: `1px solid ${myBookings.passes.remaining > 0 ? TC : '#DDD'}`,
            marginBottom: '24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: myBookings.passes.remaining > 0 ? TC_DARK : MUTED, marginBottom: '4px' }}>
                  Studio Access Passes
                </div>
                <div style={{ fontSize: '12px', color: INK }}>
                  {myBookings.passes.remaining > 0
                    ? `${myBookings.passes.remaining} of ${myBookings.passes.total} passes remaining — free, no time limit`
                    : 'All passes used'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[...Array(myBookings.passes.total)].map((_, i) => (
                  <div key={i} style={{
                    width: '14px', height: '14px', borderRadius: '50%',
                    backgroundColor: i < myBookings.passes.remaining ? TC : '#DDD',
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Member view */}
        {hasActiveMembership && (
          <div style={{
            padding: '20px', backgroundColor: TC_LIGHT, border: `1px solid ${TC}`,
            marginBottom: '24px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: TC_DARK, marginBottom: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '6px' }}>card_membership</span>
              Unlimited Studio Access
            </div>
            <p style={{ fontSize: '12px', color: INK, margin: 0, lineHeight: 1.5 }}>
              Members have unlimited studio access — no booking required. Just drop in during open hours!
            </p>
            <div style={{ marginTop: '12px', fontSize: '11px', color: MUTED }}>
              Mon–Thu 11am – 6pm &nbsp;·&nbsp; Fri & Sun 12pm – 7pm &nbsp;·&nbsp; Sat Closed
            </div>
          </div>
        )}

        {/* Success/Error messages */}
        {success && (
          <div style={{ padding: '12px 16px', backgroundColor: '#E8F5E9', color: '#2E7D32', fontSize: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={() => setSuccess('')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check_circle</span>
            {success}
          </div>
        )}
        {error && (
          <div style={{ padding: '12px 16px', backgroundColor: '#FFEBEE', color: '#C62828', fontSize: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={() => setError('')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>error</span>
            {error}
          </div>
        )}

        {/* My Bookings strip */}
        {myBookings.upcoming.length > 0 && (
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED }}>
                Upcoming Bookings
              </span>
            </div>
            {myBookings.upcoming.slice(0, 3).map(b => {
              const d = new Date(b.booking_date + 'T12:00:00');
              return (
                <div key={b.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 0', borderBottom: `1px solid ${RULE}`,
                }}>
                  {/* Date block */}
                  <div style={{ width: '44px', textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>
                      {DAY_LABELS[d.getDay()]}
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1.1 }}>{d.getDate()}</div>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>
                      {MONTH_LABELS[d.getMonth()]}
                    </div>
                  </div>
                  {/* Divider */}
                  <div style={{ width: '1px', height: '36px', backgroundColor: RULE, flexShrink: 0 }} />
                  {/* Details */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>
                      From {fmt24to12(b.start_time)}
                    </div>
                    <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>
                      {b.status === 'attended' ? `${b.hours}h · $${b.amount_sgd}` : `Min ${b.hours}h · From $${b.amount_sgd}`}
                    </div>
                  </div>
                  {/* Status + Cancel */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <StatusPill status={b.status} />
                    {canCancelBooking(b) && (
                      <button
                        onClick={() => handleCancel(b.id)}
                        style={{
                          fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                          color: '#C62828', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Date strip */}
        {!hasActiveMembership && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED }}>
                Select a Date
              </span>
            </div>
            <div
              ref={stripRef}
              style={{
                display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '8px',
                scrollbarWidth: 'none', msOverflowStyle: 'none',
                WebkitOverflowScrolling: 'touch', marginBottom: '24px',
              }}
            >
              {strip.map(d => {
                const key = fmtKey(d);
                const sel = fmtKey(selectedDate) === key;
                const isSat = d.getDay() === 6;
                const hasBooking = bookingDates.has(key);
                return (
                  <button
                    key={key}
                    disabled={isSat}
                    onClick={() => setSelectedDate(d)}
                    style={{
                      flexShrink: 0, width: '48px', padding: '8px 0',
                      border: sel ? `2px solid ${TC}` : `1px solid ${RULE}`,
                      backgroundColor: sel ? TC_LIGHT : isSat ? '#F5F5F5' : '#FFFFFF',
                      cursor: isSat ? 'not-allowed' : 'pointer',
                      opacity: isSat ? 0.4 : 1,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                      position: 'relative',
                    }}
                  >
                    <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: sel ? TC : MUTED }}>
                      {DAY_LABELS[d.getDay()]}
                    </span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: sel ? TC_DARK : INK }}>
                      {d.getDate()}
                    </span>
                    <span style={{ fontSize: '9px', color: sel ? TC : MUTED }}>
                      {MONTH_LABELS[d.getMonth()]}
                    </span>
                    {hasBooking && (
                      <span style={{
                        position: 'absolute', bottom: '3px', left: '50%', transform: 'translateX(-50%)',
                        width: '4px', height: '4px', borderRadius: '50%', backgroundColor: TC,
                      }} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected date panel */}
            {availability && (
              <div style={{ marginBottom: '24px' }}>
                {availability.closed ? (
                  <div style={{ padding: '24px', backgroundColor: ALT, textAlign: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '32px', color: MUTED, display: 'block', marginBottom: '8px' }}>event_busy</span>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>Studio Closed</div>
                    <div style={{ fontSize: '11px', color: MUTED, marginTop: '4px' }}>The studio is closed on Saturdays</div>
                  </div>
                ) : (
                  <>
                    {/* Hours & availability */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{availability.hoursLabel}</div>
                        <div style={{ fontSize: '11px', color: MUTED, marginTop: '2px' }}>
                          {DAY_LABELS[selectedDate.getDay()]}, {selectedDate.getDate()} {MONTH_LABELS[selectedDate.getMonth()]}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{
                          fontSize: '13px', fontWeight: 700,
                          color: availability.spotsLeft === 0 ? '#C62828' : availability.spotsLeft <= 3 ? '#F57F17' : '#2E7D32',
                        }}>
                          {availability.spotsLeft === 0 ? 'Fully Booked' : `${availability.spotsLeft} of ${availability.maxCapacity} spots`}
                        </div>
                      </div>
                    </div>

                    {availability.spotsLeft > 0 && (
                      <>
                        {/* Start time picker */}
                        <div style={{ marginBottom: '12px' }}>
                          <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, display: 'block', marginBottom: '6px' }}>
                            Start Time
                          </label>
                          <select
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            style={{
                              width: '100%', padding: '10px 12px', fontSize: '14px', fontWeight: 600,
                              border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', color: INK,
                              fontFamily: 'inherit', appearance: 'none',
                              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23888888' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`,
                              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
                            }}
                          >
                            {getTimeOptions().map(t => (
                              <option key={t} value={t}>{fmt24to12(t)}</option>
                            ))}
                          </select>
                        </div>

                        {/* Pricing info */}
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '12px 16px', backgroundColor: ALT, marginBottom: '12px',
                        }}>
                          <span style={{ fontSize: '13px', color: MUTED }}>Min 2 hours</span>
                          <span style={{ fontSize: '16px', fontWeight: 700, color: TC }}>From $40</span>
                        </div>

                        {/* Notes */}
                        <input
                          type="text"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Notes (optional)"
                          style={{
                            width: '100%', padding: '10px 12px', fontSize: '12px',
                            border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF', color: INK,
                            fontFamily: 'inherit', marginBottom: '16px', boxSizing: 'border-box',
                          }}
                        />

                        {/* Book button */}
                        <button
                          disabled={!canBook}
                          onClick={() => setShowConfirmSheet(true)}
                          style={{
                            width: '100%', padding: '14px', border: 'none',
                            backgroundColor: canBook ? TC : '#DDD',
                            color: canBook ? '#FFF' : '#999',
                            fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                            cursor: canBook ? 'pointer' : 'not-allowed',
                            fontFamily: 'inherit',
                          }}
                        >
                          Book Studio Access
                        </button>

                        {/* Same-day notice */}
                        {availability.isSameDay && (
                          <div style={{ fontSize: '11px', color: '#F57F17', marginTop: '8px', textAlign: 'center' }}>
                            Same-day bookings require admin confirmation
                          </div>
                        )}

                        {/* Price info */}
                        <div style={{ fontSize: '10px', color: MUTED, marginTop: '12px', textAlign: 'center' }}>
                          Actual hours settled after your session · Payment via QR in-studio
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Past bookings */}
        {myBookings.past.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '14px' }}>
              Recent Sessions
            </div>
            {myBookings.past.map(b => {
              const d = new Date(b.booking_date + 'T12:00:00');
              return (
                <div key={b.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 0', borderBottom: `1px solid ${RULE}`, opacity: 0.6,
                }}>
                  <div>
                    <span style={{ fontSize: '12px' }}>
                      {DAY_LABELS[d.getDay()]} {d.getDate()} {MONTH_LABELS[d.getMonth()]}
                    </span>
                    <span style={{ fontSize: '11px', color: MUTED, marginLeft: '8px' }}>
                      From {fmt24to12(b.start_time)} · {b.hours}h · ${b.amount_sgd}
                    </span>
                  </div>
                  <StatusPill status={b.status} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation bottom sheet */}
      {showConfirmSheet && (
        <>
          <div onClick={() => setShowConfirmSheet(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 60 }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 61,
            backgroundColor: '#FFFFFF', borderTop: `2px solid ${TC}`,
            maxWidth: '520px', margin: '0 auto', padding: '24px 20px 40px',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>
              Confirm Booking
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>Studio Access</div>
            <div style={{ fontSize: '13px', color: MUTED, marginBottom: '16px' }}>
              {DAY_LABELS[selectedDate.getDay()]}, {selectedDate.getDate()} {MONTH_LABELS[selectedDate.getMonth()]} · From {fmt24to12(startTime)}
            </div>

            {myBookings.passes?.remaining > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', backgroundColor: usePass ? TC_LIGHT : '#F5F5F5', border: `1px solid ${usePass ? TC : '#DDD'}`, marginBottom: '16px', cursor: 'pointer' }}
                onClick={() => setUsePass(!usePass)}
              >
                <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${usePass ? TC : '#CCC'}`, backgroundColor: usePass ? TC : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {usePass && <span style={{ color: '#FFF', fontSize: '12px', fontWeight: 700 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: usePass ? TC_DARK : INK }}>Use Studio Pass</div>
                  <div style={{ fontSize: '11px', color: MUTED }}>{myBookings.passes.remaining} pass{myBookings.passes.remaining !== 1 ? 'es' : ''} remaining · Free, no time limit</div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}`, marginBottom: '16px' }}>
              <span style={{ fontSize: '13px' }}>{usePass ? 'Studio Pass' : 'Minimum'}</span>
              <span style={{ fontSize: '13px', fontWeight: 700 }}>{usePass ? 'Free — no time limit' : '2 hours · $40'}</span>
            </div>
            <div style={{ fontSize: '11px', color: MUTED, marginBottom: '16px' }}>
              {usePass ? 'This pass covers your full session — stay as long as you like!' : 'Actual hours and amount will be settled after your session. You only pay for the time you use.'}
            </div>

            {availability?.isSameDay && (
              <div style={{ padding: '10px 14px', backgroundColor: '#FFF8E1', fontSize: '11px', color: '#F57F17', marginBottom: '16px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '6px' }}>schedule</span>
                Same-day booking — will require admin confirmation
              </div>
            )}

            {notes && (
              <div style={{ fontSize: '12px', color: MUTED, marginBottom: '16px' }}>
                Note: {notes}
              </div>
            )}

            {!usePass && (
              <div style={{ fontSize: '11px', color: MUTED, marginBottom: '20px' }}>
                Payment via QR code in-studio after your session
              </div>
            )}

            <button
              onClick={handleBook}
              disabled={bookingLoading}
              style={{
                width: '100%', padding: '14px', border: 'none',
                backgroundColor: TC, color: '#FFF',
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: bookingLoading ? 'wait' : 'pointer',
                fontFamily: 'inherit', opacity: bookingLoading ? 0.7 : 1,
                marginBottom: '8px',
              }}
            >
              {bookingLoading ? 'Booking...' : 'Confirm Booking'}
            </button>
            <button
              onClick={() => setShowConfirmSheet(false)}
              style={{
                width: '100%', padding: '12px', border: 'none',
                backgroundColor: 'transparent', color: MUTED,
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}

    </div>
  );
}
